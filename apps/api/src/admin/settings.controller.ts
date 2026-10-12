import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { contributionTypeSchema, settingsSchema, updateContributionTypeSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, NotFound, ZodPipe } from '../common/http'
import { effectiveSettings } from '../common/settings'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor, type StructureRow } from './admin-common'

const scopeQuery = z.strictObject({ structureId: z.string().min(10).max(40).optional() })

/**
 * Paramètres (§10) : langues proposées et mention des reçus, fixées à un niveau et héritées en dessous ;
 * types de contribution propres à chaque confession.
 */
@Controller('admin/settings')
@UseGuards(StaffGuard)
export class AdminSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
  ) {}

  /** Structure visée, ou à défaut le périmètre « Paramétrage » le plus large de la personne. */
  private async target(p: Principal, action: 'read' | 'write', structureId?: string): Promise<StructureRow> {
    if (structureId) return this.scope.structure(p, 'SETTINGS', action, structureId)
    const paths = this.scope.access.scopePaths(p, 'SETTINGS', action)
    if (paths.length === 0) throw new AppError(403, 'FORBIDDEN', "Vous n'avez pas accès à ce module")
    const top = [...paths].sort((a, b) => a.length - b.length)[0]
    const s = await this.prisma.structure.findFirst({ where: { path: top }, select: { id: true } })
    if (!s) throw NotFound('Structure')
    return this.scope.structure(p, 'SETTINGS', action, s.id)
  }

  /** Les types de contribution se décident au nœud de la confession. */
  private async confessionNode(confessionId: string) {
    const n = await this.prisma.structure.findFirst({ where: { confessionId, depth: 1 }, select: { id: true, path: true } })
    if (!n) throw NotFound('Confession')
    return n
  }

  private async types(confessionId: string) {
    const rows = await this.prisma.contributionType.findMany({ where: { confessionId }, orderBy: [{ position: 'asc' }, { label: 'asc' }], include: { _count: { select: { contributions: true } } } })
    return rows.map((t) => ({ id: t.id, key: t.key, label: t.label, requiresProject: t.requiresProject, active: t.active, position: t.position, used: t._count.contributions }))
  }

  @Get()
  async get(@CurrentUser() p: Principal, @Query(new ZodPipe(scopeQuery)) q: z.infer<typeof scopeQuery>) {
    const s = await this.target(p, 'read', q.structureId)
    const settings = await effectiveSettings(this.prisma, s.path)
    const editTypes = s.confessionId ? this.scope.access.can(p, 'SETTINGS', 'write', (await this.confessionNode(s.confessionId)).path) : false
    return {
      structure: { id: s.id, name: s.name, level: s.levelType.name },
      locales: settings.locales,
      receiptNote: settings.receiptNote,
      definedAt: settings.definedAt,
      editable: this.scope.access.can(p, 'SETTINGS', 'write', s.path),
      contributionTypes: s.confessionId ? await this.types(s.confessionId) : null,
      contributionTypesEditable: editTypes,
    }
  }

  @Put()
  async save(@CurrentUser() p: Principal, @Query(new ZodPipe(scopeQuery)) q: z.infer<typeof scopeQuery>, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>, @ClientIp() ip: string | null) {
    const s = await this.target(p, 'write', q.structureId)
    const entries = Object.entries(body).filter(([, v]) => v !== undefined) as Array<[string, Prisma.InputJsonValue]>
    if (entries.length === 0) return this.get(p, { structureId: s.id })
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.setting.upsert({ where: { structureId_key: { structureId: s.id, key } }, create: { structureId: s.id, key, value }, update: { value } })
      }
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A modifié les paramètres de ${s.name}`, entityType: 'Setting', entityId: s.id, structureId: s.id, structurePath: s.path, metadata: { keys: entries.map(([k]) => k) } }, tx)
    })
    return this.get(p, { structureId: s.id })
  }

  @Post('contribution-types')
  async createType(@CurrentUser() p: Principal, @Query(new ZodPipe(scopeQuery)) q: z.infer<typeof scopeQuery>, @Body(new ZodPipe(contributionTypeSchema)) body: z.infer<typeof contributionTypeSchema>, @ClientIp() ip: string | null) {
    const s = await this.target(p, 'read', q.structureId)
    if (!s.confessionId) throw new AppError(400, 'NO_CONFESSION', 'Les types de contribution se définissent au niveau d’une confession.')
    const node = await this.confessionNode(s.confessionId)
    this.scope.access.assert(p, 'SETTINGS', 'write', node.path, 'Confession')
    if (await this.prisma.contributionType.findUnique({ where: { confessionId_key: { confessionId: s.confessionId, key: body.key } } })) throw Conflict('KEY_TAKEN', 'Ce type de contribution existe déjà.')
    const last = await this.prisma.contributionType.aggregate({ where: { confessionId: s.confessionId }, _max: { position: true } })
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.contributionType.create({ data: { ...body, confessionId: s.confessionId!, position: (last._max.position ?? -1) + 1 } })
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A créé le type de contribution « ${body.label} »`, entityType: 'ContributionType', entityId: t.id, structureId: node.id, structurePath: node.path }, tx)
    })
    return this.types(s.confessionId)
  }

  /** Un type déjà utilisé ne se supprime pas : il se désactive (les reçus passés le citent). */
  @Patch('contribution-types/:id')
  async updateType(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateContributionTypeSchema)) body: z.infer<typeof updateContributionTypeSchema>, @ClientIp() ip: string | null) {
    const t = await this.prisma.contributionType.findUnique({ where: { id } })
    if (!t) throw NotFound('Type de contribution')
    const node = await this.confessionNode(t.confessionId)
    this.scope.access.assert(p, 'SETTINGS', 'write', node.path, 'Type de contribution')
    await this.prisma.$transaction(async (tx) => {
      await tx.contributionType.update({ where: { id }, data: body })
      const what = body.active === false ? 'désactivé' : body.active === true && !t.active ? 'réactivé' : 'modifié'
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A ${what} le type de contribution « ${body.label ?? t.label} »`, entityType: 'ContributionType', entityId: id, structureId: node.id, structurePath: node.path, metadata: { fields: Object.keys(body) } }, tx)
    })
    return this.types(t.confessionId)
  }
}
