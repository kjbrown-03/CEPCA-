import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { DocumentDto, EventDto, HomeDto, NotificationDto, ProjectDto, PublicationDto, SermonDto } from '@cepca/shared'
import { AppError, NotFound, OptionalAuth, Public } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser, MaybeUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { MemberContextService, type MemberContext } from './member-context.service'
import { eventInclude, projectInclude, publicationInclude, toEvent, toProject, toPublication, toSermon } from './dto'
import { mediaUrl } from '../storage/storage.service'

const SCOPE_FILTER: Record<string, Prisma.StructureWhereInput> = {
  CEPCA: { levelType: { rank: 0 } },
  CONFESSION: { levelType: { rank: { gte: 1 }, isMembership: false } },
  PAROISSE: { levelType: { isMembership: true } },
}

@Controller('feed')
@Public()
@OptionalAuth()
export class FeedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: MemberContextService,
  ) {}

  private pubWhere(c: MemberContext, scope?: string): Prisma.PublicationWhereInput {
    return {
      status: 'PUBLISHED',
      target: { path: { in: c.visiblePaths }, ...(scope && SCOPE_FILTER[scope] ? SCOPE_FILTER[scope] : {}) },
      ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}),
      OR: [{ groupId: null }, { groupId: { in: c.groupIds } }],
    }
  }

  private eventWhere(c: MemberContext): Prisma.EventWhereInput {
    return { status: 'PUBLISHED', structure: { path: { in: c.visiblePaths } }, ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}) }
  }

  @Get('home')
  async home(@MaybeUser() p: Principal | null): Promise<HomeDto> {
    const c = await this.ctx.forPrincipal(p)
    const now = new Date()
    const [service, pubs, project, unread] = await Promise.all([
      this.prisma.event.findFirst({
        where: { ...this.eventWhere(c), kind: 'CULTE', OR: [{ startsAt: { gte: now } }, { endsAt: { gte: now } }] },
        include: eventInclude,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.publication.findMany({ where: this.pubWhere(c), include: publicationInclude, orderBy: { publishedAt: 'desc' }, take: 2 }),
      this.prisma.project.findFirst({
        where: { ...this.ctx.projectWhere(c), collectOpen: true, kind: 'PROJECT' },
        include: projectInclude,
        orderBy: { raisedAmount: 'desc' },
      }),
      p ? this.prisma.notification.count({ where: { userId: p.userId, readAt: null, deletedAt: null } }) : 0,
    ])
    const reg = service && p ? await this.prisma.eventRegistration.findFirst({ where: { eventId: service.id, userId: p.userId, cancelledAt: null } }) : null
    return {
      nextService: service ? { ...toEvent(service, !!reg), countdownTo: service.startsAt.toISOString() } : null,
      announcements: pubs.map(toPublication),
      featuredProject: project ? toProject(project) : null,
      unreadNotifications: unread,
    }
  }

  @Get('publications')
  async publications(@MaybeUser() p: Principal | null, @Query('scope') scope?: string): Promise<PublicationDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const rows = await this.prisma.publication.findMany({ where: this.pubWhere(c, scope), include: publicationInclude, orderBy: { publishedAt: 'desc' }, take: 50 })
    return rows.map(toPublication)
  }

  @Get('publications/:id')
  async publication(@MaybeUser() p: Principal | null, @Param('id') id: string): Promise<PublicationDto> {
    const c = await this.ctx.forPrincipal(p)
    const row = await this.prisma.publication.findFirst({ where: { id, ...this.pubWhere(c) }, include: publicationInclude })
    if (!row) throw NotFound('Publication')
    if (p) {
      const first = await this.prisma.publicationRead.createMany({ data: [{ publicationId: id, userId: p.userId }], skipDuplicates: true })
      if (first.count) await this.prisma.publication.update({ where: { id }, data: { readCount: { increment: 1 } } })
    }
    return toPublication(row)
  }

  @Get('events')
  async events(@MaybeUser() p: Principal | null, @Query('from') from?: string): Promise<EventDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date(Date.now() - 12 * 3600 * 1000)
    const rows = await this.prisma.event.findMany({ where: { ...this.eventWhere(c), startsAt: { gte: start } }, include: eventInclude, orderBy: { startsAt: 'asc' }, take: 60 })
    const mine = p ? new Set((await this.prisma.eventRegistration.findMany({ where: { userId: p.userId, cancelledAt: null, eventId: { in: rows.map((r) => r.id) } }, select: { eventId: true } })).map((r) => r.eventId)) : new Set<string>()
    return rows.map((e) => toEvent(e, mine.has(e.id)))
  }

  @Get('events/:id')
  async event(@MaybeUser() p: Principal | null, @Param('id') id: string): Promise<EventDto> {
    const c = await this.ctx.forPrincipal(p)
    const e = await this.prisma.event.findFirst({ where: { id, ...this.eventWhere(c) }, include: eventInclude })
    if (!e) throw NotFound('Événement')
    const reg = p ? await this.prisma.eventRegistration.findFirst({ where: { eventId: id, userId: p.userId, cancelledAt: null } }) : null
    return toEvent(e, !!reg)
  }

  @Get('sermons')
  async sermons(@MaybeUser() p: Principal | null, @Query('type') type?: string, @Query('kind') kind?: string): Promise<SermonDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const mediaType = type === 'AUDIO' || type === 'VIDEO' ? type : undefined
    const rows = await this.prisma.spiritualContent.findMany({
      where: {
        status: 'PUBLISHED',
        structure: { path: { in: c.visiblePaths } },
        ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}),
        ...(mediaType ? { mediaType } : {}),
        ...(kind ? { kind: kind as Prisma.EnumSpiritualKindFilter['equals'] } : { kind: 'PREDICATION' }),
      },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    })
    return rows.map(toSermon)
  }

  @Get('sermons/:id')
  async sermon(@MaybeUser() p: Principal | null, @Param('id') id: string): Promise<SermonDto> {
    const c = await this.ctx.forPrincipal(p)
    const s = await this.prisma.spiritualContent.findFirst({ where: { id, status: 'PUBLISHED', structure: { path: { in: c.visiblePaths } }, ...(c.status !== 'ACTIVE' ? { isPublic: true } : {}) } })
    if (!s) throw NotFound('Prédication')
    return toSermon(s)
  }

  @Get('documents')
  async documents(@MaybeUser() p: Principal | null): Promise<DocumentDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const rows = await this.prisma.document.findMany({
      where: { archivedAt: null, structure: { path: { in: c.visiblePaths } }, visibility: c.status === 'ACTIVE' ? { in: ['PUBLIC', 'MEMBERS'] } : 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
      take: 60,
    })
    return rows.map((d) => ({ id: d.id, title: d.title, category: d.category, mimeType: d.mimeType, sizeBytes: d.sizeBytes, url: mediaUrl('doc', d.id)!, createdAt: d.createdAt.toISOString() }))
  }

  @Get('projects')
  async projects(@MaybeUser() p: Principal | null): Promise<ProjectDto[]> {
    const c = await this.ctx.forPrincipal(p)
    const rows = await this.prisma.project.findMany({
      where: { ...this.ctx.projectWhere(c), status: { in: ['FUNDING', 'EXECUTION', 'COMPLETED', 'VALIDATED'] } },
      include: projectInclude,
      orderBy: [{ collectOpen: 'desc' }, { createdAt: 'asc' }],
    })
    return rows.map(toProject)
  }

  @Get('projects/:id')
  async project(@MaybeUser() p: Principal | null, @Param('id') id: string): Promise<ProjectDto> {
    const c = await this.ctx.forPrincipal(p)
    const row = await this.prisma.project.findFirst({ where: { id, ...this.ctx.projectWhere(c) }, include: projectInclude })
    if (!row) throw NotFound('Projet')
    return toProject(row)
  }
}

