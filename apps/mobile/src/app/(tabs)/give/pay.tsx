import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Modal, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import * as Crypto from 'expo-crypto'
import { LockSimpleIcon, WarningCircleIcon } from 'phosphor-react-native'
import { fmtFcfa, fmtInt, operatorFee, prettyPhone, toE164, type CreateContributionResult } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { qk, useContribution, useMe } from '@/lib/queries'
import { BackHeader, Btn, Screen, SelectRow, SummaryRows } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, extra, family } from '@/theme'

type Channel = 'MTN_MOMO' | 'ORANGE_MONEY'
const OPS: Array<{ key: Channel; badge: string; label: string; short: string; tint: string }> = [
  { key: 'MTN_MOMO', badge: 'MTN', label: 'MTN Mobile Money', short: 'MTN MoMo', tint: color.momo },
  { key: 'ORANGE_MONEY', badge: 'OM', label: 'Orange Money', short: 'Orange Money', tint: color.orangeMoney },
]
// Au-delà, on cesse d'attendre à l'écran : le paiement reste suivi dans l'historique
const WAIT_LIMIT_MS = 3 * 60 * 1000

/** Préfixes Orange Money : 69, 655–659, 685–689 ; les autres 6… sont MTN. Simple préselection, modifiable. */
function guessChannel(local: string): Channel {
  return /^(69|65[5-9]|68[5-9])/.test(local) ? 'ORANGE_MONEY' : 'MTN_MOMO'
}

