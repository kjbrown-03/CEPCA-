import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import {
  CHANNEL_LABEL,
  createContributionSchema,
  type ContributionDto,
  type ContributionHistoryDto,
  type ContributionTypeDto,
  type CreateContributionInput,
  type CreateContributionResult,
  type RecurringPlanDto,
} from '@cepca/shared'
import { AppError, NotFound, Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { contributionInclude, toContribution } from '../member/dto'
import { ContributionsService } from './contributions.service'
import { renderReceipt } from './receipt'
import { effectiveSettings } from '../common/settings'

const PAGE = 20

@Controller('contributions')
export class ContributionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: ContributionsService,
  ) {}

  @Get('types')
  async types(@CurrentUser() p: Principal): Promise<ContributionTypeDto[]> {
    return this.service.types(p)
  }

  /** Contribuer → Paiement. La réponse arrive avant la confirmation : l'app interroge ensuite GET /contributions/:id. */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  async create(@CurrentUser() p: Principal, @Body(new ZodPipe(createContributionSchema)) body: CreateContributionInput): Promise<CreateContributionResult> {
    const { id, redirectUrl } = await this.service.create(p, body)
    const c = await this.prisma.contribution.findUniqueOrThrow({ where: { id }, include: contributionInclude })
    return {
      contribution: toContribution(c),
      paymentUrl: redirectUrl,
      instructions: redirectUrl
        ? 'Terminez le paiement sur la page Orange Money qui vient de s’ouvrir.'
        : `Confirmez le paiement sur votre téléphone en saisissant votre code secret ${CHANNEL_LABEL[body.channel]}.`,
    }
  }

  /** Écran « Mes contributions » : du plus récent au plus ancien, total des paiements réussis. */
  @Get()
  async history(@CurrentUser() p: Principal, @Query('cursor') cursor?: string): Promise<ContributionHistoryDto> {
    const rows = await this.prisma.contribution.findMany({
      where: { userId: p.userId, status: { in: ['SUCCEEDED', 'PENDING', 'FAILED', 'REFUNDED'] } },
      include: contributionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: String(cursor).slice(0, 40) }, skip: 1 } : {}),
    })
    const [agg, first] = await Promise.all([
      this.prisma.contribution.aggregate({ where: { userId: p.userId, status: 'SUCCEEDED' }, _sum: { amount: true }, _count: true }),
      this.prisma.contribution.findFirst({ where: { userId: p.userId, status: 'SUCCEEDED' }, orderBy: { confirmedAt: 'asc' }, select: { confirmedAt: true } }),
    ])
    const items = rows.slice(0, PAGE).map(toContribution)
    return {
      items,
      nextCursor: rows.length > PAGE ? items[items.length - 1].id : null,
      summary: { total: agg._sum.amount ?? 0, count: agg._count, since: first?.confirmedAt?.toISOString() ?? null },
    }
  }

  /** Suivi d'un paiement. Tant qu'il est en attente, chaque lecture relance la vérification auprès de l'opérateur. */
  @Get(':id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string): Promise<ContributionDto> {
    await this.service.getForUser(p.userId, id)
    const c = await this.prisma.contribution.findUniqueOrThrow({ where: { id }, include: contributionInclude })
    return toContribution(c)
  }

  @Get(':id/receipt.pdf')
  async receipt(@CurrentUser() p: Principal, @Param('id') id: string, @Res() res: Response) {
    const c = await this.prisma.contribution.findFirst({
      where: { id, userId: p.userId },
      include: { ...contributionInclude, structure: { select: { name: true, path: true } }, user: { select: { fullName: true } }, transactions: { where: { status: 'SUCCEEDED' }, take: 1 } },
    })
    if (!c) throw NotFound('Contribution')
    if (!c.receiptNumber || !c.confirmedAt) throw new AppError(409, 'NO_RECEIPT', 'Le reçu sera disponible dès que l’opérateur aura confirmé le paiement.')
    const conf = await this.prisma.confession.findUniqueOrThrow({ where: { id: c.confessionId }, select: { name: true } })
    const pdf = await renderReceipt({
      receiptNumber: c.receiptNumber,
      confessionName: conf.name,
      payerName: c.user?.fullName ?? c.payerLabel ?? '—',
      payerPhone: c.payerPhone,
      type: c.type.label,
      destination: c.project?.title ?? c.structure.name,
      amount: c.amount,
      fee: c.fee,
      totalCharged: c.totalCharged,
      channel: c.channel,
      providerRef: c.transactions[0]?.providerRef ?? null,
      confirmedAt: c.confirmedAt,
      refunded: c.status === 'REFUNDED',
      note: (await effectiveSettings(this.prisma, c.structure.path)).receiptNote || undefined,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="recu-${c.receiptNumber}.pdf"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.end(pdf)
  }
}

@Controller('me/recurring')
export class RecurringController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() p: Principal): Promise<RecurringPlanDto[]> {
    const plans = await this.prisma.recurringPlan.findMany({ where: { userId: p.userId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' } })
    const [types, structures, projects] = await Promise.all([
      this.prisma.contributionType.findMany({ where: { id: { in: plans.map((x) => x.typeId) } }, select: { id: true, label: true } }),
      this.prisma.structure.findMany({ where: { id: { in: plans.map((x) => x.structureId) } }, select: { id: true, name: true } }),
      this.prisma.project.findMany({ where: { id: { in: plans.flatMap((x) => (x.projectId ? [x.projectId] : [])) } }, select: { id: true, title: true } }),
    ])
    const name = <T extends { id: string }>(xs: T[], id: string | null, f: (x: T) => string) => {
      const x = id ? xs.find((y) => y.id === id) : undefined
      return x ? f(x) : ''
    }
    return plans.map((x) => ({
      id: x.id,
      type: name(types, x.typeId, (t) => t.label),
      destination: name(projects, x.projectId, (t) => t.title) || name(structures, x.structureId, (s) => s.name),
      amount: x.amount,
      channel: x.channel,
      channelLabel: CHANNEL_LABEL[x.channel] ?? x.channel,
      nextRunAt: x.nextRunAt.toISOString(),
      status: x.status,
    }))
  }

  /** Arrêt de la contribution mensuelle, à tout moment. */
  @Delete(':id')
  async cancel(@CurrentUser() p: Principal, @Param('id') id: string) {
    const r = await this.prisma.recurringPlan.updateMany({ where: { id, userId: p.userId, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } })
    if (r.count === 0) throw NotFound('Contribution mensuelle')
    return { ok: true }
  }
}

/** Webhook Fapshi : adresse à déclarer sur le tableau de bord du service, avec un secret (en-tête x-wh-secret). */
@Controller('payments/webhooks')
@Public()
@Throttle({ default: { limit: 600, ttl: 60 * 1000 } })
export class WebhooksController {
  constructor(private readonly service: ContributionsService) {}

  @Post('fapshi')
  @HttpCode(200)
  async fapshi(@Headers('x-wh-secret') secret: string | undefined, @Req() req: Request) {
    await this.service.fapshiWebhook(secret, req.body)
    return { ok: true }
  }
}
