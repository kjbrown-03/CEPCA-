'use client'

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowSquareOut, LockSimple, WarningCircle } from '@phosphor-icons/react'
import { fmtFcfa, fmtInt, operatorFee, prettyPhone, toE164, type CreateContributionResult } from '@cepca/shared'
import { api, errorMessage, idempotencyKey } from '@/lib/api'
import { qk, useContribution, useContributionTypes, useMe, useProjects } from '../../../_lib/queries'
import { BackHeader, Btn, FormError, Loading, Screen, SelectRow, SummaryRows, Txt, color } from '../../../_components/ui'

type Channel = 'MTN_MOMO' | 'ORANGE_MONEY'
const OPS: Array<{ key: Channel; badge: string; label: string; short: string; tint: string }> = [
  { key: 'MTN_MOMO', badge: 'MTN', label: 'MTN Mobile Money', short: 'MTN MoMo', tint: color.momo },
  { key: 'ORANGE_MONEY', badge: 'OM', label: 'Orange Money', short: 'Orange Money', tint: color.orangeMoney },
]
// Au-delà, on cesse d'attendre à l'écran : le paiement reste suivi dans l'historique
const WAIT_LIMIT_MS = 3 * 60 * 1000

/** Préfixes Orange Money : 69, 655–659, 685–689 ; les autres 6… sont MTN. Simple présélection, modifiable. */
function guessChannel(local: string): Channel {
  return /^(69|65[5-9]|68[5-9])/.test(local) ? 'ORANGE_MONEY' : 'MTN_MOMO'
}

export default function PayPage() {
  return (
    <Suspense>
      <Pay />
    </Suspense>
  )
}

type Pending = { id: string; instructions: string; since: number; paymentUrl: string | null }

function Pay() {
  const router = useRouter()
  const params = useSearchParams()
  const typeKey = params.get('type') ?? ''
  const projectId = params.get('projet')
  const amount = Number(params.get('montant')) || 0
  const recurring = params.get('mensuel') === '1'
  const fee = operatorFee(amount)
  const me = useMe()
  const types = useContributionTypes(!!me.data?.membership)
  const projects = useProjects()
  const qc = useQueryClient()

  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<Channel>('MTN_MOMO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  // Clé d'idempotence : un double appui ou un renvoi après coupure ne crée pas deux paiements
  const key = useRef(idempotencyKey())

  // Numéro du fidèle par défaut quand il est camerounais
  useEffect(() => {
    const own = me.data?.phone
    if (own?.startsWith('+237')) {
      setPhone((p) => p || prettyPhone(own).slice(5))
      setChannel(guessChannel(own.slice(4)))
    }
  }, [me.data?.phone])

  // Arrivée sans montant (lien partagé, retour arrière) : retour au choix du don
  const missing = !typeKey || !amount
  useEffect(() => {
    if (missing) router.replace('/app/contribuer')
  }, [missing, router])

  const type = types.data?.find((t) => t.key === typeKey)
  const project = projectId ? projects.data?.find((p) => p.id === projectId) : null
  const destination = project?.title ?? me.data?.membership?.structure.name ?? ''
  const op = OPS.find((o) => o.key === channel)!
  const digits = phone.replace(/\D/g, '')
  const valid = digits.length === 9 && digits.startsWith('6')

  if (missing) return null
  if (types.isPending || me.isPending || (projectId && projects.isPending))
    return (
      <Screen>
        <BackHeader title="Paiement" fallback="/app/contribuer" />
        <Loading />
      </Screen>
    )

  async function pay(e: FormEvent) {
    e.preventDefault()
    const e164 = toE164('+237', phone)
    if (!e164 || !valid) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<CreateContributionResult>('/contributions', {
        idempotencyKey: key.current,
        typeKey,
        ...(projectId ? { projectId } : {}),
        amount,
        channel,
        payerPhone: e164,
        recurring,
      })
      // Orange Money Web Payment : la page de l'opérateur s'ouvre dans un nouvel onglet
      if (r.paymentUrl) window.open(r.paymentUrl, '_blank', 'noopener')
      qc.setQueryData(qk.contribution(r.contribution.id), r.contribution)
      setPending({ id: r.contribution.id, instructions: r.instructions, since: Date.now(), paymentUrl: r.paymentUrl ?? null })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title="Paiement" fallback="/app/contribuer" />
      <SummaryRows
        rows={[
          { k: 'Type', v: (type?.label ?? typeKey) + (recurring ? ' · chaque mois' : '') },
          { k: 'Destination', v: destination },
          { k: 'Montant', v: fmtFcfa(amount) },
          { k: 'Frais opérateur', v: fmtFcfa(fee) },
          { k: 'Total', v: fmtFcfa(amount + fee), strong: true },
        ]}
      />
      <form onSubmit={pay} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        <Txt as="h2" size={13} weight={700}>
          Payer avec
        </Txt>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} role="radiogroup" aria-label="Moyen de paiement">
          {OPS.map((o) => (
            <SelectRow
              key={o.key}
              label={o.label}
              height={58}
              selected={channel === o.key}
              onClick={() => setChannel(o.key)}
              left={<span style={{ flex: 'none', width: 40, height: 26, borderRadius: 6, background: o.tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: color.text }}>{o.badge}</span>}
            />
          ))}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pwa-label">Numéro {op.short}</span>
          <span className="pwa-phone">
            <span>+237</span>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6 77 12 34 42" autoComplete="tel-national" />
          </span>
          <Txt size={12} color={color.textMuted}>
            Mobile Money camerounais uniquement. La demande arrive sur ce téléphone.
          </Txt>
        </label>
        <FormError text={error} />
        <Btn type="submit" label={`Payer ${fmtInt(amount + fee)} FCFA`} icon={LockSimple} loading={busy} disabled={!valid} style={{ marginTop: 6 }} />
      </form>

      {pending ? (
        <WaitSheet
          pending={pending}
          total={amount + fee}
          phone={`+237 ${phone}`}
          opName={op.short}
          onClose={(retry) => {
            setPending(null)
            if (retry) key.current = idempotencyKey()
          }}
        />
      ) : null}
    </Screen>
  )
}

