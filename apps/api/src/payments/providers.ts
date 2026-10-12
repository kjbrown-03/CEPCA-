import { Injectable, Logger } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { env } from '../config/env'

/** Statut tel que compris par la plateforme, quel que soit le prestataire. */
export type ProviderStatus = {
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  raw: string
  reason?: string
  /** Montant réellement versé à la plateforme, après la commission du prestataire */
  received?: number
}

export interface InitiateRequest {
  amount: number // total débité au fidèle, frais compris
  fee: number
  phone: string // E.164
  medium: 'MTN_MOMO' | 'ORANGE_MONEY'
  reference: string // identifiant de la contribution, repris par le prestataire
  userId: string | null
  label: string
}

export interface PaymentProvider {
  readonly channel: 'SANDBOX' | 'FAPSHI'
  initiate(req: InitiateRequest): Promise<{ providerRef: string; redirectUrl?: string }>
  fetchStatus(providerRef: string): Promise<ProviderStatus>
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
 * Simulateur local (dev hors ligne et tests). Le montant saisi par le fidèle (hors frais) choisit l'issue :
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
}

/** +237677123442 → 677123442 (format attendu par Fapshi). Null si le numéro n'est pas un mobile camerounais. */
export function fapshiPhone(e164: string): string | null {
  const m = /^\+2376(\d{8})$/.exec(e164)
  return m ? '6' + m[1] : null
}

/**
 * Fapshi — agrégateur camerounais MTN Mobile Money + Orange Money (docs.fapshi.com).
 * direct-pay envoie la demande sur le téléphone du fidèle, qui la confirme avec son code secret.
 * En production, direct-pay doit être activé par Fapshi sur le service.
 */
@Injectable()
export class FapshiProvider implements PaymentProvider {
  readonly channel = 'FAPSHI' as const
  private readonly log = new Logger('Fapshi')

  private headers() {
    return { apiuser: env.FAPSHI_API_USER, apikey: env.FAPSHI_API_KEY, 'Content-Type': 'application/json' }
  }

  async initiate(req: InitiateRequest) {
    const phone = fapshiPhone(req.phone)
    if (!phone) throw new ProviderError(`numéro non camerounais`, 'Le paiement Mobile Money demande un numéro MTN ou Orange du Cameroun.')
    const r = await call(`${env.FAPSHI_BASE_URL}/direct-pay`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        amount: req.amount,
        phone,
        medium: req.medium === 'MTN_MOMO' ? 'mobile money' : 'orange money',
        externalId: req.reference,
        ...(req.userId ? { userId: req.userId } : {}),
        message: req.label.slice(0, 100),
      }),
    })
    const j = (await r.json().catch(() => ({}))) as { transId?: string; message?: string }
    if (!r.ok || !j.transId) {
      this.log.warn(`direct-pay refusé : ${r.status} ${j.message ?? ''}`)
      throw new ProviderError(`direct-pay ${r.status} ${j.message ?? ''}`, fapshiMessage(r.status, j.message))
    }
    return { providerRef: j.transId }
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    const r = await call(`${env.FAPSHI_BASE_URL}/payment-status/${encodeURIComponent(providerRef)}`, { headers: this.headers() })
    if (r.status === 404) return { status: 'FAILED', raw: 'NOT_FOUND', reason: 'Transaction inconnue de Fapshi' }
    if (!r.ok) throw new ProviderError(`payment-status ${r.status}`)
    const j = (await r.json()) as { status: string; reason?: string | null; revenue?: number }
    switch (j.status) {
      case 'SUCCESSFUL':
        return { status: 'SUCCEEDED', raw: j.status, received: typeof j.revenue === 'number' ? j.revenue : undefined }
      case 'CREATED':
      case 'PENDING':
        return { status: 'PENDING', raw: j.status }
      case 'EXPIRED':
        return { status: 'EXPIRED', raw: j.status, reason: 'Délai de paiement dépassé' }
      default:
        return { status: 'FAILED', raw: `${j.status}:${j.reason ?? ''}`, reason: 'Paiement refusé ou annulé sur le téléphone' }
    }
  }
}

function fapshiMessage(status: number, message?: string): string {
  if (status === 400 && message && /phone/i.test(message)) return 'Ce numéro n’est pas un compte MTN MoMo ou Orange Money valide.'
  if (status === 400) return 'Le paiement a été refusé. Vérifiez le montant et le numéro.'
  if (status === 429) return 'Trop de demandes de paiement. Réessayez dans quelques minutes.'
  return 'Le service de paiement ne répond pas. Réessayez dans un instant.'
}
