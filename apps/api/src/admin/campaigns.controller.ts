import { Body, Controller, Get, HttpCode, Injectable, Logger, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { z } from 'zod'
import { campaignSchema } from '@cepca/shared'
import { AppError, ClientIp, Conflict, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import { MailService } from '../mail/mail.service'
import type { Principal } from '../access/access.service'
import { env } from '../config/env'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { AudienceService, PushService } from './audience.service'

@Injectable()
export class CampaignsService {
  private readonly log = new Logger('Campagnes')

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Envoi effectif. La réservation (SCHEDULED/DRAFT → SENT) est conditionnelle : deux passages du job
   * ou un clic doublé n'envoient jamais deux fois la même notification.
   */
  async send(id: string) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id } })
    if (!c) return null
    const claimed = await this.prisma.notificationCampaign.updateMany({ where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } }, data: { status: 'SENT', sentAt: new Date() } })
    if (claimed.count !== 1) return null
    const users = await this.audience.users(c.targetStructureId, c.groupId)
    const ids = users.map((u) => u.id)
    await this.audience.inbox(ids, { kind: 'ANNOUNCEMENT', title: c.title, body: c.message, campaignId: c.id })
    if (c.channels.includes('PUSH')) await this.push.send(ids, c.title, c.message, { screen: 'notifs' })
    let emails = 0
    if (c.channels.includes('EMAIL')) {
      for (const u of users) {
        if (u.email && (await this.mail.trySend({ to: u.email, subject: `CEPCA · ${c.title}`, text: c.message }))) emails++
      }
    }
    await this.prisma.notificationCampaign.update({ where: { id }, data: { recipients: ids.length } })
    const s = await this.prisma.structure.findUnique({ where: { id: c.targetStructureId }, select: { path: true } })
    await this.audit.record({
      actorLabel: 'Système',
      category: 'PUBLICATION',
      action: `Notification « ${c.title} » envoyée à ${ids.length} personne(s)${emails ? `, dont ${emails} par e-mail` : ''}`,
      entityType: 'NotificationCampaign',
      entityId: c.id,
      structureId: c.targetStructureId,
      structurePath: s?.path,
    })
    return { recipients: ids.length, emails }
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'campaigns-scheduled', disabled: env.NODE_ENV === 'test' })
  async runScheduled(now = new Date()) {
    const due = await this.prisma.notificationCampaign.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true }, take: 20 })
    for (const c of due) await this.send(c.id).catch((e) => this.log.error(`Campagne ${c.id} : ${(e as Error).message}`))
    return due.length
  }
}