/** Feuille « Confirmez sur votre téléphone » : interroge l'API jusqu'à la réponse de l'opérateur. */
function WaitSheet({ pending, total, phone, opName, onClose }: { pending: Pending; total: number; phone: string; opName: string; onClose: (retry: boolean) => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const c = useContribution(pending.id, true)
  const [timedOut, setTimedOut] = useState(false)
  const status = c.data?.status ?? 'PENDING'

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), WAIT_LIMIT_MS - (Date.now() - pending.since))
    return () => clearTimeout(t)
  }, [pending.since])

  useEffect(() => {
    if (status === 'SUCCEEDED') {
      void qc.invalidateQueries({ queryKey: qk.history })
      void qc.invalidateQueries({ queryKey: qk.home })
      void qc.invalidateQueries({ queryKey: qk.projects })
      onClose(false)
      router.replace(`/app/contribuer/recu/${encodeURIComponent(pending.id)}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const failed = status === 'FAILED' || status === 'CANCELLED'
  return (
    <div className="pwa-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="wait-title">
      <div className="pwa-sheet">
        {failed ? (
          <>
            <WarningCircle size={52} color={color.errorFg} aria-hidden />
            <Txt as="h2" id="wait-title" serif size={26} lh={1.1} align="center">
              Paiement non abouti
            </Txt>
            <Txt size={14} lh={1.5} color={color.textMuted} align="center">
              {c.data?.failureReason ?? 'L’opérateur a refusé ou annulé la demande. Aucun montant n’a été prélevé.'}
            </Txt>
            <Btn label="Réessayer" onClick={() => onClose(true)} style={{ alignSelf: 'stretch' }} />
          </>
        ) : timedOut ? (
          <>
            <span className="pwa-spinner lg" style={{ color: color.primary }} aria-hidden />
            <Txt as="h2" id="wait-title" serif size={26} lh={1.1} align="center">
              Toujours en attente
            </Txt>
            <Txt size={14} lh={1.5} color={color.textMuted} align="center">
              L’opérateur n’a pas encore répondu. Le paiement reste suivi : son statut s’affichera dans vos contributions dès la confirmation.
            </Txt>
            <Btn
              label="Voir mes contributions"
              onClick={() => {
                onClose(false)
                router.replace('/app/contribuer/historique')
              }}
              style={{ alignSelf: 'stretch' }}
            />
          </>
        ) : (
          <>
            <span className="pwa-spinner lg" style={{ color: color.primary, margin: '8px 0' }} aria-hidden />
            <Txt as="h2" id="wait-title" serif size={26} lh={1.1} align="center">
              <span aria-live="polite">Confirmez sur votre téléphone</span>
            </Txt>
            <Txt size={14} lh={1.5} color={color.textMuted} align="center">
              Une demande de {fmtInt(total)} FCFA a été envoyée au {phone}. {pending.instructions || `Saisissez votre code secret ${opName} pour valider.`}
            </Txt>
            {pending.paymentUrl ? <Btn label="Ouvrir la page de paiement" icon={ArrowSquareOut} iconWeight="regular" variant="outlineGreen" height={48} size={14} href={pending.paymentUrl} external style={{ alignSelf: 'stretch' }} /> : null}
          </>
        )}
      </div>
    </div>
  )
}
