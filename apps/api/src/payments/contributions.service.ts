import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { PaymentChannel, Prisma } from '@prisma/client'
import { createHash, randomBytes } from 'node:crypto'
import { dayMonth, fmtFcfa, maskPhone, operatorFee, type CreateContributionInput } from '@cepca/shared'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { AppError, NotFound } from '../common/http'
import type { Principal } from '../access/access.service'
import { MemberContextService } from '../member/member-context.service'
import { MtnMomoProvider, OrangeMoneyProvider, ProviderError, SandboxProvider, type PaymentProvider, type ProviderStatus } from './providers'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Au-delà, une transaction toujours en attente n'est plus interrogée : elle part en rapprochement manuel. */
const RECONCILE_WINDOW_MS = 48 * 3600 * 1000
/** Intervalle minimal entre deux interrogations de l'opérateur pour une même transaction. */
const MIN_CHECK_INTERVAL_MS = 3000

type Tx = Prisma.TransactionClient

/** Premier jour du mois suivant, 06:00 à Douala (UTC+1 toute l'année) */
export function nextMonthlyRun(from: Date, dayOfMonth = 1): Date {
  const douala = new Date(from.getTime() + 3600 * 1000)
  return new Date(Date.UTC(douala.getUTCFullYear(), douala.getUTCMonth() + 1, dayOfMonth, 5, 0, 0))
}