@Controller()
export class MemberActionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: MemberContextService,
  ) {}

  /** Inscription à une activité (§18), avec contrôle des places dans une transaction. */
  @Post('events/:id/registration')
  @HttpCode(200)
  async register(@CurrentUser() p: Principal, @Param('id') id: string) {
    const c = await this.ctx.forPrincipal(p)
    const e = await this.prisma.event.findFirst({ where: { id, status: 'PUBLISHED', structure: { path: { in: c.visiblePaths } } } })
    if (!e) throw NotFound('Événement')
    if (e.startsAt.getTime() + 3 * 3600 * 1000 < Date.now()) throw new AppError(400, 'EVENT_PAST', 'Cette activité est terminée.')
    await this.prisma.$transaction(async (tx) => {
      if (e.capacity != null) {
        // Verrou de ligne sur l'événement : deux inscriptions simultanées ne dépassent pas la capacité
        await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${id} FOR UPDATE`
        const n = await tx.eventRegistration.count({ where: { eventId: id, cancelledAt: null, NOT: { userId: p.userId } } })
        if (n >= e.capacity) throw new AppError(409, 'EVENT_FULL', 'Il n’y a plus de place pour cette activité.')
      }
      await tx.eventRegistration.upsert({
        where: { eventId_userId: { eventId: id, userId: p.userId } },
        create: { eventId: id, userId: p.userId },
        update: { cancelledAt: null, createdAt: new Date() },
      })
      await tx.notification.create({
        data: { userId: p.userId, kind: 'EVENT', title: 'Inscription confirmée', body: e.title, link: { screen: 'evt', id } },
      })
    })
    return { registered: true }
  }

  @Delete('events/:id/registration')
  async unregister(@CurrentUser() p: Principal, @Param('id') id: string) {
    await this.prisma.eventRegistration.updateMany({ where: { eventId: id, userId: p.userId, cancelledAt: null }, data: { cancelledAt: new Date() } })
    return { registered: false }
  }

  @Get('notifications')
  async notifications(@CurrentUser() p: Principal): Promise<NotificationDto[]> {
    const rows = await this.prisma.notification.findMany({ where: { userId: p.userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 50 })
    return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: (n.link as NotificationDto['link']) ?? null, createdAt: n.createdAt.toISOString(), read: !!n.readAt }))
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  async read(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: p.userId, readAt: null }, data: { readAt: new Date() } })
    return { updated: r.count }
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() p: Principal) {
    const r = await this.prisma.notification.updateMany({ where: { userId: p.userId, readAt: null }, data: { readAt: new Date() } })
    return { updated: r.count }
  }

  @Delete('notifications/:id')
  async remove(@CurrentUser() p: Principal, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: p.userId }, data: { deletedAt: new Date() } })
    return { ok: true }
  }

  @Get('me/registrations')
  async myRegistrations(@CurrentUser() p: Principal): Promise<EventDto[]> {
    const rows = await this.prisma.eventRegistration.findMany({ where: { userId: p.userId, cancelledAt: null }, include: { event: { include: eventInclude } }, orderBy: { event: { startsAt: 'desc' } } })
    return rows.map((r) => toEvent(r.event, true))
  }
}
