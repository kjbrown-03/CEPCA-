'use client'

import { use, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fmtInt, type AdminSeat } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { SeatGate, can } from '../../../../_components/seat-gate'
import { Field } from '../../../../_components/form'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, Chip, ChipRow, Empty, FormError, Screen, Txt, color } from '../../../../_components/ui'

export default function NotifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SeatGate id={id} title="Envoyer une notification" fallback={`/app/espace/${id}`}>
      {(seat) => <NotifyForm seat={seat} />}
    </SeatGate>
  )
}

/** Notification immédiate aux fidèles de la structure : push sur les téléphones abonnés et, au choix, e-mail. */
function NotifyForm({ seat }: { seat: AdminSeat }) {
  const router = useRouter()
  const toast = useToast()
  const back = `/app/espace/${seat.assignmentId}`
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [push, setPush] = useState(true)
  const [mail, setMail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estimate = useQuery({
    queryKey: ['app', 'staff', 'estimate', seat.structure.id],
    queryFn: () => api.get<{ recipients: number }>('/admin/campaigns/estimate', { targetStructureId: seat.structure.id }),
    enabled: can(seat, 'NOTIFICATIONS', 'write'),
  })

  if (!can(seat, 'NOTIFICATIONS', 'write'))
    return (
      <Screen>
        <BackHeader title="Envoyer une notification" fallback={back} />
        <Empty>Votre rôle ne permet pas d’envoyer des notifications.</Empty>
      </Screen>
    )

  const channels = [push && 'PUSH', mail && 'EMAIL'].filter(Boolean) as Array<'PUSH' | 'EMAIL'>
  const valid = title.trim().length >= 3 && message.trim().length >= 3 && channels.length > 0
  const n = estimate.data?.recipients

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ recipients: number }>('/admin/campaigns', { targetStructureId: seat.structure.id, title: title.trim(), message: message.trim(), channels, scheduledAt: null })
      toast(`Notification envoyée à ${fmtInt(r.recipients)} personne${r.recipients > 1 ? 's' : ''}`)
      router.replace(back)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title="Envoyer une notification" fallback={back} />
      <form onSubmit={send} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Titre">
          <input className="pwa-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex. Culte d’union dimanche" />
        </Field>
        <Field label="Message" hint={`${message.length} / 500`}>
          <textarea className="pwa-textarea" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={4} style={{ minHeight: 110 }} />
        </Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pwa-label">Canal</span>
          <ChipRow>
            <Chip label="Push" active={push} onClick={() => setPush(!push)} />
            <Chip label="E-mail" active={mail} onClick={() => setMail(!mail)} />
          </ChipRow>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 14, background: color.primarySoft }}>
          <Txt size={13} lh={1.5}>
            {n == null ? 'Calcul des destinataires…' : `${fmtInt(n)} destinataire${n > 1 ? 's' : ''} · tous les fidèles de ${seat.structure.name}`}. Envoi immédiat et gratuit.
          </Txt>
        </div>
        <FormError text={error} />
        <Btn type="submit" label="Envoyer maintenant" loading={busy} disabled={!valid} />
      </form>
    </Screen>
  )
}
