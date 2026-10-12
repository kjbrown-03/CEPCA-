import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { adminEventSchema, updateEventSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { mediaUrl } from '../storage/storage.service'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { AudienceService, PushService } from './audience.service'
import { assertImageKey } from './publications.controller'

const listSchema = z.strictObject({
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  structureId: z.string().max(40).optional(),
  cursor: z.string().max(40).optional(),
})

const evInclude = {
  structure: { select: { id: true, name: true, path: true } },
  _count: { select: { registrations: { where: { cancelledAt: null } } } },
} as const satisfies Prisma.EventInclude
type EvRow = Prisma.EventGetPayload<{ include: typeof evInclude }>

export const STATUS_LABEL = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé' } as const

function dto(e: EvRow) {
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    place: e.place,
    isLive: e.isLive,
    liveUrl: e.liveUrl,
    registrationOpen: e.registrationOpen,
    capacity: e.capacity,
    registeredCount: e._count.registrations,
    responsible: e.responsible,
    isPublic: e.isPublic,
    imageKey: e.imageKey,
    imageUrl: mediaUrl('img', e.imageKey),
    status: e.status,
    statusLabel: STATUS_LABEL[e.status],
    structure: { id: e.structure.id, name: e.structure.name },
  }
}

@Controller('admin/events')
@UseGuards(StaffGuard)
export class AdminEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly audience: AudienceService,
    private readonly push: PushService,
  ) {}

  private async load(p: Principal, id: string, action: 'read' | 'write') {
    const e = await this.prisma.event.findUnique({ where: { id }, include: evInclude })
    if (!e) throw NotFound('Événement')
    this.scope.access.assert(p, 'EVENTS', action, e.structure.path, 'Événement')
    return e
  }

  /** Agenda du périmètre : à venir par défaut (depuis 24 h), dans l'ordre chronologique. */
  @Get()
  async list(@CurrentUser() p: Principal, @Query(new ZodPipe(listSchema)) q: z.infer<typeof listSchema>) {
    const structure = await this.scope.whereWithin(p, 'EVENTS', q.structureId)
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 24 * 3600 * 1000)
    const rows = await this.prisma.event.findMany({
      where: { structure, startsAt: { gte: from }, ...(q.status ? { status: q.status } : {}) },
      include: evInclude,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      ...cursorArgs(q.cursor),
    })
    const r = page(rows)
    return { items: r.items.map(dto), nextCursor: r.nextCursor }
  }

  @Get(':id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string) {
    const e = await this.load(p, id, 'read')
    return { ...dto(e), canEdit: this.scope.access.can(p, 'EVENTS', 'write', e.structure.path) }
  }

  /** Liste des inscrits (nominative) : réservée à qui peut aussi voir les fidèles de la structure. */
  @Get(':id/registrations')
  async registrations(@CurrentUser() p: Principal, @Param('id') id: string) {
    const e = await this.load(p, id, 'read')
    this.scope.access.assert(p, 'MEMBERS', 'read', e.structure.path, 'Événement')
    const rows = await this.prisma.eventRegistration.findMany({ where: { eventId: id, cancelledAt: null }, select: { createdAt: true, user: { select: { id: true, fullName: true, phone: true } } }, orderBy: { createdAt: 'asc' } })
    return rows.map((r) => ({ userId: r.user.id, fullName: r.user.fullName, phone: r.user.phone, at: r.createdAt.toISOString() }))
  }

  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(adminEventSchema)) body: z.infer<typeof adminEventSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'EVENTS', 'write', body.structureId)
    if (body.imageKey) assertImageKey(body.imageKey)
    if (body.isLive === false && body.liveUrl) body.liveUrl = null
    const e = await this.prisma.$transaction(async (tx) => {
      const e = await tx.event.create({
        data: { ...body, startsAt: new Date(body.startsAt), endsAt: body.endsAt ? new Date(body.endsAt) : null, confessionId: s.confessionId, createdById: p.userId, status: 'DRAFT' },
        include: evInclude,
      })
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A créé l'événement « ${e.title} »`, entityType: 'Event', entityId: e.id, structureId: s.id, structurePath: s.path }, tx)
      return e
    })
    return dto(e)
  }

  @Patch(':id')
  async update(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(updateEventSchema)) body: z.infer<typeof updateEventSchema>) {
    const e = await this.load(p, id, 'write')
    if (e.status === 'CANCELLED') throw Conflict('CANCELLED', 'Un événement annulé ne se modifie plus.')
    if (body.imageKey) assertImageKey(body.imageKey)
    const startsAt = body.startsAt ? new Date(body.startsAt) : e.startsAt
    const endsAt = body.endsAt === undefined ? e.endsAt : body.endsAt ? new Date(body.endsAt) : null
    if (endsAt && endsAt < startsAt) throw new AppError(400, 'VALIDATION', 'La fin précède le début', { endsAt: 'La fin précède le début' })
    const capacity = body.capacity === undefined ? e.capacity : body.capacity
    if (capacity != null && capacity < e._count.registrations) {
      throw new AppError(400, 'CAPACITY_BELOW_REGISTERED', `${e._count.registrations} personnes sont déjà inscrites : la capacité ne peut pas être inférieure.`)
    }
    const u = await this.prisma.event.update({ where: { id }, data: { ...body, startsAt, endsAt }, include: evInclude })
    return dto(u)
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const e = await this.load(p, id, 'write')
    const moved = await this.prisma.event.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED' } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seul un brouillon peut être publié.')
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A publié l'événement « ${e.title} »`, entityType: 'Event', entityId: id, structureId: e.structure.id, structurePath: e.structure.path })
    return dto(await this.prisma.event.findUniqueOrThrow({ where: { id }, include: evInclude }))
  }

  /** Annulation : les inscrits sont prévenus dans l'app. */
  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const e = await this.load(p, id, 'write')
    const regs = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.event.updateMany({ where: { id, status: { in: ['DRAFT', 'PUBLISHED'] } }, data: { status: 'CANCELLED' } })
      if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Cet événement est déjà annulé.')
      await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A annulé l'événement « ${e.title} »`, entityType: 'Event', entityId: id, structureId: e.structure.id, structurePath: e.structure.path }, tx)
      return e.status === 'PUBLISHED' ? tx.eventRegistration.findMany({ where: { eventId: id, cancelledAt: null }, select: { userId: true } }) : []
    })
    const ids = regs.map((r) => r.userId)
    if (ids.length) {
      const body = `${e.title} · ${e.place} : l'événement est annulé.`
      await this.audience.inbox(ids, { kind: 'EVENT', title: 'Événement annulé', body })
      await this.push.send(ids, 'Événement annulé', body, { screen: 'agenda' })
    }
    return { id, status: 'CANCELLED', notified: ids.length }
  }
}