export default function Pay() {
  const p = useLocalSearchParams<{ typeKey: string; typeLabel: string; projectId?: string; destination: string; amount: string; recurring: string }>()
  const amount = Number(p.amount) || 0
  const recurring = p.recurring === '1'
  const fee = operatorFee(amount)
  const me = useMe()
  const qc = useQueryClient()

  const [phone, setPhone] = useState('')
  const [channel, setChannel] = useState<Channel>('MTN_MOMO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ id: string; instructions: string; since: number } | null>(null)
  // Clé d'idempotence : un double appui ou un renvoi après coupure ne crée pas deux paiements
  const key = useRef(Crypto.randomUUID())

  // Numéro du fidèle par défaut quand il est camerounais
  useEffect(() => {
    const own = me.data?.phone
    if (own?.startsWith('+237') && !phone) {
      const local = own.slice(4)
      setPhone(prettyPhone(own).slice(5))
      setChannel(guessChannel(local))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data?.phone])

  const op = OPS.find((o) => o.key === channel)!
  const digits = phone.replace(/\D/g, '')
  const valid = digits.length === 9 && digits.startsWith('6')

  async function pay() {
    const e164 = toE164('+237', phone)
    if (!e164 || !valid) return
    setBusy(true)
    setError(null)
    try {
      const r = await api<CreateContributionResult>('/contributions', {
        method: 'POST',
        body: { idempotencyKey: key.current, typeKey: p.typeKey, ...(p.projectId ? { projectId: p.projectId } : {}), amount, channel, payerPhone: e164, recurring },
      })
      if (r.paymentUrl) void Linking.openURL(r.paymentUrl)
      qc.setQueryData(qk.contribution(r.contribution.id), r.contribution)
      setPending({ id: r.contribution.id, instructions: r.instructions, since: Date.now() })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title="Paiement" fallback="/give" />
      <SummaryRows
        rows={[
          { k: 'Type', v: p.typeLabel + (recurring ? ' · chaque mois' : '') },
          { k: 'Destination', v: p.destination },
          { k: 'Montant', v: fmtFcfa(amount) },
          { k: 'Frais opérateur', v: fmtFcfa(fee) },
          { k: 'Total', v: fmtFcfa(amount + fee), strong: true },
        ]}
      />
      <Txt size={13} weight={700}>
        Payer avec
      </Txt>
      <View style={{ gap: 8 }}>
        {OPS.map((o) => (
          <SelectRow
            key={o.key}
            label={o.label}
            height={58}
            selected={channel === o.key}
            onPress={() => setChannel(o.key)}
            left={
              <View style={{ width: 40, height: 26, borderRadius: 6, backgroundColor: o.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Txt size={10} weight={800}>
                  {o.badge}
                </Txt>
              </View>
            }
          />
        ))}
      </View>
      <View style={{ gap: 8 }}>
        <Txt size={13} weight={700} nativeID="pay-phone">
          Numéro {op.short}
        </Txt>
        <View style={{ flexDirection: 'row', height: 52, borderRadius: 14, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.fieldBorder, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 14, justifyContent: 'center', borderRightWidth: 1, borderRightColor: extra.fieldBorder }}>
            <Txt size={15} weight={600}>
              +237
            </Txt>
          </View>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="6 77 12 34 42"
            placeholderTextColor={color.textFaint}
            accessibilityLabelledBy="pay-phone"
            style={{ flex: 1, paddingHorizontal: 14, fontSize: 15, fontFamily: family[500], color: color.text }}
          />
        </View>
        <Txt size={12} color={color.textMuted}>
          Mobile Money camerounais uniquement. La demande arrive sur ce téléphone.
        </Txt>
      </View>
      {error ? (
        <Txt size={13} weight={600} color={color.errorFg} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
      <Btn label={`Payer ${fmtInt(amount + fee)} FCFA`} icon={LockSimpleIcon} onPress={pay} loading={busy} disabled={!valid} style={{ marginTop: 6 }} />

      {pending ? (
        <WaitSheet
          pending={pending}
          total={amount + fee}
          phone={`+237 ${phone}`}
          opName={op.short}
          onClose={(retry) => {
            setPending(null)
            if (retry) key.current = Crypto.randomUUID()
          }}
        />
      ) : null}
    </Screen>
  )
}

/** Feuille « Confirmez sur votre téléphone » : interroge l'API jusqu'à la réponse de l'opérateur. */
function WaitSheet({ pending, total, phone, opName, onClose }: { pending: { id: string; instructions: string; since: number }; total: number; phone: string; opName: string; onClose: (retry: boolean) => void }) {
  const insets = useSafeAreaInsets()
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
      router.replace(`/give/receipt/${pending.id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const failed = status === 'FAILED' || status === 'CANCELLED'
  return (
    <Modal transparent animationType="slide" visible onRequestClose={() => (failed || timedOut ? onClose(failed) : undefined)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(16,42,28,.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: color.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 28, paddingHorizontal: 24, paddingBottom: insets.bottom + 40, alignItems: 'center', gap: 14 }}>
          {failed ? (
            <>
              <WarningCircleIcon size={52} color={color.errorFg} />
              <Txt serif size={26} lh={1.1} align="center">
                Paiement non abouti
              </Txt>
              <Txt size={14} lh={1.5} color={color.textMuted} align="center">
                {c.data?.failureReason ?? 'L’opérateur a refusé ou annulé la demande. Aucun montant n’a été prélevé.'}
              </Txt>
              <Btn label="Réessayer" onPress={() => onClose(true)} style={{ alignSelf: 'stretch' }} />
            </>
          ) : timedOut ? (
            <>
              <ActivityIndicator color={color.primary} size="large" />
              <Txt serif size={26} lh={1.1} align="center">
                Toujours en attente
              </Txt>
              <Txt size={14} lh={1.5} color={color.textMuted} align="center">
                L’opérateur n’a pas encore répondu. Le paiement reste suivi : son statut s’affichera dans vos contributions dès la confirmation.
              </Txt>
              <Btn
                label="Voir mes contributions"
                onPress={() => {
                  onClose(false)
                  router.replace('/give/history')
                }}
                style={{ alignSelf: 'stretch' }}
              />
            </>
          ) : (
            <>
              <ActivityIndicator color={color.primary} size="large" style={{ height: 52 }} />
              <Txt serif size={26} lh={1.1} align="center" accessibilityLiveRegion="polite">
                Confirmez sur votre téléphone
              </Txt>
              <Txt size={14} lh={1.5} color={color.textMuted} align="center">
                Une demande de {fmtInt(total)} FCFA a été envoyée au {phone}. {pending.instructions || `Saisissez votre code secret ${opName} pour valider.`}
              </Txt>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}
