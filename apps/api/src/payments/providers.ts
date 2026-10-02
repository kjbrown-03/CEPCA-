import { Injectable, Logger } from '@nestjs/common'
import { randomBytes, randomUUID } from 'node:crypto'
import { env } from '../config/env'

/** Statut tel que compris par la plateforme, quel que soit l'opérateur. */
export type ProviderStatus = { status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'; raw: string; reason?: string }

export interface InitiateRequest {
  amount: number // total débité au fidèle, frais compris
  fee: number
  phone: string // E.164
  reference: string // identifiant de la contribution, repris par l'opérateur
  callbackUrl: string
  label: string
}

export interface PaymentProvider {
  readonly channel: 'MTN_MOMO' | 'ORANGE_MONEY' | 'SANDBOX'
  initiate(req: InitiateRequest): Promise<{ providerRef: string; redirectUrl?: string }>
  fetchStatus(providerRef: string, ctx: { amount: number; reference: string }): Promise<ProviderStatus>
  /** Clé de dédoublonnage d'un rappel. Le rappel n'est jamais cru sur parole : il déclenche un fetchStatus. */
  webhookKey(body: unknown): string | null
}

export class ProviderError extends Error {
  constructor(message: string, public readonly userMessage = 'Le service de paiement ne répond pas. Réessayez dans un instant.') {
    super(message)
  }
}

async function call(url: string, init: RequestInit, timeoutMs = 15000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    throw new ProviderError(`${init.method ?? 'GET'} ${url} : ${(e as Error).message}`)
  } finally {
    clearTimeout(t)
  }
}

/**
 * Bac à sable (dev et recette). Le montant saisi par le fidèle (hors frais) choisit l'issue :
 *   se termine par 13 → refus (solde insuffisant) · par 14 → expiration · sinon succès
 * après SANDBOX_CONFIRM_DELAY_MS. La référence porte l'heure et le montant : aucun état en mémoire,
 * un redémarrage de l'API ne perd aucun paiement.
 */
@Injectable()
export class SandboxProvider implements PaymentProvider {
  readonly channel = 'SANDBOX' as const

  async initiate(req: InitiateRequest) {
    return { providerRef: `SBX-${Date.now()}-${req.amount - req.fee}-${randomBytes(4).toString('hex')}` }
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    const m = /^SBX-(\d+)-(\d+)-[0-9a-f]+$/.exec(providerRef)
    if (!m) return { status: 'FAILED', raw: 'UNKNOWN_REF', reason: 'Référence inconnue' }
    const [at, amount] = [Number(m[1]), Number(m[2])]
    if (Date.now() - at < env.SANDBOX_CONFIRM_DELAY_MS) return { status: 'PENDING', raw: 'PENDING' }
    if (amount % 100 === 13) return { status: 'FAILED', raw: 'FAILED', reason: 'Solde insuffisant' }
    if (amount % 100 === 14) return { status: 'EXPIRED', raw: 'EXPIRED', reason: 'Délai de confirmation dépassé' }
    return { status: 'SUCCEEDED', raw: 'SUCCESSFUL' }
  }

  webhookKey() {
    return null
  }
}

/**
 * MTN Mobile Money — Collection API (requesttopay).
 * Le fidèle reçoit une demande sur son téléphone et la confirme avec son code secret.
 * Le bac à sable MTN n'accepte que la devise EUR : la devise suit donc l'environnement cible.
 */
@Injectable()
export class MtnMomoProvider implements PaymentProvider {
  readonly channel = 'MTN_MOMO' as const
  private readonly log = new Logger('MTN MoMo')
  private token: { value: string; until: number } | null = null

