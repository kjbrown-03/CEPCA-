'use client'

import { use, useState } from 'react'
import { Check, CheckCircle, FilePdf, Hourglass, Repeat, WarningCircle } from '@phosphor-icons/react'
import { agendaParts, dayMonthYear, fmtFcfa, fmtInt, type ContributionDto } from '@cepca/shared'
import { download } from '@/lib/api'
import { useContribution } from '../../../../_lib/queries'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, ErrorState, Loading, Screen, SummaryRows, Txt, color } from '../../../../_components/ui'

const HEAD = {
  SUCCEEDED: { icon: CheckCircle, label: 'Paiement réussi', bg: color.primarySoft, fg: color.primary },
  PENDING: { icon: Hourglass, label: 'Paiement en attente', bg: color.warnBg, fg: color.warnFg },
  FAILED: { icon: WarningCircle, label: 'Paiement échoué', bg: color.errorBg, fg: color.errorFg },
  CANCELLED: { icon: WarningCircle, label: 'Paiement annulé', bg: color.errorBg, fg: color.errorFg },
  REFUNDED: { icon: Repeat, label: 'Paiement remboursé', bg: color.infoBg, fg: color.infoFg },
} as const

/** 1er du mois suivant, en toutes lettres : « 1er novembre » */
function nextFirst(): string {
  const now = new Date()
  return `1er ${agendaParts(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12))).month}`
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = useContribution(id, true)
  return (
    <Screen gap={16}>
      <BackHeader title="Reçu" fallback="/app/contribuer/historique" />
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
      await download(`/contributions/${encodeURIComponent(c.id)}/receipt.pdf`)
      setSaved(true)
    } catch {
      toast('Le reçu n’a pas pu être téléchargé.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 64, height: 64, borderRadius: 32, background: h.bg, color: h.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <h.icon size={34} weight="fill" aria-hidden />
        </span>
        <Txt size={14} weight={700} color={h.fg}>
          <span role="status">{h.label}</span>
        </Txt>
        <Txt serif size={48} lh={1.1} align="center">
          {fmtInt(c.totalCharged)}{' '}
          <span style={{ fontFamily: 'var(--font-sans), sans-serif', fontSize: 15, fontWeight: 700 }}>FCFA</span>
        </Txt>
        <Txt size={13} color={color.textMuted} align="center">
          {c.status === 'SUCCEEDED' ? 'Merci pour votre contribution.' : c.status === 'PENDING' ? 'En attente de la confirmation de l’opérateur.' : (c.failureReason ?? 'Aucun montant n’a été prélevé.')}
        </Txt>
      </div>
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
        <div style={{ padding: '12px 14px', borderRadius: 16, background: color.primarySoft, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Repeat size={20} color={color.primary} aria-hidden />
          <Txt size={13} style={{ flex: 1 }}>
            Contribution mensuelle. Prochain prélèvement le {nextFirst()}.
          </Txt>
        </div>
      ) : null}
      {ok && c.receiptNumber ? (
        <Btn label={saved ? 'Reçu enregistré (PDF)' : 'Télécharger le reçu (PDF)'} icon={saved ? Check : FilePdf} iconWeight={saved ? 'bold' : 'regular'} height={52} size={15} loading={busy} onClick={pdf} />
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn label="Historique" variant="outlineGreen" height={48} size={13} style={{ flex: 1 }} href="/app/contribuer/historique" />
        <Btn label="Accueil" variant="outline" height={48} size={13} style={{ flex: 1 }} href="/app" />
      </div>
    </>
  )
}
