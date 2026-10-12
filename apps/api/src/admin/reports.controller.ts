import { Controller, Get, Query, Res, StreamableFile, UseGuards } from '@nestjs/common'
import type { Module, Prisma } from '@prisma/client'
import type { Response } from 'express'
import { z } from 'zod'
import { auditQuerySchema, reportQuerySchema, type ReportDto } from '@cepca/shared'
import { AppError, ClientIp, Forbidden, NotFound, ZodPipe } from '../common/http'
import { toCsv, toXlsx } from '../common/xlsx'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { ReportsService, type ReportType } from './reports.service'

/** Module dont il faut aussi détenir la lecture (agrégée suffit) pour chaque rapport. */
const REPORT_MODULE: Record<ReportType, Module> = { contributions: 'CONTRIBUTIONS', members: 'MEMBERS', projects: 'PROJECTS', activities: 'EVENTS', communication: 'NEWS' }
const MIME = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf' } as const
const AUDIT_EXPORT_MAX = 5000
const CATEGORY_LABEL: Record<string, string> = {
  CONNEXION: 'Connexion',
  VALIDATION: 'Validation',
  PAIEMENT: 'Paiement',
  DROITS: 'Droits',
  EXPORT: 'Export',
  PUBLICATION: 'Publication',
  SUPPRESSION: 'Suppression',
  PARAMETRAGE: 'Paramétrage',
}
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Douala', dateStyle: 'short', timeStyle: 'short' })

function attach(res: Response, format: keyof typeof MIME, name: string, data: Buffer) {
  res.setHeader('Content-Type', MIME[format])
  res.setHeader('Content-Disposition', `attachment; filename="${name}.${format}"`)
  res.setHeader('Cache-Control', 'private, no-store')
  return new StreamableFile(data)
}

@Controller('admin')
@UseGuards(StaffGuard)
export class AdminReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Rapports agrégés (§35), à l'écran ou exportés (CSV, Excel, PDF). Sans structure choisie : le périmètre
   * le plus large de la personne. Chaque export est journalisé.
   */
  @Get('reports')
  async report(
    @CurrentUser() p: Principal,
    @Query(new ZodPipe(reportQuerySchema)) q: z.infer<typeof reportQuerySchema>,
    @ClientIp() ip: string | null,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReportDto | StreamableFile> {
    let s: { id: string; name: string; path: string }
    if (q.structureId) s = await this.scope.structure(p, 'REPORTS', 'read', q.structureId)
    else {
      const paths = this.scope.access.scopePaths(p, 'REPORTS', 'read')
      if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
      const top = [...paths].sort((a, b) => a.length - b.length)[0]
      const found = await this.prisma.structure.findUnique({ where: { path: top }, select: { id: true, name: true, path: true } })
      if (!found) throw NotFound('Structure')
      s = found
    }
    if (!this.scope.access.can(p, REPORT_MODULE[q.type], 'read', s.path, { allowAggregate: true })) throw Forbidden('Ce rapport porte sur un module auquel vous n’avez pas accès.')
    const r = await this.reports.build(q.type, q.period, s)
    if (q.format === 'json') return r

    const data = q.format === 'pdf' ? await this.reports.pdf(r, p.fullName) : q.format === 'xlsx' ? toXlsx(r.title, this.reports.table(r)) : toCsv(this.reports.table(r))
    await this.audit.record({ ...actor(p, ip), category: 'EXPORT', action: `A exporté le rapport « ${r.title} · ${r.period.label} » (${q.format.toUpperCase()})`, entityType: 'Report', structureId: s.id, structurePath: s.path, metadata: { type: q.type, period: q.period, format: q.format } })
    return attach(res, q.format, `rapport-${q.type}-${q.period}`, data)
  }

  /** « Rapports récents » : les derniers exports de la personne, relus dans le journal pour être retéléchargés. */
  @Get('reports/recent')
  async recent(@CurrentUser() p: Principal) {
    this.scope.requireAny(p, 'REPORTS', 'read', { allowAggregate: true })
    const rows = await this.prisma.auditLog.findMany({
      where: { actorId: p.userId, category: 'EXPORT', entityType: 'Report', success: true },
      orderBy: { at: 'desc' },
      take: 8,
      select: { id: true, at: true, action: true, structureId: true, metadata: true },
    })
    return rows.flatMap((r) => {
      const m = (r.metadata ?? {}) as { type?: string; period?: string; format?: string }
      if (!m.type || !m.period) return []
      // Les exports antérieurs à l'enregistrement du format le portent dans le libellé : « (PDF) »
      const format = m.format ?? /\((PDF|XLSX|CSV)\)$/.exec(r.action)?.[1].toLowerCase() ?? 'pdf'
      return [{ id: r.id, at: r.at.toISOString(), title: r.action.replace(/^A exporté le rapport « (.*) » \(\w+\)$/, '$1'), type: m.type, period: m.period, format, structureId: r.structureId }]
    })
  }

  /** Journal d'audit du périmètre ; au niveau CEPCA, tout le journal (connexions comprises). */
  @Get('audit')
  async journal(
    @CurrentUser() p: Principal,
    @Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>,
    @ClientIp() ip: string | null,
    @Res({ passthrough: true }) res: Response,
  ) {
    const paths = this.scope.access.scopePaths(p, 'AUDIT', 'read')
    if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
    const and: Prisma.AuditLogWhereInput[] = []
    // Une entrée sans structure (connexion) n'est visible qu'au niveau CEPCA, ou par son auteur
    if (!paths.includes('/cepca/')) and.push({ OR: [...paths.map((x) => ({ structurePath: { startsWith: x } })), { actorId: p.userId }] })
    if (q.category) and.push({ category: q.category })
    if (q.q) and.push({ OR: [{ actorLabel: { contains: q.q, mode: 'insensitive' } }, { action: { contains: q.q, mode: 'insensitive' } }] })
    if (q.from || q.to) and.push({ at: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } })
    const where: Prisma.AuditLogWhereInput = { AND: and }
    const orderBy: Prisma.AuditLogOrderByWithRelationInput[] = [{ at: 'desc' }, { id: 'desc' }]

    if (q.format === 'csv') {
      const rows = await this.prisma.auditLog.findMany({ where, orderBy, take: AUDIT_EXPORT_MAX })
      const table: Array<Array<string | number>> = [
        ['Date (Douala)', 'Auteur', 'Catégorie', 'Action', 'Résultat', 'IP'],
        ...rows.map((r) => [stamp.format(r.at), r.actorLabel, CATEGORY_LABEL[r.category], r.action, r.success ? 'Réussi' : 'Échec', r.ip ?? '']),
      ]
      await this.audit.record({ ...actor(p, ip), category: 'EXPORT', action: `A exporté le journal d'audit (${rows.length} entrées)`, entityType: 'AuditLog', structurePath: paths[0], metadata: { category: q.category ?? null, q: q.q ?? null } })
      return attach(res, 'csv', `journal-audit-${new Date().toISOString().slice(0, 10)}`, toCsv(table))
    }

    const rows = await this.prisma.auditLog.findMany({ where, orderBy, ...cursorArgs(q.cursor) })
    const r = page(rows)
    return {
      items: r.items.map((x) => ({
        id: x.id,
        at: x.at.toISOString(),
        actor: x.actorLabel,
        category: x.category,
        categoryLabel: CATEGORY_LABEL[x.category],
        action: x.action,
        success: x.success,
        ip: x.ip,
        entityType: x.entityType,
        entityId: x.entityId,
      })),
      nextCursor: r.nextCursor,
    }
  }
}
