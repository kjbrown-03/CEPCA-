import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Throttle } from '@nestjs/throttler'
import type { Module, Prisma } from '@prisma/client'
import type { Response } from 'express'
import { diskStorage, memoryStorage } from 'multer'
import { randomBytes } from 'node:crypto'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { z } from 'zod'
import { adminDocumentSchema, adminSermonSchema, updateDocumentSchema, updateSermonSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { StorageService, asciiName, mediaUrl } from '../storage/storage.service'
import { ACCEPT, EXT, sniff, type Kind } from '../storage/sniff'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { assertImageKey } from './publications.controller'

const MB = 1024 * 1024
const UPLOAD_LIMIT = { default: { limit: 30, ttl: 10 * 60 * 1000 } }
const imageUpload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * MB, files: 1, fields: 5 } })
const docUpload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * MB, files: 1, fields: 10 } })
// Audio et vidéo : sur disque, puis envoyés en flux au stockage (jamais 300 Mo en mémoire)
const mediaUpload = FileInterceptor('file', { storage: diskStorage({ destination: tmpdir() }), limits: { fileSize: 300 * MB, files: 1, fields: 5 } })

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Joignez un fichier.')
  return file
}

function checkKind(head: Buffer, accepted: readonly Kind[], what: string): Kind {
  const kind = sniff(head)
  if (!kind || !accepted.includes(kind)) throw new AppError(415, 'UNSUPPORTED_FILE', `Format refusé pour ${what}. Formats acceptés : ${accepted.map((k) => EXT[k].toUpperCase()).join(', ')}.`)
  return kind
}

const rnd = () => randomBytes(9).toString('base64url')