  private get currency() {
    return env.MTN_MOMO_TARGET_ENV === 'sandbox' ? 'EUR' : 'XAF'
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 30_000) return this.token.value
    const basic = Buffer.from(`${env.MTN_MOMO_API_USER}:${env.MTN_MOMO_API_KEY}`).toString('base64')
    const r = await call(`${env.MTN_MOMO_BASE_URL}/collection/token/`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY },
    })
    if (!r.ok) throw new ProviderError(`Jeton MoMo refusé (${r.status})`)
    const j = (await r.json()) as { access_token: string; expires_in: number }
    this.token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': env.MTN_MOMO_TARGET_ENV,
      'Ocp-Apim-Subscription-Key': env.MTN_MOMO_SUBSCRIPTION_KEY,
    }
  }

  async initiate(req: InitiateRequest) {
    const ref = randomUUID()
    const token = await this.accessToken()
    const r = await call(`${env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: { ...this.headers(token), 'X-Reference-Id': ref, 'X-Callback-Url': req.callbackUrl, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: String(req.amount),
        currency: this.currency,
        externalId: req.reference,
        payer: { partyIdType: 'MSISDN', partyId: req.phone.replace(/^\+/, '') },
        payerMessage: req.label.slice(0, 160),
        payeeNote: req.reference,
      }),
    })
    if (r.status !== 202) {
      this.log.warn(`requesttopay refusé : ${r.status} ${await r.text().catch(() => '')}`)
      throw new ProviderError(`requesttopay ${r.status}`, 'MTN MoMo a refusé la demande. Vérifiez le numéro et réessayez.')
    }
    return { providerRef: ref }
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    const token = await this.accessToken()
    const r = await call(`${env.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/${encodeURIComponent(providerRef)}`, { headers: this.headers(token) })
    if (r.status === 404) return { status: 'FAILED', raw: 'NOT_FOUND', reason: 'Demande inconnue de MTN MoMo' }
    if (!r.ok) throw new ProviderError(`requesttopay status ${r.status}`)
    const j = (await r.json()) as { status: string; reason?: string | { code?: string } }
    const reason = typeof j.reason === 'string' ? j.reason : j.reason?.code
    if (j.status === 'SUCCESSFUL') return { status: 'SUCCEEDED', raw: j.status }
    if (j.status === 'PENDING') return { status: 'PENDING', raw: j.status }
    if (reason === 'EXPIRED' || reason === 'APPROVAL_REJECTED_TIMEOUT') return { status: 'EXPIRED', raw: `${j.status}:${reason}`, reason: 'Délai de confirmation dépassé' }
    return { status: 'FAILED', raw: `${j.status}:${reason ?? ''}`, reason: momoReason(reason) }
  }

  webhookKey(body: unknown) {
    const b = body as { financialTransactionId?: string; externalId?: string; status?: string } | null
    if (!b?.status) return null
    return `${b.financialTransactionId ?? b.externalId ?? ''}:${b.status}`
  }
}

function momoReason(code?: string): string {
  switch (code) {
    case 'NOT_ENOUGH_FUNDS':
      return 'Solde insuffisant'
    case 'PAYER_NOT_FOUND':
      return 'Numéro MTN MoMo introuvable'
    case 'APPROVAL_REJECTED':
      return 'Paiement refusé sur le téléphone'
    case 'PAYER_LIMIT_REACHED':
      return 'Plafond Mobile Money atteint'
    default:
      return 'Paiement refusé par MTN MoMo'
  }
}

/**
 * Orange Money — Web Payment (paiement marchand).
 * Le fidèle est redirigé vers la page Orange Money (paymentUrl), puis le statut est relu par transactionstatus.
 * Les chemins d'API varient selon le contrat signé avec Orange Cameroun : ils sont regroupés ici.
 */
@Injectable()
export class OrangeMoneyProvider implements PaymentProvider {
  readonly channel = 'ORANGE_MONEY' as const
  private token: { value: string; until: number } | null = null
  private readonly api = `${env.ORANGE_MONEY_BASE_URL}/orange-money-webpay/cm/v1`

  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now() + 30_000) return this.token.value
    const basic = Buffer.from(`${env.ORANGE_MONEY_CLIENT_ID}:${env.ORANGE_MONEY_CLIENT_SECRET}`).toString('base64')
    const r = await call(`${env.ORANGE_MONEY_BASE_URL}/oauth/v3/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    })
    if (!r.ok) throw new ProviderError(`Jeton Orange refusé (${r.status})`)
    const j = (await r.json()) as { access_token: string; expires_in: number }
    this.token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 }
    return j.access_token
  }

  async initiate(req: InitiateRequest) {
    const token = await this.accessToken()
    const r = await call(`${this.api}/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_key: env.ORANGE_MONEY_MERCHANT_KEY,
        currency: 'XAF',
        order_id: req.reference,
        amount: req.amount,
        return_url: `${env.PUBLIC_URL}/paiement/retour`,
        cancel_url: `${env.PUBLIC_URL}/paiement/annule`,
        notif_url: req.callbackUrl,
        lang: 'fr',
        reference: 'CEPCA',
      }),
    })
    if (r.status !== 201 && r.status !== 200) throw new ProviderError(`webpayment ${r.status}`, 'Orange Money a refusé la demande. Réessayez dans un instant.')
    const j = (await r.json()) as { pay_token: string; payment_url: string }
    return { providerRef: j.pay_token, redirectUrl: j.payment_url }
  }

  async fetchStatus(providerRef: string, ctx: { amount: number; reference: string }): Promise<ProviderStatus> {
    const token = await this.accessToken()
    const r = await call(`${this.api}/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ order_id: ctx.reference, amount: ctx.amount, pay_token: providerRef }),
    })
    if (!r.ok) throw new ProviderError(`transactionstatus ${r.status}`)
    const j = (await r.json()) as { status: string }
    if (j.status === 'SUCCESS') return { status: 'SUCCEEDED', raw: j.status }
    if (j.status === 'INITIATED' || j.status === 'PENDING') return { status: 'PENDING', raw: j.status }
    if (j.status === 'EXPIRED') return { status: 'EXPIRED', raw: j.status, reason: 'Délai de paiement dépassé' }
    return { status: 'FAILED', raw: j.status, reason: 'Paiement refusé par Orange Money' }
  }

  webhookKey(body: unknown) {
    const b = body as { txnid?: string; notif_token?: string; status?: string } | null
    if (!b?.status) return null
    return `${b.txnid ?? b.notif_token ?? ''}:${b.status}`
  }
}
