import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  CHANNEL_LABEL,
  CONTRIBUTION_STATUS_LABEL,
  closingSchema,
  contributionListSchema,
  fmtFcfa,
  manualContributionSchema,
  refundExecuteSchema,
  refundRequestSchema,
  resolveContributionSchema,
} from '@cepca/shared'
import { AppError, ClientIp, Conflict, Forbidden, NotFound, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import { ancestorPaths, type Principal } from '../access/access.service'
import { ContributionsService, nextReceiptNumber } from '../payments/contributions.service'
import { AdminScope, StaffGuard, actor, cursorArgs, page } from './admin-common'
import { doualaYm, monthLabel, monthRange } from './period'

/** Au-delà, un paiement en attente est un écart à rapprocher (l'opérateur n'a pas répondu). */
const GAP_AFTER_MS = 15 * 60 * 1000

const rowInclude = {
  type: { select: { label: true } },
  structure: { select: { id: true, name: true, path: true } },
  project: { select: { id: true, title: true } },
  user: { select: { id: true, fullName: true } },
  transactions: { orderBy: { requestedAt: 'desc' }, take: 1, select: { id: true, providerRef: true, status: true, requestedAt: true } },
} as const satisfies Prisma.ContributionInclude
type Row = Prisma.ContributionGetPayload<{ include: typeof rowInclude }>

function rowDto(c: Row) {
  const tx = c.transactions[0]
  const manual = !!c.manualEntryById
  return {
    id: c.id,
    at: (c.confirmedAt ?? c.createdAt).toISOString(),
    payer: c.user?.fullName ?? c.payerLabel ?? 'Anonyme',
    type: c.type.label,
    destination: c.project ? `${c.type.label} · ${c.project.title}` : c.structure.name,
    structure: { id: c.structure.id, name: c.structure.name },
    channel: c.channel,
    channelLabel: CHANNEL_LABEL[c.channel] ?? c.channel,
    amount: c.amount,
    fee: c.fee,
    net: c.net,
    status: c.status,
    statusLabel: manual ? 'Saisie manuelle' : CONTRIBUTION_STATUS_LABEL[c.status],
    manual,
    reference: c.receiptNumber ?? tx?.providerRef ?? null,
    receiptNumber: c.receiptNumber,
    recurring: !!c.recurringPlanId,
    statusReason: c.statusReason,
  }
}

@Controller('admin')
@UseGuards(StaffGuard)
export class AdminFinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
    private readonly payments: ContributionsService,
  ) {}

  private async contribution(p: Principal, id: string, action: 'read' | 'write' | 'validate') {
    const c = await this.prisma.contribution.findUnique({ where: { id }, include: rowInclude })
    if (!c) throw NotFound('Contribution')
    this.scope.access.assert(p, 'CONTRIBUTIONS', action, c.structure.path, 'Contribution')
    return c
  }

  /** Liste nominative : un droit agrégé (CEPCA) n'y a pas accès, il passe par les rapports. */
  @Get('contributions')
  async list(@CurrentUser() p: Principal, @Query(new ZodPipe(contributionListSchema)) q: z.infer<typeof contributionListSchema>) {
    const structure = await this.scope.whereWithin(p, 'CONTRIBUTIONS', q.structureId)
    const base: Prisma.ContributionWhereInput = {
      structure,
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    }
    const where: Prisma.ContributionWhereInput = {
      ...base,
      ...(q.status === 'MANUAL' ? { manualEntryById: { not: null } } : q.status ? { status: q.status } : {}),
      ...(q.q
        ? { OR: [{ receiptNumber: { contains: q.q, mode: 'insensitive' } }, { payerLabel: { contains: q.q, mode: 'insensitive' } }, { user: { fullName: { contains: q.q, mode: 'insensitive' } } }, { transactions: { some: { providerRef: { contains: q.q } } } }] }
        : {}),
    }
    const [rows, byStatus] = await Promise.all([
      this.prisma.contribution.findMany({ where, include: rowInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...cursorArgs(q.cursor) }),
      this.prisma.contribution.groupBy({ by: ['status'], where: base, _sum: { amount: true }, _count: true }),
    ])
    const get = (s: string) => byStatus.find((b) => b.status === s)
    const ok = get('SUCCEEDED')?._count ?? 0
    const failed = (get('FAILED')?._count ?? 0) + (get('CANCELLED')?._count ?? 0)
    const r = page(rows)
    return {
      items: r.items.map(rowDto),
      nextCursor: r.nextCursor,
      summary: {
        collected: get('SUCCEEDED')?._sum.amount ?? 0,
        succeeded: ok,
        pending: get('PENDING')?._count ?? 0,
        failed,
        successRate: ok + failed ? Math.round((ok / (ok + failed)) * 1000) / 10 : null,
      },
    }
  }

  @Get('contributions/:id')
  async one(@CurrentUser() p: Principal, @Param('id') id: string) {
    const c = await this.contribution(p, id, 'read')
    const [transactions, refunds] = await Promise.all([
      this.prisma.paymentTransaction.findMany({ where: { contributionId: id }, orderBy: { requestedAt: 'asc' } }),
      this.prisma.refund.findMany({ where: { contributionId: id }, orderBy: { createdAt: 'asc' } }),
    ])
    return {
      ...rowDto(c),
      payerPhone: c.payerPhone,
      transactions: transactions.map((t) => ({ id: t.id, provider: t.provider, providerRef: t.providerRef, status: t.status, providerStatus: t.providerStatus, amount: t.amount, requestedAt: t.requestedAt.toISOString(), resolvedAt: t.resolvedAt?.toISOString() ?? null, failureReason: t.failureReason })),
      refunds: refunds.map((r) => ({ id: r.id, amount: r.amount, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString(), executedAt: r.executedAt?.toISOString() ?? null })),
    }
  }

  /** Mois clos pour cette structure ou l'un de ses ancêtres (une clôture couvre le sous-arbre). */
  private async closed(path: string, at: Date) {
    const { year, month } = doualaYm(at)
    return this.prisma.periodClosing.findFirst({ where: { year, month, structureId: { in: (await this.prisma.structure.findMany({ where: { path: { in: ancestorPaths(path) } }, select: { id: true } })).map((s) => s.id) } } })
  }

  /** Types actifs proposés à la saisie manuelle (le responsable financier n'a pas accès au paramétrage). */
  @Get('contribution-types')
  async types(@CurrentUser() p: Principal, @Query('structureId') structureId: string) {
    const s = await this.scope.structure(p, 'CONTRIBUTIONS', 'write', String(structureId ?? ''))
    if (!s.confessionId) return []
    const rows = await this.prisma.contributionType.findMany({ where: { confessionId: s.confessionId, active: true }, orderBy: [{ position: 'asc' }, { label: 'asc' }] })
    return rows.map((t) => ({ key: t.key, label: t.label, requiresProject: t.requiresProject }))
  }

  /** Saisie manuelle (espèces, virement) : réussie d'emblée, reçu numéroté dans la même séquence. */
  @Post('contributions/manual')
  @Throttle({ default: { limit: 60, ttl: 10 * 60 * 1000 } })
  async manual(@CurrentUser() p: Principal, @Body(new ZodPipe(manualContributionSchema)) body: z.infer<typeof manualContributionSchema>, @ClientIp() ip: string | null) {
    const existing = await this.prisma.contribution.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: rowInclude })
    if (existing) {
      if (existing.manualEntryById !== p.userId || existing.amount !== body.amount) throw Conflict('IDEMPOTENCY_CONFLICT', 'Cette saisie a déjà été enregistrée avec d’autres informations.')
      return rowDto(existing)
    }
    const s = await this.scope.structure(p, 'CONTRIBUTIONS', 'write', body.structureId)
    if (!s.confessionId) throw new AppError(400, 'NO_CONFESSION', 'Les contributions se saisissent au niveau d’une confession ou en dessous.')
    const at = body.receivedAt ? new Date(body.receivedAt) : new Date()
    if (at.getTime() > Date.now() + 5 * 60_000) throw new AppError(400, 'VALIDATION', 'La date de réception est dans le futur.', { receivedAt: 'Date future' })
    const closing = await this.closed(s.path, at)
    if (closing) throw Conflict('PERIOD_CLOSED', `Le mois de ${monthLabel(closing.month)} ${closing.year} est clôturé : saisissez la contribution à la date du jour.`)
    const type = await this.prisma.contributionType.findUnique({ where: { confessionId_key: { confessionId: s.confessionId, key: body.typeKey } } })
    if (!type || !type.active) throw NotFound('Type de contribution')
    let structureId = s.id
    let projectId: string | null = null
    if (type.requiresProject || body.projectId) {
      if (!body.projectId) throw new AppError(400, 'PROJECT_REQUIRED', 'Choisissez le projet.')
      const project = await this.prisma.project.findFirst({ where: { id: body.projectId, structure: { path: { startsWith: s.path } }, status: { not: 'CLOSED' } } })
      if (!project) throw NotFound('Projet')
      structureId = project.structureId
      projectId = project.id
    }
    const c = await this.prisma.$transaction(async (tx) => {
      const receiptNumber = await nextReceiptNumber(tx, s.confessionId!, at)
      const c = await tx.contribution.create({
        data: {
          idempotencyKey: body.idempotencyKey,
          confessionId: s.confessionId!,
          structureId,
          projectId,
          typeId: type.id,
          payerLabel: body.payerLabel,
          amount: body.amount,
          fee: 0,
          net: body.amount,
          totalCharged: body.amount,
          channel: body.channel,
          status: 'SUCCEEDED',
          statusReason: body.note,
          receiptNumber,
          manualEntryById: p.userId,
          createdAt: at,
          confirmedAt: at,
        },
        include: rowInclude,
      })
      if (projectId) await tx.project.update({ where: { id: projectId }, data: { raisedAmount: { increment: body.amount }, contributorCount: { increment: 1 } } })
      await this.audit.record(
        { ...actor(p, ip), category: 'PAIEMENT', action: `Saisie manuelle : ${type.label} ${fmtFcfa(body.amount)} (${CHANNEL_LABEL[body.channel]}, ${receiptNumber})`, entityType: 'Contribution', entityId: c.id, structureId: s.id, structurePath: s.path },
        tx,
      )
      return c
    })
    return rowDto(c)
  }

  /** « Relancer » : nouvelle interrogation de l'opérateur pour un paiement en attente. */
  @Post('contributions/:id/recheck')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60 * 1000 } })
  async recheck(@CurrentUser() p: Principal, @Param('id') id: string) {
    const c = await this.contribution(p, id, 'write')
    if (c.status !== 'PENDING') return rowDto(c)
    const tx = c.transactions[0]
    if (tx) await this.payments.refresh(tx.id, true)
    return rowDto(await this.prisma.contribution.findUniqueOrThrow({ where: { id }, include: rowInclude }))
  }

  /**
   * Rapprochement manuel d'un écart (l'opérateur ne répond plus) : décision d'un responsable qui valide,
   * appuyée sur une preuve (relevé opérateur), tracée au journal.
   */
  @Post('contributions/:id/resolve')
  @HttpCode(200)
  async resolve(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(resolveContributionSchema)) body: z.infer<typeof resolveContributionSchema>, @ClientIp() ip: string | null) {
    const c = await this.contribution(p, id, 'validate')
    const tx = c.transactions[0]
    if (c.status !== 'PENDING' || !tx) throw Conflict('NOT_PENDING', 'Seul un paiement en attente se rapproche.')
    if (Date.now() - tx.requestedAt.getTime() < GAP_AFTER_MS) throw Conflict('TOO_EARLY', "L'opérateur peut encore répondre : relancez plutôt la vérification.")
    // Dernière chance : la réponse de l'opérateur l'emporte sur la décision manuelle
    await this.payments.refresh(tx.id, true)
    const after = await this.prisma.contribution.findUniqueOrThrow({ where: { id }, select: { status: true } })
    if (after.status === 'PENDING') {
      await this.payments.resolve(tx.id, { status: body.status, raw: 'MANUAL_RECONCILIATION', reason: body.status === 'FAILED' ? `Rapprochement : ${body.note}` : undefined })
    }
    const done = await this.prisma.contribution.findUniqueOrThrow({ where: { id }, include: rowInclude })
    await this.audit.record({
      ...actor(p, ip),
      category: 'VALIDATION',
      action: after.status === 'PENDING' ? `Rapprochement manuel : ${c.type.label} ${fmtFcfa(c.amount)} → ${CONTRIBUTION_STATUS_LABEL[done.status]}` : `Rapprochement demandé, résolu par l'opérateur : ${CONTRIBUTION_STATUS_LABEL[done.status]}`,
      entityType: 'Contribution',
      entityId: id,
      structureId: c.structure.id,
      structurePath: c.structure.path,
      metadata: { note: body.note, providerRef: tx.providerRef },
    })
    return rowDto(done)
  }

  /** Écarts : paiements toujours en attente au-delà de 15 minutes. */
  @Get('reconciliation')
  async gaps(@CurrentUser() p: Principal, @Query('structureId') structureId?: string) {
    const structure = await this.scope.whereWithin(p, 'CONTRIBUTIONS', structureId ? String(structureId) : undefined)
    const rows = await this.prisma.contribution.findMany({
      where: { structure, status: 'PENDING', createdAt: { lt: new Date(Date.now() - GAP_AFTER_MS) } },
      include: rowInclude,
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return rows.map(rowDto)
  }

  // ── Remboursements (§55) : demande → validation par une autre personne → exécution ──

  @Post('contributions/:id/refunds')
  async requestRefund(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(refundRequestSchema)) body: z.infer<typeof refundRequestSchema>, @ClientIp() ip: string | null) {
    const c = await this.contribution(p, id, 'write')
    if (c.status !== 'SUCCEEDED') throw Conflict('NOT_REFUNDABLE', 'Seule une contribution réussie peut être remboursée.')
    const open = await this.prisma.refund.aggregate({ where: { contributionId: id, status: { not: 'REJECTED' } }, _sum: { amount: true } })
    const left = c.amount - (open._sum.amount ?? 0)
    const amount = body.amount ?? left
    if (amount <= 0 || amount > left) throw new AppError(400, 'AMOUNT_TOO_HIGH', `Montant remboursable restant : ${fmtFcfa(Math.max(0, left))}.`)
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.refund.create({ data: { contributionId: id, amount, reason: body.reason, requestedById: p.userId } })
      await this.audit.record({ ...actor(p, ip), category: 'PAIEMENT', action: `A demandé le remboursement de ${fmtFcfa(amount)} (${c.receiptNumber ?? c.id})`, entityType: 'Refund', entityId: r.id, structureId: c.structure.id, structurePath: c.structure.path, metadata: { reason: body.reason } }, tx)
      return r
    })
    return { id: r.id, status: r.status, amount: r.amount }
  }

  @Get('refunds')
  async refunds(@CurrentUser() p: Principal, @Query('status') status?: string) {
    const structure = await this.scope.whereWithin(p, 'CONTRIBUTIONS')
    const st = ['REQUESTED', 'VALIDATED', 'EXECUTED', 'REJECTED'].includes(String(status)) ? (status as 'REQUESTED') : undefined
    const rows = await this.prisma.refund.findMany({
      where: { contribution: { structure }, ...(st ? { status: st } : {}) },
      include: { contribution: { include: rowInclude } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((r) => ({ id: r.id, amount: r.amount, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString(), requestedByMe: r.requestedById === p.userId, contribution: rowDto(r.contribution) }))
  }

  private async refund(p: Principal, id: string) {
    const r = await this.prisma.refund.findUnique({ where: { id }, include: { contribution: { include: rowInclude } } })
    if (!r) throw NotFound('Remboursement')
    this.scope.access.assert(p, 'CONTRIBUTIONS', 'validate', r.contribution.structure.path, 'Remboursement')
    return r
  }

  @Post('refunds/:id/validate')
  @HttpCode(200)
  async validateRefund(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.refund(p, id)
    // Quatre yeux : on ne valide pas sa propre demande
    if (r.requestedById === p.userId) throw Forbidden('Un autre responsable doit valider votre demande de remboursement.')
    const moved = await this.prisma.refund.updateMany({ where: { id, status: 'REQUESTED' }, data: { status: 'VALIDATED', validatedById: p.userId } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Cette demande a déjà été traitée.')
    await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A validé le remboursement de ${fmtFcfa(r.amount)} (${r.contribution.receiptNumber ?? r.contributionId})`, entityType: 'Refund', entityId: id, structureId: r.contribution.structure.id, structurePath: r.contribution.structure.path })
    return { id, status: 'VALIDATED' }
  }

  @Post('refunds/:id/reject')
  @HttpCode(200)
  async rejectRefund(@CurrentUser() p: Principal, @Param('id') id: string, @ClientIp() ip: string | null) {
    const r = await this.refund(p, id)
    const moved = await this.prisma.refund.updateMany({ where: { id, status: { in: ['REQUESTED', 'VALIDATED'] } }, data: { status: 'REJECTED', validatedById: p.userId } })
    if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Cette demande a déjà été traitée.')
    await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A refusé le remboursement de ${fmtFcfa(r.amount)}`, entityType: 'Refund', entityId: id, structureId: r.contribution.structure.id, structurePath: r.contribution.structure.path })
    return { id, status: 'REJECTED' }
  }

  /**
   * Exécution : le virement de retour est fait chez l'opérateur (hors plateforme), sa référence est saisie ici.
   * Le montant sort du projet ; la contribution passe « Remboursée » quand tout est rendu.
   */
  @Post('refunds/:id/execute')
  @HttpCode(200)
  async executeRefund(@CurrentUser() p: Principal, @Param('id') id: string, @Body(new ZodPipe(refundExecuteSchema)) body: z.infer<typeof refundExecuteSchema>, @ClientIp() ip: string | null) {
    const r = await this.refund(p, id)
    const c = r.contribution
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.refund.updateMany({ where: { id, status: 'VALIDATED' }, data: { status: 'EXECUTED', executedAt: new Date(), providerRef: body.providerRef } })
      if (moved.count !== 1) throw Conflict('BAD_STATUS', 'Seul un remboursement validé peut être exécuté.')
      const done = await tx.refund.aggregate({ where: { contributionId: c.id, status: 'EXECUTED' }, _sum: { amount: true } })
      if ((done._sum.amount ?? 0) >= c.amount) await tx.contribution.update({ where: { id: c.id }, data: { status: 'REFUNDED', statusReason: r.reason } })
      if (c.projectId) await tx.project.update({ where: { id: c.projectId }, data: { raisedAmount: { decrement: r.amount } } })
      if (c.userId) {
        await tx.notification.create({ data: { userId: c.userId, kind: 'PAYMENT', title: 'Remboursement effectué', body: `${c.type.label} · ${fmtFcfa(r.amount)} vous a été remboursé.`, link: { screen: 'hist' } } })
      }
      await this.audit.record({ ...actor(p, ip), category: 'PAIEMENT', action: `A exécuté le remboursement de ${fmtFcfa(r.amount)} (réf. ${body.providerRef})`, entityType: 'Refund', entityId: id, structureId: c.structure.id, structurePath: c.structure.path }, tx)
    })
    return { id, status: 'EXECUTED' }
  }

  // ── Clôture mensuelle ──

  @Get('closings')
  async closings(@CurrentUser() p: Principal, @Query('structureId') structureId: string) {
    const s = await this.scope.structure(p, 'CONTRIBUTIONS', 'read', String(structureId ?? ''))
    const rows = await this.prisma.periodClosing.findMany({ where: { structureId: s.id }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 24 })
    return rows.map((r) => ({ id: r.id, year: r.year, month: r.month, label: `${monthLabel(r.month)} ${r.year}`, total: r.total, txCount: r.txCount, closedAt: r.closedAt.toISOString() }))
  }

  /** Refusée tant qu'il reste des paiements en attente sur le mois (README) ; le mois en cours ne se clôt pas. */
  @Post('closings')
  async close(@CurrentUser() p: Principal, @Body(new ZodPipe(closingSchema)) body: z.infer<typeof closingSchema>, @ClientIp() ip: string | null) {
    const s = await this.scope.structure(p, 'CONTRIBUTIONS', 'validate', body.structureId)
    const { from, to } = monthRange(body.year, body.month)
    if (to.getTime() > Date.now()) throw new AppError(400, 'MONTH_NOT_OVER', 'Un mois ne se clôture qu’une fois terminé.')
    const under = { path: { startsWith: s.path } }
    const pending = await this.prisma.contribution.count({ where: { structure: under, status: 'PENDING', createdAt: { gte: from, lt: to } } })
    if (pending > 0) throw Conflict('PENDING_PAYMENTS', `${pending} paiement(s) en attente sur ce mois : rapprochez-les avant de clôturer.`)
    if (await this.closed(s.path, from)) throw Conflict('ALREADY_CLOSED', 'Ce mois est déjà clôturé pour cette structure.')
    const agg = await this.prisma.contribution.aggregate({ where: { structure: under, status: 'SUCCEEDED', confirmedAt: { gte: from, lt: to } }, _sum: { amount: true }, _count: true })
    const label = `${monthLabel(body.month)} ${body.year}`
    const c = await this.prisma.$transaction(async (tx) => {
      const c = await tx.periodClosing.create({ data: { structureId: s.id, year: body.year, month: body.month, total: agg._sum.amount ?? 0, txCount: agg._count, closedById: p.userId } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A clôturé ${label} : ${agg._count} contribution(s), ${fmtFcfa(agg._sum.amount ?? 0)}`, entityType: 'PeriodClosing', entityId: c.id, structureId: s.id, structurePath: s.path }, tx)
      return c
    })
    return { id: c.id, label, total: c.total, txCount: c.txCount }
  }
}