@Injectable()
export class ContributionsService {
  private readonly log = new Logger('Contributions')

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ctx: MemberContextService,
    private readonly sandbox: SandboxProvider,
    private readonly momo: MtnMomoProvider,
    private readonly orange: OrangeMoneyProvider,
  ) {}

  /** En bac à sable, les deux canaux passent par le simulateur ; la contribution garde le canal choisi par le fidèle. */
  providerFor(channel: PaymentChannel): PaymentProvider {
    if (env.PAYMENT_MODE === 'SANDBOX') return this.sandbox
    if (channel === 'MTN_MOMO') return this.momo
    if (channel === 'ORANGE_MONEY') return this.orange
    throw new AppError(400, 'CHANNEL_UNAVAILABLE', 'Ce moyen de paiement n’est pas disponible.')
  }

  private providerByTxChannel(provider: PaymentChannel): PaymentProvider {
    return provider === 'SANDBOX' ? this.sandbox : this.providerFor(provider)
  }

  async types(p: Principal) {
    const c = await this.ctx.forPrincipal(p)
    if (!c.confessionId) return []
    return this.prisma.contributionType.findMany({
      where: { confessionId: c.confessionId, active: true },
      select: { key: true, label: true, requiresProject: true },
      orderBy: { position: 'asc' },
    })
  }

  /**
   * Création + demande de paiement à l'opérateur. Rien n'est compté à ce stade : la contribution
   * reste PENDING jusqu'à ce que l'opérateur confirme.
   */
  async create(p: Principal, input: CreateContributionInput) {
    const existing = await this.prisma.contribution.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
    if (existing) {
      // Double appui ou nouvel envoi après une coupure réseau : on renvoie la même contribution
      if (existing.userId !== p.userId || existing.amount !== input.amount) {
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Cette demande a déjà été traitée avec d’autres informations.')
      }
      return { id: existing.id, redirectUrl: null as string | null }
    }

    const c = await this.ctx.forPrincipal(p)
    if (!c.confessionId || !c.membershipPath) {
      throw new AppError(400, 'NO_MEMBERSHIP', 'Rattachez-vous d’abord à une paroisse pour contribuer.')
    }
    const type = await this.prisma.contributionType.findUnique({ where: { confessionId_key: { confessionId: c.confessionId, key: input.typeKey } } })
    if (!type || !type.active) throw NotFound('Type de contribution')

    let structureId: string
    let projectId: string | null = null
    let label = type.label
    if (type.requiresProject || input.projectId) {
      if (!input.projectId) throw new AppError(400, 'PROJECT_REQUIRED', 'Choisissez le projet à soutenir.')
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, ...this.ctx.projectWhere(c) } })
      if (!project) throw NotFound('Projet')
      if (!project.collectOpen) throw new AppError(400, 'COLLECT_CLOSED', 'La collecte de ce projet est fermée.')
      structureId = project.structureId
      projectId = project.id
      label = `${type.label} · ${project.title}`
    } else if (input.structureId) {
      // Destination choisie : une structure de la chaîne du fidèle, ou une chapelle de sa paroisse
      const s = await this.prisma.structure.findUnique({ where: { id: input.structureId }, select: { id: true, path: true, status: true } })
      const allowed = s && s.status !== 'SUSPENDED' && (c.visiblePaths.includes(s.path) || (!!c.communityPath && s.path.startsWith(c.communityPath)))
      if (!allowed) throw NotFound('Destination')
      structureId = s.id
    } else {
      structureId = p.membership!.structureId
    }

    const fee = operatorFee(input.amount)
    const callbackToken = randomBytes(24).toString('base64url')
    const provider = this.providerFor(input.channel)

    const created = await this.prisma.$transaction(async (tx) => {
      const plan = input.recurring
        ? await tx.recurringPlan.create({
            data: {
              userId: p.userId,
              structureId,
              projectId,
              typeId: type.id,
              amount: input.amount,
              channel: input.channel,
              payerPhone: input.payerPhone,
              nextRunAt: nextMonthlyRun(new Date()),
            },
          })
        : null
      const contribution = await tx.contribution.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          confessionId: c.confessionId!,
          structureId,
          projectId,
          typeId: type.id,
          userId: p.userId,
          amount: input.amount,
          fee,
          net: input.amount, // les frais opérateur sont à la charge du fidèle, affichés avant paiement
          totalCharged: input.amount + fee,
          channel: input.channel,
          payerPhone: input.payerPhone,
          recurringPlanId: plan?.id ?? null,
        },
      })
      const t = await tx.paymentTransaction.create({
        data: { contributionId: contribution.id, provider: provider.channel, amount: input.amount + fee, fee, callbackTokenHash: sha256(callbackToken) },
      })
      return { contribution, tx: t }
    })

    try {
      const redirectUrl = await this.initiate(created.contribution.id, created.tx.id, provider, { amount: input.amount + fee, fee, phone: input.payerPhone, label, callbackToken })
      return { id: created.contribution.id, redirectUrl }
    } catch (e) {
      // Première demande refusée : la contribution mensuelle n'est pas mise en place
      if (created.contribution.recurringPlanId) {
        await this.prisma.recurringPlan.update({ where: { id: created.contribution.recurringPlanId }, data: { status: 'CANCELLED' } })
      }
      throw e
    }
  }

  /** Demande à l'opérateur. Un refus immédiat fait passer la contribution en échec, sans rien compter. */
  private async initiate(
    contributionId: string,
    txId: string,
    provider: PaymentProvider,
    o: { amount: number; fee: number; phone: string; label: string; callbackToken: string },
  ): Promise<string | null> {
    const callbackUrl = `${env.PUBLIC_URL}/api/payments/webhooks/${provider.channel.toLowerCase()}/${txId}/${o.callbackToken}`
    try {
      const r = await provider.initiate({ amount: o.amount, fee: o.fee, phone: o.phone, reference: contributionId, callbackUrl, label: `CEPCA · ${o.label}` })
      await this.prisma.paymentTransaction.update({ where: { id: txId }, data: { providerRef: r.providerRef, status: 'PENDING' } })
      return r.redirectUrl ?? null
    } catch (e) {
      const reason = e instanceof ProviderError ? e.userMessage : 'Le service de paiement ne répond pas. Réessayez dans un instant.'
      this.log.warn(`Demande de paiement refusée (${contributionId}) : ${(e as Error).message}`)
      await this.resolve(txId, { status: 'FAILED', raw: 'INITIATE_ERROR', reason })
      throw new AppError(502, 'PAYMENT_UNAVAILABLE', reason)
    }
  }

  /** Relit le statut chez l'opérateur, au plus une fois toutes les 3 secondes par transaction. */
  async refresh(txId: string, force = false) {
    const t = await this.prisma.paymentTransaction.findUnique({ where: { id: txId } })
    if (!t || !t.providerRef || (t.status !== 'PENDING' && t.status !== 'INITIATED')) return
    if (!force && t.lastCheckedAt && Date.now() - t.lastCheckedAt.getTime() < MIN_CHECK_INTERVAL_MS) return
    // Réservation de la vérification : deux sondages simultanés n'interrogent pas l'opérateur deux fois
    const claim = await this.prisma.paymentTransaction.updateMany({
      where: { id: t.id, OR: [{ lastCheckedAt: null }, { lastCheckedAt: t.lastCheckedAt }] },
      data: { lastCheckedAt: new Date() },
    })
    if (claim.count !== 1 && !force) return
    let st: ProviderStatus
    try {
      st = await this.providerByTxChannel(t.provider).fetchStatus(t.providerRef, { amount: t.amount, reference: t.contributionId })
    } catch (e) {
      this.log.warn(`Statut indisponible (${t.id}) : ${(e as Error).message}`)
      return
    }
    if (st.status !== 'PENDING') await this.resolve(t.id, st)
    else await this.prisma.paymentTransaction.update({ where: { id: t.id }, data: { providerStatus: st.raw } })
  }

  /**
   * Transition finale. Conditionnelle (WHERE status = PENDING) : un rappel et un sondage simultanés
   * ne confirment pas deux fois, ne comptent pas deux fois le montant dans le projet.
   */
  async resolve(txId: string, st: ProviderStatus) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.paymentTransaction.findUniqueOrThrow({ where: { id: txId } })
      const txStatus = st.status === 'SUCCEEDED' ? 'SUCCEEDED' : st.status === 'EXPIRED' ? 'EXPIRED' : 'FAILED'
      const moved = await tx.paymentTransaction.updateMany({
        where: { id: txId, status: { in: ['INITIATED', 'PENDING'] } },
        data: { status: txStatus, providerStatus: st.raw, resolvedAt: new Date(), failureReason: st.reason ?? null },
      })
      if (moved.count !== 1) return
      if (st.status === 'SUCCEEDED') await this.confirm(tx, t.contributionId)
      else await this.fail(tx, t.contributionId, st.status === 'EXPIRED' ? 'CANCELLED' : 'FAILED', st.reason ?? 'Paiement non abouti')
    })
  }

  private async confirm(tx: Tx, contributionId: string) {
    const now = new Date()
    const moved = await tx.contribution.updateMany({ where: { id: contributionId, status: 'PENDING' }, data: { status: 'SUCCEEDED', confirmedAt: now } })
    if (moved.count !== 1) return
    const c = await tx.contribution.findUniqueOrThrow({
      where: { id: contributionId },
      include: { type: true, structure: { select: { name: true, path: true } }, project: { select: { title: true } }, user: { select: { fullName: true } } },
    })
    const conf = await tx.confession.findUniqueOrThrow({ where: { id: c.confessionId }, select: { code: true } })
    const year = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Douala' }).format(now))
    // Séquence par confession et par année, sans trou ni doublon (verrou de ligne de l'UPSERT)
    const [{ last }] = await tx.$queryRaw<{ last: number }[]>`
      INSERT INTO "ReceiptSequence" ("confessionId", "year", "last") VALUES (${c.confessionId}, ${year}, 1)
      ON CONFLICT ("confessionId", "year") DO UPDATE SET "last" = "ReceiptSequence"."last" + 1
      RETURNING "last"`
    const receiptNumber = `${conf.code}-${year}-${String(last).padStart(6, '0')}`
    await tx.contribution.update({ where: { id: c.id }, data: { receiptNumber } })

    if (c.projectId) {
      const already = c.userId
        ? await tx.contribution.count({ where: { projectId: c.projectId, userId: c.userId, status: 'SUCCEEDED', NOT: { id: c.id } } })
        : 0
      await tx.project.update({
        where: { id: c.projectId },
        data: { raisedAmount: { increment: c.amount }, ...(already === 0 ? { contributorCount: { increment: 1 } } : {}) },
      })
    }
    if (c.userId) {
      await tx.notification.create({
        data: {
          userId: c.userId,
          kind: 'RECEIPT',
          title: 'Reçu disponible',
          body: `${c.type.label} · ${fmtFcfa(c.amount)} · ${dayMonth(now)}`,
          link: { screen: 'receipt', id: c.id },
        },
      })
    }
    await this.audit.record(
      {
        actorLabel: 'Système',
        category: 'PAIEMENT',
        action: `Paiement confirmé : ${c.type.label} ${fmtFcfa(c.amount)} (${receiptNumber})`,
        entityType: 'Contribution',
        entityId: c.id,
        structureId: c.structureId,
        structurePath: c.structure.path,
        metadata: { channel: c.channel, payer: c.payerPhone ? maskPhone(c.payerPhone) : null },
      },
      tx,
    )
  }

  private async fail(tx: Tx, contributionId: string, status: 'FAILED' | 'CANCELLED', reason: string) {
    const moved = await tx.contribution.updateMany({ where: { id: contributionId, status: 'PENDING' }, data: { status, statusReason: reason } })
    if (moved.count !== 1) return
    const c = await tx.contribution.findUniqueOrThrow({ where: { id: contributionId }, include: { type: true, structure: { select: { path: true } } } })
    if (c.userId) {
      await tx.notification.create({
        data: { userId: c.userId, kind: 'PAYMENT', title: 'Paiement non abouti', body: `${c.type.label} · ${fmtFcfa(c.amount)} · ${reason}`, link: { screen: 'hist' } },
      })
    }
    await this.audit.record(
      {
        actorLabel: 'Système',
        category: 'PAIEMENT',
        action: `Paiement non abouti : ${c.type.label} ${fmtFcfa(c.amount)} (${reason})`,
        entityType: 'Contribution',
        entityId: c.id,
        structureId: c.structureId,
        structurePath: c.structure.path,
        success: false,
      },
      tx,
    )
  }

  /** Lecture par le fidèle : un sondage de l'app fait avancer un paiement en attente. */
  async getForUser(userId: string, id: string) {
    const c = await this.prisma.contribution.findFirst({ where: { id, userId }, select: { id: true, status: true } })
    if (!c) throw NotFound('Contribution')
    if (c.status === 'PENDING') {
      const t = await this.prisma.paymentTransaction.findFirst({ where: { contributionId: id }, orderBy: { requestedAt: 'desc' }, select: { id: true } })
      if (t) await this.refresh(t.id)
    }
  }

  /** Rappel d'un opérateur, authentifié par le jeton propre à la transaction. */
  async webhook(providerSlug: string, txId: string, token: string, body: unknown) {
    const t = await this.prisma.paymentTransaction.findUnique({ where: { id: txId } })
    const expected = t?.callbackTokenHash
    if (!t || !expected || t.provider.toLowerCase() !== providerSlug || sha256(token) !== expected) throw NotFound('Transaction')
    const key = this.providerByTxChannel(t.provider).webhookKey(body) ?? `${txId}:${Date.now()}`
    const first = await this.prisma.paymentWebhookEvent.createMany({ data: [{ provider: t.provider, eventKey: key }], skipDuplicates: true })
    if (first.count === 0) return { duplicate: true }
    await this.refresh(t.id, true)
    await this.prisma.paymentWebhookEvent.update({
      where: { provider_eventKey: { provider: t.provider, eventKey: key } },
      data: { processedAt: new Date(), outcome: (await this.prisma.paymentTransaction.findUnique({ where: { id: txId }, select: { status: true } }))?.status },
    })
    return { duplicate: false }
  }

  /** Les paiements restés en attente sont réinterrogés : un rappel perdu ne bloque pas une contribution. */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'payments-reconcile', disabled: env.NODE_ENV === 'test' })
  async reconcile() {
    const since = new Date(Date.now() - RECONCILE_WINDOW_MS)
    const pending = await this.prisma.paymentTransaction.findMany({
      where: { status: 'PENDING', requestedAt: { gt: since }, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 60_000) } }] },
      select: { id: true },
      orderBy: { requestedAt: 'asc' },
      take: 50,
    })
    for (const t of pending) await this.refresh(t.id)
    return pending.length
  }

  /**
   * « Chaque mois » : Mobile Money interdit le prélèvement sans confirmation. Le 1er du mois, une demande
   * de paiement est envoyée et le fidèle la confirme sur son téléphone. La clé d'idempotence porte le mois :
   * un second passage du job ne crée pas de doublon.
   */
  @Cron('0 6 * * *', { name: 'payments-recurring', timeZone: 'Africa/Douala', disabled: env.NODE_ENV === 'test' })
  async runRecurring(now = new Date()) {
    const due = await this.prisma.recurringPlan.findMany({ where: { status: 'ACTIVE', nextRunAt: { lte: now } }, take: 500 })
    let started = 0
    for (const plan of due) {
      const month = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Africa/Douala' }).format(plan.nextRunAt)
      const key = `rec-${plan.id}-${month}`
      await this.prisma.recurringPlan.update({ where: { id: plan.id }, data: { nextRunAt: nextMonthlyRun(plan.nextRunAt, plan.dayOfMonth) } })
      if (await this.prisma.contribution.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) continue
      try {
        await this.startRecurring(plan, key)
        started++
      } catch (e) {
        this.log.warn(`Contribution mensuelle ${plan.id} non lancée : ${(e as Error).message}`)
      }
    }
    return started
  }

  private async startRecurring(plan: Prisma.RecurringPlanGetPayload<object>, idempotencyKey: string) {
    const [type, structure] = await Promise.all([
      this.prisma.contributionType.findUniqueOrThrow({ where: { id: plan.typeId } }),
      this.prisma.structure.findUniqueOrThrow({ where: { id: plan.structureId }, select: { confessionId: true } }),
    ])
    if (!type.active || !structure.confessionId) return
    const fee = operatorFee(plan.amount)
    const provider = this.providerFor(plan.channel)
    const callbackToken = randomBytes(24).toString('base64url')
    const { contribution, t } = await this.prisma.$transaction(async (tx) => {
      const contribution = await tx.contribution.create({
        data: {
          idempotencyKey,
          confessionId: structure.confessionId!,
          structureId: plan.structureId,
          projectId: plan.projectId,
          typeId: plan.typeId,
          userId: plan.userId,
          amount: plan.amount,
          fee,
          net: plan.amount,
          totalCharged: plan.amount + fee,
          channel: plan.channel,
          payerPhone: plan.payerPhone,
          recurringPlanId: plan.id,
        },
      })
      const t = await tx.paymentTransaction.create({
        data: { contributionId: contribution.id, provider: provider.channel, amount: plan.amount + fee, fee, callbackTokenHash: sha256(callbackToken) },
      })
      await tx.notification.create({
        data: {
          userId: plan.userId,
          kind: 'PAYMENT',
          title: 'Contribution mensuelle à confirmer',
          body: `${type.label} · ${fmtFcfa(plan.amount)} · confirmez sur votre téléphone`,
          link: { screen: 'receipt', id: contribution.id },
        },
      })
      return { contribution, t }
    })
    await this.initiate(contribution.id, t.id, provider, { amount: plan.amount + fee, fee, phone: plan.payerPhone, label: type.label, callbackToken }).catch(() => undefined)
  }
}
