import { Controller, Get, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { inflateRawSync } from 'node:zlib'
import { toXlsxSheets } from '../common/xlsx'
import { AppError, ClientIp } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor, slugify } from './admin-common'
import { STRUCTURE_IMPORT_HEADERS, cepcaImportTemplateSheets } from './import-template'

const upload = FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2 } })
const HEADERS = STRUCTURE_IMPORT_HEADERS
type ImportRow = { row: number; code: string; name: string; parentCode: string; city?: string; phone?: string; email?: string; address?: string; serviceSchedule?: string }

function attach(res: Response, name: string, body: Buffer) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`)
  res.send(body)
}

function xmlText(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
}

function columnIndex(ref: string) {
  let result = 0
  for (const char of ref.replace(/\d/g, '')) result = result * 26 + char.charCodeAt(0) - 64
  return result - 1
}

/** Lit le premier onglet d'un .xlsx sans exécuter de formule ni interpréter de macro. */
function xlsxRows(buffer: Buffer): string[][] {
  const tailStart = Math.max(0, buffer.length - 65_557)
  let end = -1
  for (let i = buffer.length - 22; i >= tailStart; i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new AppError(400, 'IMPORT_FILE', 'Le fichier Excel est illisible.')
  const entries = new Map<string, Buffer>()
  let pos = buffer.readUInt32LE(end + 16)
  const limit = pos + buffer.readUInt32LE(end + 12)
  while (pos < limit && buffer.readUInt32LE(pos) === 0x02014b50) {
    const method = buffer.readUInt16LE(pos + 10)
    const compressedSize = buffer.readUInt32LE(pos + 20)
    const nameLength = buffer.readUInt16LE(pos + 28)
    const extraLength = buffer.readUInt16LE(pos + 30)
    const commentLength = buffer.readUInt16LE(pos + 32)
    const offset = buffer.readUInt32LE(pos + 42)
    const name = buffer.subarray(pos + 46, pos + 46 + nameLength).toString('utf8')
    const localNameLength = buffer.readUInt16LE(offset + 26)
    const localExtraLength = buffer.readUInt16LE(offset + 28)
    const data = buffer.subarray(offset + 30 + localNameLength + localExtraLength, offset + 30 + localNameLength + localExtraLength + compressedSize)
    if (method !== 0 && method !== 8) throw new AppError(400, 'IMPORT_FILE', 'Ce fichier Excel utilise une compression non prise en charge.')
    entries.set(name, method === 8 ? inflateRawSync(data) : data)
    pos += 46 + nameLength + extraLength + commentLength
  }
  const shared = (entries.get('xl/sharedStrings.xml')?.toString('utf8').match(/<si>([\s\S]*?)<\/si>/g) ?? []).map((s) => xmlText(s))
  const sheet = entries.get('xl/worksheets/sheet1.xml')?.toString('utf8')
  if (!sheet) throw new AppError(400, 'IMPORT_FILE', 'Le premier onglet du fichier Excel est introuvable.')
  const rows: string[][] = []
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cell[1])?.[1]
      if (!ref) continue
      const type = /\bt="([^"]+)"/.exec(cell[1])?.[1]
      const content = cell[2]
      const raw = type === 's' ? shared[Number(/<v>([\s\S]*?)<\/v>/.exec(content)?.[1])] ?? '' : xmlText(/<is>([\s\S]*?)<\/is>/.exec(content)?.[1] ?? /<v>([\s\S]*?)<\/v>/.exec(content)?.[1] ?? '')
      cells[columnIndex(ref)] = raw.trim()
    }
    rows.push(cells)
  }
  return rows
}

function csvRows(buffer: Buffer): string[][] {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += char; i++ } else quoted = !quoted
    } else if (!quoted && char === ';') { row.push(cell.trim()); cell = '' } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function parseRows(file: Express.Multer.File): ImportRow[] {
  const name = file.originalname.toLowerCase()
  const table = name.endsWith('.xlsx') ? xlsxRows(file.buffer) : name.endsWith('.csv') ? csvRows(file.buffer) : (() => { throw new AppError(400, 'IMPORT_FILE', 'Choisissez le modèle Excel (.xlsx) ou un fichier CSV.') })()
  const header = table.shift()?.map((x) => x.trim())
  if (!header || HEADERS.some((h, i) => header[i] !== h)) throw new AppError(400, 'IMPORT_COLUMNS', 'Les colonnes du modèle ont été modifiées. Téléchargez un nouveau modèle puis réessayez.')
  if (table.length === 0) throw new AppError(400, 'IMPORT_EMPTY', 'Le fichier ne contient aucune structure à importer.')
  if (table.length > 2_000) throw new AppError(400, 'IMPORT_LIMIT', 'Import limité à 2 000 lignes par fichier.')
  return table.map((r, i) => ({ row: i + 2, code: (r[0] ?? '').trim().toUpperCase(), name: (r[1] ?? '').trim(), parentCode: (r[2] ?? '').trim().toUpperCase(), city: (r[3] ?? '').trim() || undefined, phone: (r[4] ?? '').trim() || undefined, email: (r[5] ?? '').trim().toLowerCase() || undefined, address: (r[6] ?? '').trim() || undefined, serviceSchedule: (r[7] ?? '').trim() || undefined }))
}

@Controller('admin/imports')
@UseGuards(StaffGuard)
export class AdminImportsController {
  constructor(private readonly prisma: PrismaService, private readonly scope: AdminScope, private readonly audit: AuditService) {}

  @Get('structures/template')
  async template(@CurrentUser() p: Principal, @Res() res: Response) {
    const paths = this.scope.access.scopePaths(p, 'STRUCTURES', 'write')
    if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', 'Vous ne pouvez pas importer des structures.')
    attach(res, 'modele-collecte-cepca', toXlsxSheets(cepcaImportTemplateSheets()))
  }

  @Post('structures')
  @UseInterceptors(upload)
  async structures(@CurrentUser() p: Principal, @UploadedFile() file: Express.Multer.File | undefined, @ClientIp() ip: string | null) {
    if (!file) throw new AppError(400, 'IMPORT_FILE', 'Ajoutez un fichier Excel ou CSV.')
    const rows = parseRows(file)
    const paths = this.scope.access.scopePaths(p, 'STRUCTURES', 'write')
    if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', 'Vous ne pouvez pas importer des structures.')
    const existing = await this.prisma.structure.findMany({ where: this.scope.access.pathFilter(paths), select: { id: true, code: true, name: true, path: true, confessionId: true, levelTypeId: true, depth: true } })
    const byCode = new Map<string, (typeof existing)[number]>()
    for (const s of existing) {
      if (byCode.has(s.code)) throw new AppError(400, 'IMPORT_SCOPE', `Le code parent « ${s.code} » existe plusieurs fois dans votre périmètre. Importez cette branche séparément.`)
      byCode.set(s.code, s)
    }
    const codes = new Set<string>()
    for (const r of rows) {
      if (!/^[A-Z0-9]{2,12}$/.test(r.code)) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : le code doit contenir 2 à 12 lettres majuscules ou chiffres.`)
      if (!r.name || r.name.length < 3 || r.name.length > 160 || /^[=+\-@]/.test(r.name)) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : nom de structure invalide.`)
      if (!r.parentCode) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : le code parent est obligatoire.`)
      if (codes.has(r.code) || byCode.has(r.code)) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : le code « ${r.code} » existe déjà.`)
      if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : e-mail invalide.`)
      if (r.phone && !/^\+\d{8,15}$/.test(r.phone.replace(/\s/g, ''))) throw new AppError(400, 'IMPORT_ROW', `Ligne ${r.row} : téléphone au format international attendu, ex. +237699000000.`)
      codes.add(r.code)
    }
    let created = 0
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const parent = byCode.get(r.parentCode)
        if (!parent) throw new AppError(400, 'IMPORT_ORDER', `Ligne ${r.row} : le parent « ${r.parentCode} » est introuvable. Il doit déjà exister ou apparaître avant cette ligne.`)
        if (!parent.confessionId) throw new AppError(400, 'IMPORT_CONFESSION', `Ligne ${r.row} : créez d'abord la confession « ${r.parentCode} » avec sa hiérarchie.`)
        this.scope.access.assert(p, 'STRUCTURES', 'write', parent.path, 'Structure parente')
        const level = await tx.levelType.findFirst({ where: { parentId: parent.levelTypeId, confessionId: parent.confessionId } })
        if (!level) throw new AppError(400, 'IMPORT_LEVEL', `Ligne ${r.row} : « ${parent.name} » ne peut pas recevoir de sous-structure.`)
        const base = slugify(r.name)
        let slug = base
        for (let n = 2; await tx.structure.findUnique({ where: { parentId_slug: { parentId: parent.id, slug } }, select: { id: true } }); n++) slug = `${base}-${n}`
        const s = await tx.structure.create({ data: { confessionId: parent.confessionId, levelTypeId: level.id, parentId: parent.id, slug, path: `${parent.path}${slug}/`, depth: parent.depth + 1, name: r.name, code: r.code, city: r.city, phone: r.phone?.replace(/\s/g, ''), email: r.email, address: r.address, serviceSchedule: r.serviceSchedule, status: 'CONFIGURATION' } })
        byCode.set(r.code, s)
        created++
      }
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A importé ${created} structure(s) depuis ${file.originalname}`, entityType: 'StructureImport', entityId: file.originalname, structurePath: paths[0], metadata: { created } }, tx)
    })
    return { created }
  }
}