@Controller('admin/campaigns')
@UseGuards(StaffGuard)
export class AdminCampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly audience: AudienceService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get()
  async list(@CurrentUser() p: Principal, @Query('cursor') cursor?: string) {
    this.scope.requireAny(p, 'NOTIFICATIONS', 'read')
    const paths = this.scope.access.scopePaths(p, 'NOTIFICATIONS', 'read')
    const targets = await this.prisma.structure.findMany({ where: this.scope.access.pathFilter(paths), select: { id: true, name: true } })
    const names = new Map(targets.map((t) => [t.id, t.name]))
    const rows = await this.prisma.notificationCampaign.findMany({
      where: { targetStructureId: { in: [...names.keys()] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...cursorArgs(cursor ? String(cursor).slice(0, 40) : undefined),
    })
    const read = await this.prisma.notification.groupBy({ by: ['campaignId'], where: { campaignId: { in: rows.map((r) => r.id) }, readAt: { not: null } }, _count: true })
    const opened = new Map(read.map((r) => [r.campaignId, r._count]))
    const r = page(rows)
    return {
      items: r.items.map((c) => ({
        id: c.id,
        title: c.title,
        message: c.message,
        channels: c.channels,
        audience: names.get(c.targetStructureId) ?? '',
        groupId: c.groupId,
        status: c.status,
        scheduledAt: c.scheduledAt?.toISOString() ?? null,
        sentAt: c.sentAt?.toISOString() ?? null,
        recipients: c.recipients,
        opened: opened.get(c.id) ?? 0,
      })),
      nextCursor: r.nextCursor,
    }
  }

  /** Aperçu avant envoi : nombre de destinataires. */
  @Get('estimate')
  async estimate(@CurrentUser() p: Principal, @Query('targetStructureId') targetStructureId: string, @Query('groupId') groupId?: string) {
    const s = await this.scope.structure(p, 'NOTIFICATIONS', 'write', String(targetStructureId ?? ''))
    if (groupId) await this.audience.assertGroup(String(groupId), s.path)
    const recipients = await this.audience.count(s.id, groupId ? String(groupId) : null)
    return { recipients }
  }

  @Post()
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(campaignSchema)) body: z.infer<typeof campaignSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'NOTIFICATIONS', 'write', body.targetStructureId)
    if (body.groupId) await this.audience.assertGroup(body.groupId, s.path)
    const at = body.scheduledAt ? new Date(body.scheduledAt) : null
    if (at && at.getTime() < Date.now() - 60_000) throw new AppError(400, 'VALIDATION', 'La date programmée est passée.', { scheduledAt: 'Date passée' })
    const recipients = await this.audience.count(s.id, body.groupId)
    const c = await this.prisma.$transaction(async (tx) => {
      const c = await tx.notificationCampaign.create({
        data: {
          confessionId: s.confessionId,
          targetStructureId: s.id,
          groupId: body.groupId ?? null,
          title: body.title,
          message: body.message,
          channels: body.channels,
          scheduledAt: at,
          recipients,
          status: at ? 'SCHEDULED' : 'DRAFT',
          createdById: p.userId,
        },
      })
      await this.audit.record(
        { ...actor(p, ip), category: 'PUBLICATION', action: `${at ? 'A programmé' : 'A envoyé'} la notification « ${c.title} » (${recipients} destinataire(s), ${body.channels.join(' + ')})`, entityType: 'NotificationCampaign', entityId: c.id, structureId: s.id, structurePath: s.path },
        tx,
      )
      return c
    })
    const sent = at ? null : await this.campaigns.send(c.id)
    return { id: c.id, status: at ? 'SCHEDULED' : 'SENT', recipients: sent?.recipients ?? recipients }
  }

  /**
   * Audiences ciblables depuis une structure (publications, notifications) : toute la communauté,
   * puis chacun de ses groupes, avec le nombre de destinataires.
   */
  @Get('audiences')
  async audiences(@CurrentUser() p: Principal, @Query('structureId') structureId: string) {
    const s = await this.prisma.structure.findUnique({ where: { id: String(structureId ?? '') }, select: { id: true, name: true, path: true } })
    if (!s || !(['NEWS', 'NOTIFICATIONS'] as const).some((m) => this.scope.access.can(p, m, 'write', s.path))) throw NotFound('Structure')
    const groups = await this.prisma.group.findMany({
      where: { structure: { path: { startsWith: s.path } } },
      select: { id: true, name: true, structure: { select: { name: true } }, _count: { select: { members: { where: { status: 'ACTIVE' } } } } },
      orderBy: { name: 'asc' },
      take: 50,
    })
    return {
      structure: { id: s.id, name: s.name },
      all: await this.audience.count(s.id, null),
      groups: groups.map((g) => ({ id: g.id, name: g.name, structure: g.structure.name, recipients: g._count.members })),
    }
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const c = await this.prisma.notificationCampaign.findUnique({ where: { id } })
    const s = c ? await this.prisma.structure.findUnique({ where: { id: c.targetStructureId }, select: { id: true, path: true } }) : null
    if (!c || !s) throw NotFound('Notification')
    this.scope.access.assert(p, 'NOTIFICATIONS', 'write', s.path, 'Notification')
    const moved = await this.prisma.notificationCampaign.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seule une notification programmée peut être annulée.')
    await this.audit.record({ ...actor(p, ip), category: 'PUBLICATION', action: `A annulé la notification programmée « ${c.title} »`, entityType: 'NotificationCampaign', entityId: id, structureId: s.id, structurePath: s.path })
    return { id, status: 'CANCELLED' }
  }
}