@Controller('admin')
@UseGuards(StaffGuard)
export class AdminMediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Image d'illustration (publication, événement, projet). Les images sont publiques par nature :
   * elles ne doivent pas contenir de donnée personnelle. Renvoie la clé à placer dans imageKey.
   */
  @Post('uploads/image')
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(imageUpload)
  async image(@CurrentUser() p: Principal, @Query('structureId') structureId: string, @UploadedFile() f?: Express.Multer.File) {
    const file = requireFile(f)
    const s = await this.prisma.structure.findUnique({ where: { id: String(structureId ?? '') }, select: { path: true, slug: true } })
    const writable: Module[] = ['NEWS', 'EVENTS', 'PROJECTS', 'SERMONS', 'SETTINGS', 'NOTIFICATIONS']
    if (!s || !writable.some((m) => this.scope.access.can(p, m, 'write', s.path))) throw NotFound('Structure')
    const kind = checkKind(file.buffer, ACCEPT.image, 'une image')
    const key = `img/${s.slug}/${new Date().getUTCFullYear()}/${rnd()}.${EXT[kind]}`
    await this.storage.put(key, file.buffer, kind)
    return { key, url: mediaUrl('img', key) }
  }

  // ── Prédications et contenus spirituels ──

  private async sermon(p: Principal, id: string, action: 'read' | 'write' | 'validate') {
    const s = await this.prisma.spiritualContent.findUnique({ where: { id }, include: { structure: { select: { id: true, name: true, path: true } } } })
    if (!s) throw NotFound('Prédication')
    this.scope.access.assert(p, 'SERMONS', action, s.structure.path, 'Prédication')
    return s
  }

  private sermonDto(s: Prisma.SpiritualContentGetPayload<{ include: { structure: { select: { id: true; name: true; path: true } } } }>) {
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      mediaType: s.mediaType,
      speaker: s.speaker,
      scriptureRef: s.scriptureRef,
      summary: s.summary,
      body: s.body,
      durationSec: s.durationSec,
      hasMedia: !!s.mediaKey,
      externalUrl: s.externalUrl,
      imageUrl: mediaUrl('img', s.imageKey),
      offlineAllowed: s.offlineAllowed,
      isPublic: s.isPublic,
      status: s.status,
      playCount: s.playCount,
      recordedAt: s.recordedAt?.toISOString() ?? null,
      publishedAt: s.publishedAt?.toISOString() ?? null,
      structure: { id: s.structure.id, name: s.structure.name },
    }
  }

  @Get('sermons')
  async sermons(@CurrentUser() p: Principal, @Query('status') status?: string, @Query('structureId') structureId?: string, @Query('cursor') cursor?: string) {
    const structure = await this.scope.whereWithin(p, 'SERMONS', structureId ? String(structureId) : undefined)
    const st = ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(String(status)) ? (status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') : undefined
    const rows = await this.prisma.spiritualContent.findMany({
      where: { structure, ...(st ? { status: st } : { status: { not: 'ARCHIVED' } }) },
      include: { structure: { select: { id: true, name: true, path: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(cursor ? String(cursor).slice(0, 40) : undefined),
    })
    const r = page(rows)
    return { items: r.items.map((s) => this.sermonDto(s)), nextCursor: r.nextCursor }
  }

  @Post('sermons')
  async createSermon(@CurrentUser() p: Principal, @Body(new ZodPipe(adminSermonSchema)) body: z.infer<typeof adminSermonSchema>, @ClientIp() ip: string | null) {
    const st = await this.scope.structure(p, 'SERMONS', 'write', body.structureId)
    if (body.imageKey) assertImageKey(body.imageKey)
    const s = await this.prisma.$transaction(async (tx) => {
      const s = await tx.spiritualContent.create({
        data: { ...body, recordedAt: body.recordedAt ? new Date(body.recordedAt) : null, confessionId: st.confessionId, createdById: p.userId, status: 'DRAFT' },
        include: { structure: { select: { id: true, name: true, path: true } } },
      })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A créé le contenu « ${s.title} »`, entityType: 'SpiritualContent', entityId: s.id, structureId: st.id, structurePath: st.path }, tx)
      return s
    })
    return this.sermonDto(s)
  }

  @Patch('sermons/:id')
  async updateSermon(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateSermonSchema)) body: z.infer<typeof updateSermonSchema>) {
    const s = await this.sermon(p, id, 'write')
    if (s.status === 'ARCHIVED') throw Conflict('ARCHIVED', 'Un contenu archivé ne se modifie plus.')
    if (body.imageKey) assertImageKey(body.imageKey)
    const u = await this.prisma.spiritualContent.update({
      where: { id },
      data: { ...body, ...(body.recordedAt !== undefined ? { recordedAt: body.recordedAt ? new Date(body.recordedAt) : null } : {}) },
      include: { structure: { select: { id: true, name: true, path: true } } },
    })
    return this.sermonDto(u)
  }

  /** Fichier audio ou vidéo du contenu ; le format doit correspondre au type déclaré. */
  @Post('sermons/:id/media')
  @HttpCode(200)
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(mediaUpload)
  async sermonMedia(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null, @UploadedFile() f?: Express.Multer.File) {
    const file = requireFile(f)
    try {
      const s = await this.sermon(p, id, 'write')
      if (s.mediaType !== 'AUDIO' && s.mediaType !== 'VIDEO') throw new AppError(400, 'NO_MEDIA', 'Ce contenu est un texte : il n’a pas de fichier audio ou vidéo.')
      const head = Buffer.alloc(16)
      const fh = await open(file.path, 'r')
      try {
        await fh.read(head, 0, 16, 0)
      } finally {
        await fh.close()
      }
      const kind = checkKind(head, s.mediaType === 'AUDIO' ? ACCEPT.audio : ACCEPT.video, s.mediaType === 'AUDIO' ? 'un fichier audio' : 'une vidéo')
      const key = `sermon/${s.id}/${rnd()}.${EXT[kind]}`
      await this.storage.putFile(key, file.path, file.size, kind)
      const previous = s.mediaKey
      await this.prisma.spiritualContent.update({ where: { id }, data: { mediaKey: key } })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A déposé le fichier de « ${s.title} »`, entityType: 'SpiritualContent', entityId: id, structureId: s.structure.id, structurePath: s.structure.path, metadata: { size: file.size } })
      if (previous) await this.storage.remove(previous).catch(() => undefined)
      return { id, hasMedia: true, size: file.size }
    } finally {
      await unlink(file.path).catch(() => undefined)
    }
  }

  @Post('sermons/:id/publish')
  @HttpCode(200)
  async publishSermon(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const s = await this.sermon(p, id, 'write')
    if ((s.mediaType === 'AUDIO' || s.mediaType === 'VIDEO') && !s.mediaKey && !s.externalUrl) throw new AppError(400, 'NO_MEDIA', 'Déposez le fichier ou indiquez un lien avant de publier.')
    if (s.mediaType === 'TEXT' && !s.body) throw new AppError(400, 'EMPTY_BODY', 'Rédigez le texte avant de publier.')
    // SUBMITTED : contenu proposé, présent dans la file « À valider » du tableau de bord
    const moved = await this.prisma.spiritualContent.updateMany({ where: { id, status: { in: ['DRAFT', 'SUBMITTED'] } }, data: { status: 'PUBLISHED', publishedAt: new Date() } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seul un brouillon peut être publié.')
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A publié « ${s.title} »`, entityType: 'SpiritualContent', entityId: id, structureId: s.structure.id, structurePath: s.structure.path })
    return { id, status: 'PUBLISHED' }
  }

  @Post('sermons/:id/archive')
  @HttpCode(200)
  async archiveSermon(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const s = await this.sermon(p, id, 'write')
    const moved = await this.prisma.spiritualContent.updateMany({ where: { id, status: { not: 'ARCHIVED' } }, data: { status: 'ARCHIVED' } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Ce contenu est déjà archivé.')
    await this.audit.record({ ...actor(p, ip), category: 'SUPPRESSION', action: `A archivé « ${s.title} »`, entityType: 'SpiritualContent', entityId: id, structureId: s.structure.id, structurePath: s.structure.path })
    return { id, status: 'ARCHIVED' }
  }

  /** Écoute d'un brouillon avant publication. */
  @Get('sermons/:id/media')
  async sermonFile(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const s = await this.sermon(p, id, 'read')
    if (!s.mediaKey) throw NotFound('Fichier')
    return this.pipe(res, s.mediaKey, s.title, true)
  }

  // ── Documents ──

  private async doc(p: Principal, id: string, action: 'read' | 'write') {
    const d = await this.prisma.document.findUnique({ where: { id }, include: { structure: { select: { id: true, name: true, path: true } } } })
    if (!d) throw NotFound('Document')
    this.scope.access.assert(p, 'DOCUMENTS', action, d.structure.path, 'Document')
    return d
  }

  private docDto(d: Prisma.DocumentGetPayload<{ include: { structure: { select: { id: true; name: true; path: true } } } }>) {
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      visibility: d.visibility,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      version: d.version,
      downloads: d.downloads,
      archived: !!d.archivedAt,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      structure: { id: d.structure.id, name: d.structure.name },
    }
  }

  @Get('documents')
  async documents(@CurrentUser() p: Principal, @Query('category') category?: string, @Query('structureId') structureId?: string, @Query('archived') archived?: string, @Query('cursor') cursor?: string) {
    const structure = await this.scope.whereWithin(p, 'DOCUMENTS', structureId ? String(structureId) : undefined)
    const rows = await this.prisma.document.findMany({
      where: { structure, archivedAt: archived === '1' ? { not: null } : null, ...(category ? { category: String(category).slice(0, 40) } : {}) },
      include: { structure: { select: { id: true, name: true, path: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(cursor ? String(cursor).slice(0, 40) : undefined),
    })
    const r = page(rows)
    return { items: r.items.map((d) => this.docDto(d)), nextCursor: r.nextCursor }
  }

  /** Dépôt d'un document PDF (multipart : file + structureId, title, category, visibility). */
  @Post('documents')
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(docUpload)
  async createDocument(@CurrentUser() p: Principal, @Body(new ZodPipe(adminDocumentSchema)) body: z.infer<typeof adminDocumentSchema>, @ClientIp() ip: string | null, @UploadedFile() f?: Express.Multer.File) {
    const file = requireFile(f)
    const s = await this.scope.structure(p, 'DOCUMENTS', 'write', body.structureId)
    const kind = checkKind(file.buffer, ACCEPT.document, 'un document')
    const key = `doc/${s.id}/${rnd()}.${EXT[kind]}`
    await this.storage.put(key, file.buffer, kind)
    const d = await this.prisma.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: { ...body, confessionId: s.confessionId, fileKey: key, mimeType: kind, sizeBytes: file.size, createdById: p.userId },
        include: { structure: { select: { id: true, name: true, path: true } } },
      })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A déposé le document « ${d.title} »`, entityType: 'Document', entityId: d.id, structureId: s.id, structurePath: s.path }, tx)
      return d
    })
    return this.docDto(d)
  }

  /** Nouvelle version du fichier : le lien des fidèles reste le même. */
  @Post('documents/:id/file')
  @HttpCode(200)
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(docUpload)
  async replaceDocument(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null, @UploadedFile() f?: Express.Multer.File) {
    const file = requireFile(f)
    const d = await this.doc(p, id, 'write')
    if (d.archivedAt) throw Conflict('ARCHIVED', 'Ce document est archivé.')
    const kind = checkKind(file.buffer, ACCEPT.document, 'un document')
    const key = `doc/${d.structure.id}/${rnd()}.${EXT[kind]}`
    await this.storage.put(key, file.buffer, kind)
    const u = await this.prisma.document.update({ where: { id }, data: { fileKey: key, sizeBytes: file.size, mimeType: kind, version: { increment: 1 } }, include: { structure: { select: { id: true, name: true, path: true } } } })
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A remplacé « ${d.title} » (version ${u.version})`, entityType: 'Document', entityId: id, structureId: d.structure.id, structurePath: d.structure.path })
    return this.docDto(u)
  }

  @Patch('documents/:id')
  async updateDocument(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateDocumentSchema)) body: z.infer<typeof updateDocumentSchema>, @ClientIp() ip: string | null) {
    const d = await this.doc(p, id, 'write')
    const u = await this.prisma.document.update({ where: { id }, data: body, include: { structure: { select: { id: true, name: true, path: true } } } })
    if (body.visibility && body.visibility !== d.visibility) {
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A changé la visibilité de « ${d.title} » : ${body.visibility}`, entityType: 'Document', entityId: id, structureId: d.structure.id, structurePath: d.structure.path })
    }
    return this.docDto(u)
  }

  @Post('documents/:id/archive')
  @HttpCode(200)
  async archiveDocument(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const d = await this.doc(p, id, 'write')
    const moved = await this.prisma.document.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Ce document est déjà archivé.')
    await this.audit.record({ ...actor(p, ip), category: 'SUPPRESSION', action: `A archivé le document « ${d.title} »`, entityType: 'Document', entityId: id, structureId: d.structure.id, structurePath: d.structure.path })
    return { id, archived: true }
  }

  /** Téléchargement côté back-office (le droit « Documents » vaut mandat sur la structure), y compris « Responsables » et archivés. */
  @Get('documents/:id/file')
  async documentFile(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const d = await this.doc(p, id, 'read')
    return this.pipe(res, d.fileKey, d.title + '.pdf', false)
  }

  private async pipe(res: Response, key: string, name: string, inline: boolean) {
    let obj
    try {
      obj = await this.storage.stream(key)
    } catch {
      throw NotFound('Fichier')
    }
    res.setHeader('Content-Type', obj.contentType)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${asciiName(name)}"`)
    if (obj.contentLength) res.setHeader('Content-Length', String(obj.contentLength))
    obj.body.pipe(res)
  }
}
