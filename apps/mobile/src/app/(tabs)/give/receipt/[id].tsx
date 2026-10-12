import { useState } from 'react'
import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircleIcon, CheckIcon, FilePdfIcon, HourglassIcon, RepeatIcon, WarningCircleIcon } from 'phosphor-react-native'
import { agendaParts, dayMonthYear, fmtFcfa, fmtInt, type ContributionDto } from '@cepca/shared'
import { API_URL } from '@/lib/config'
import { useContribution } from '@/lib/queries'
import { download, openFile, safeName } from '@/lib/files'
import { BackHeader, Btn, ErrorState, Loading, Screen, SummaryRows } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

const HEAD = {
  SUCCEEDED: { icon: CheckCircleIcon, label: 'Paiement réussi', bg: color.primarySoft, fg: color.primary },
  PENDING: { icon: HourglassIcon, label: 'Paiement en attente', bg: color.warnBg, fg: color.warnFg },
  FAILED: { icon: WarningCircleIcon, label: 'Paiement échoué', bg: color.errorBg, fg: color.errorFg },
  CANCELLED: { icon: WarningCircleIcon, label: 'Paiement annulé', bg: color.errorBg, fg: color.errorFg },
  REFUNDED: { icon: RepeatIcon, label: 'Paiement remboursé', bg: color.infoBg, fg: color.infoFg },
} as const

/** 1er du mois suivant, en toutes lettres : « 1er novembre » */
function nextFirst(): string {
  const now = new Date()
  return `1er ${agendaParts(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12))).month}`
}

export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useContribution(id, true)
  return (
    <Screen gap={16} bottom={28}>
      <BackHeader title="Reçu" fallback="/give/history" />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <ReceiptBody c={q.data} />}
    </Screen>
  )
}

function ReceiptBody({ c }: { c: ContributionDto }) {
  const toast = useToast()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const h = HEAD[c.status]
  const ok = c.status === 'SUCCEEDED' || c.status === 'REFUNDED'

  async function pdf() {
    if (!c.receiptNumber) return
    setBusy(true)
    try {
      const f = await download(`${API_URL}/contributions/${encodeURIComponent(c.id)}/receipt.pdf`, 'receipts', safeName(c.receiptNumber, 'pdf'))
      setSaved(true)
      await openFile(f, 'application/pdf', `Reçu ${c.receiptNumber}`)
    } catch {
      toast('Le reçu n’a pas pu être téléchargé.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: h.bg, alignItems: 'center', justifyContent: 'center' }}>
          <h.icon size={34} weight="fill" color={h.fg} />
        </View>
        <Txt size={14} weight={700} color={h.fg} accessibilityLiveRegion="polite">
          {h.label}
        </Txt>
        <Txt serif size={48} lh={1.1} align="center">
          {fmtInt(c.totalCharged)}{' '}
          <Txt size={15} weight={700}>
            FCFA
          </Txt>
        </Txt>
        <Txt size={13} color={color.textMuted} align="center">
          {c.status === 'SUCCEEDED'
            ? 'Merci pour votre contribution.'
            : c.status === 'PENDING'
              ? 'En attente de la confirmation de l’opérateur.'
              : (c.failureReason ?? 'Aucun montant n’a été prélevé.')}
        </Txt>
      </View>
      <SummaryRows
        py={7}
        size={13}
        rows={[
          { k: 'Référence', v: c.reference, strong: true },
          { k: 'Date', v: dayMonthYear(c.confirmedAt ?? c.createdAt) },
          { k: 'Type', v: c.type },
          { k: 'Destination', v: c.destination },
          { k: 'Montant', v: fmtFcfa(c.amount) },
          { k: 'Frais opérateur', v: fmtFcfa(c.fee) },
          { k: 'Moyen de paiement', v: c.channelLabel },
          { k: 'Statut', v: c.statusLabel, strong: true, color: h.fg },
        ]}
      />
      {c.recurring && c.status === 'SUCCEEDED' ? (
        <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.primarySoft, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <RepeatIcon size={20} color={color.primary} />
          <Txt size={13} style={{ flex: 1 }}>
            Contribution mensuelle. Prochain prélèvement le {nextFirst()}.
          </Txt>
        </View>
      ) : null}
      {ok && c.receiptNumber ? (
        <Btn label={saved ? 'Reçu enregistré (PDF)' : 'Télécharger le reçu (PDF)'} icon={saved ? CheckIcon : FilePdfIcon} iconWeight={saved ? 'bold' : 'regular'} height={52} size={15} loading={busy} onPress={pdf} />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Historique" variant="outlineGreen" height={48} size={13} style={{ flex: 1 }} onPress={() => router.navigate('/give/history')} />
        <Btn label="Accueil" variant="outline" height={48} size={13} style={{ flex: 1 }} onPress={() => router.navigate('/home')} />
      </View>
    </>
  )
}
