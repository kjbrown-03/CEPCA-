import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { adminProjectSchema, pct, projectStepsSchema, projectUpdateSchema, updateProjectSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { mediaUrl } from '../storage/storage.service'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { AudienceService, PushService } from './audience.service'
import { assertImageKey } from './publications.controller'

const listSchema = z.strictObject({
  status: z.enum(['IDEA', 'PROPOSED', 'STUDY', 'VALIDATED', 'FUNDING', 'EXECUTION', 'COMPLETED', 'CLOSED']).optional(),
  mine: z.enum(['0', '1']).optional(),
  structureId: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
})

const projInclude = {
  structure: { select: { id: true, name: true, path: true } },
  responsible: { select: { id: true, fullName: true } },
  steps: { orderBy: { position: 'asc' } },
  updates: { orderBy: { createdAt: 'desc' }, take: 20 },
} as const satisfies Prisma.ProjectInclude
type ProjRow = Prisma.ProjectGetPayload<{ include: typeof projInclude }>

export const STATUS_LABEL: Record<string, string> = {
  IDEA: 'Idée',
  PROPOSED: 'Proposé',
  STUDY: 'En étude',
  VALIDATED: 'Validé',
  FUNDING: 'En cours',
  EXECUTION: 'En exécution',
  COMPLETED: 'Achevé',
  CLOSED: 'Clôturé',
}

@Controller('admin/projects')
@UseGuards(StaffGuard)
export class AdminProjectsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly audience: AudienceService,
    private readonly push: PushService,
  ) {}

  private dto(p: Principal, r: ProjRow) {
    return {
      id: r.id,
      code: r.code,
      kind: r.kind,
      title: r.title,
      description: r.description,
      location: r.location,
      beneficiaries: r.beneficiaries,
      budget: r.budget,
      goalAmount: r.goalAmount,
      raisedAmount: r.raisedAmount,
      progressPct: Math.round(pct(r.raisedAmount, r.goalAmount) * 10) / 10,
      contributorCount: r.contributorCount,
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      endLabel: r.endLabel,
      responsible: r.responsible,
      imageKey: r.imageKey,
      imageUrl: mediaUrl('img', r.imageKey),
      collectOpen: r.collectOpen,
      status: r.status,
      statusLabel: STATUS_LABEL[r.status],
      validated: !!r.validatedAt,
      structure: { id: r.structure.id, name: r.structure.name },
      steps: r.steps.map((s) => ({ label: s.label, done: s.done })),
      updates: r.updates.map((u) => ({ id: u.id, title: u.title, body: u.body, date: u.createdAt.toISOString() })),
      can: { edit: this.scope.access.can(p, 'PROJECTS', 'write', r.structure.path), validate: this.scope.access.can(p, 'PROJECTS', 'validate', r.structure.path) },
    }
  }

  private async load(p: Principal, id: string, action: 'read' | 'write' | 'validate') {
    const r = await this.prisma.project.findUnique({ where: { id }, include: projInclude })
    if (!r) throw NotFound('Projet')
    this.scope.access.assert(p, 'PROJECTS', action, r.structure.path, 'Projet')
    return r
  }

  @Get()
  async list(@CurrentUser() p: Principal, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const structure = await this.scope.whereWithin(p, 'PROJECTS', q.structureId)
    const rows = await this.prisma.project.findMany({
      where: { structure, ...(q.status ? { status: q.status } : {}), ...(q.mine === '1' ? { responsibleId: p.userId } : {}) },
      include: projInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(q.cursor),
    })
    const r = page(rows)
    return { items: r.items.map((x) => this.dto(p, x)), nextCursor: r.nextCursor }
  }

  @Get(':id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string) {
    return this.dto(p, await this.load(p, id, 'read'))
  }

  /** Le responsable doit être rattaché à la structure du projet ou y avoir un mandat. */
  private async assertResponsible(userId: string, path: string) {
    const under = { path: { startsWith: path } }
    const ok = await this.prisma.user.count({
      where: { id: userId, status: 'ACTIVE', OR: [{ memberships: { some: { status: 'ACTIVE', structure: under } } }, { roleAssignments: { some: { revokedAt: null, structure: under } } }] },
    })
    if (!ok) throw new AppError(400, 'VALIDATION', 'Le responsable doit appartenir à la structure du projet.', { responsibleId: 'Personne hors de la structure' })
  }

  /** Un projet naît « Proposé », collecte fermée : il doit être validé avant d'appeler aux dons (§26). */
  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(adminProjectSchema)) body: z.infer<typeof adminProjectSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'PROJECTS', 'write', body.structureId)
    if (body.imageKey) assertImageKey(body.imageKey)
    if (body.responsibleId) await this.assertResponsible(body.responsibleId, s.path)
    const conf = s.confessionId ? await this.prisma.confession.findUnique({ where: { id: s.confessionId }, select: { shortCode: true } }) : null
    const prefix = `CEPCA-${conf?.shortCode ?? 'CEPCA'}-${s.code}-PROJ`
    const { steps, ...data } = body
    const r = await this.prisma.$transaction(async (tx) => {
      const last = await tx.project.findFirst({ where: { code: { startsWith: prefix } }, orderBy: { code: 'desc' }, select: { code: true } })
      const n = last ? Number(last.code.slice(prefix.length)) + 1 : 1
      const r = await tx.project.create({
        data: {
          ...data,
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          code: `${prefix}${String(n).padStart(4, '0')}`,
          confessionId: s.confessionId,
          responsibleId: data.responsibleId ?? p.userId,
          status: 'PROPOSED',
          collectOpen: false,
          steps: { createMany: { data: steps.map((label, position) => ({ label, position })) } },
        },
        include: projInclude,
      })
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A proposé le projet « ${r.title} » (${r.code})`, entityType: 'Project', entityId: r.id, structureId: s.id, structurePath: s.path }, tx)
      return r
    })
    return this.dto(p, r)
  }

  @Patch(':id')
  async update(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateProjectSchema)) body: z.infer<typeof updateProjectSchema>, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'write')
    const canValidate = this.scope.access.can(p, 'PROJECTS', 'validate', r.structure.path)
    // Les chiffres publiés et le statut engagent la structure : ils passent par un niveau qui valide (§26)
    const sensitive = (body.status !== undefined && body.status !== r.status) || (body.collectOpen !== undefined && body.collectOpen !== r.collectOpen) || (body.goalAmount !== undefined && body.goalAmount !== r.goalAmount && !!r.validatedAt)
    if (sensitive && !canValidate) throw Forbidden('Le statut, l’objectif et l’ouverture de la collecte sont décidés par un responsable qui valide les projets.')
    if (body.collectOpen && !r.validatedAt) throw new AppError(400, 'NOT_VALIDATED', 'Validez le projet avant d’ouvrir la collecte.')
    if (body.imageKey) assertImageKey(body.imageKey)
    if (body.responsibleId) await this.assertResponsible(body.responsibleId, r.structure.path)
    const u = await this.prisma.$transaction(async (tx) => {
      const u = await tx.project.update({
        where: { id },
        data: {
          ...body,
          ...(body.startsAt !== undefined ? { startsAt: body.startsAt ? new Date(body.startsAt) : null } : {}),
          ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
          // Une collecte se ferme avec la clôture ou l'achèvement du projet
          ...(body.status === 'CLOSED' || body.status === 'COMPLETED' ? { collectOpen: false } : {}),
        },
        include: projInclude,
      })
      await this.audit.record({ ...actor(p, ip), category: 'PARAMETRAGE', action: `A modifié le projet « ${r.title} »`, entityType: 'Project', entityId: id, structureId: r.structure.id, structurePath: r.structure.path, metadata: { fields: Object.keys(body) } }, tx)
      return u
    })
    return this.dto(p, u)
  }

  @Post(':id/validate')
  @HttpCode(200)
  async validate(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'validate')
    if (r.validatedAt) throw Conflict('ALREADY_VALIDATED', 'Ce projet est déjà validé.')
    const u = await this.prisma.$transaction(async (tx) => {
      const u = await tx.project.update({ where: { id }, data: { validatedAt: new Date(), validatedById: p.userId, status: ['IDEA', 'PROPOSED', 'STUDY'].includes(r.status) ? 'VALIDATED' : r.status }, include: projInclude })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A validé le projet « ${r.title} »`, entityType: 'Project', entityId: id, structureId: r.structure.id, structurePath: r.structure.path }, tx)
      return u
    })
    return this.dto(p, u)
  }

  @Put(':id/steps')
  async steps(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(projectStepsSchema)) body: z.infer<typeof projectStepsSchema>) {
    await this.load(p, id, 'write')
    const u = await this.prisma.$transaction(async (tx) => {
      await tx.projectStep.deleteMany({ where: { projectId: id } })
      await tx.projectStep.createMany({ data: body.steps.map((s, position) => ({ projectId: id, position, label: s.label, done: s.done })) })
      return tx.project.findUniqueOrThrow({ where: { id }, include: projInclude })
    })
    return this.dto(p, u)
  }

  /** Nouvelle du suivi, envoyée aux contributeurs du projet. */
  @Post(':id/updates')
  async addUpdate(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(projectUpdateSchema)) body: z.infer<typeof projectUpdateSchema>, @ClientIp() ip: string | null) {
    const r = await this.load(p, id, 'write')
    if (body.imageKey) assertImageKey(body.imageKey)
    await this.prisma.$transaction(async (tx) => {
      await tx.projectUpdate.create({ data: { projectId: id, title: body.title, body: body.body, imageKey: body.imageKey, createdById: p.userId } })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A publié une nouvelle du projet « ${r.title} »`, entityType: 'Project', entityId: id, structureId: r.structure.id, structurePath: r.structure.path }, tx)
    })
    const contributors = await this.prisma.contribution.findMany({ where: { projectId: id, status: 'SUCCEEDED', userId: { not: null } }, distinct: ['userId'], select: { userId: true } })
    const ids = contributors.map((c) => c.userId!)
    if (ids.length) {
      const title = 'Le projet avance'
      const text = `${r.title} : ${body.title}`
      await this.audience.inbox(ids, { kind: 'PROJECT', title, body: text, link: { screen: 'projD', id } })
      await this.push.send(ids, title, text, { screen: 'projD', id })
    }
    return { ...this.dto(p, await this.prisma.project.findUniqueOrThrow({ where: { id }, include: projInclude })), notified: ids.length }
  }
}
