'use client'

import { use, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { AdminSeat } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { staffKeys } from '../../../../_lib/staff'
import { SeatGate, can } from '../../../../_components/seat-gate'
import { Field, ToggleRow } from '../../../../_components/form'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, Chip, ChipRow, Empty, FormError, Screen, Txt, color } from '../../../../_components/ui'

const KINDS = [
  { value: 'ANNONCE', label: 'Annonce' },
  { value: 'ACTUALITE', label: 'Actualité' },
  { value: 'COMMUNIQUE', label: 'Communiqué' },
] as const

export default function AnnouncePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SeatGate id={id} title="Publier une annonce" fallback={`/app/espace/${id}`}>
      {(seat) => <AnnounceForm seat={seat} />}
    </SeatGate>
  )
}

/**
 * Annonce pour toute la structure du mandat. Le pasteur (droit de valider) publie directement ;
 * la communication rédige et soumet au pasteur (§ circuit de validation du back-office).
 */
function AnnounceForm({ seat }: { seat: AdminSeat }) {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const back = `/app/espace/${seat.assignmentId}`
  const publishes = can(seat, 'NEWS', 'validate')
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('ANNONCE')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can(seat, 'NEWS', 'write'))
    return (
      <Screen>
        <BackHeader title="Publier une annonce" fallback={back} />
        <Empty>Votre rôle ne permet pas de rédiger des annonces.</Empty>
      </Screen>
    )

  async function save(e: FormEvent, draftOnly = false) {
    e.preventDefault()
    if (title.trim().length < 3) return setError('Donnez un titre d’au moins 3 caractères.')
    setBusy(true)
    setError(null)
    try {
      const p = await api.post<{ id: string }>('/admin/publications', { title: title.trim(), kind, body: body.trim(), targetStructureId: seat.structure.id, notify, isPublic: true })
      if (!draftOnly) await api.post(`/admin/publications/${encodeURIComponent(p.id)}/${publishes ? 'publish' : 'submit'}`)
      await qc.invalidateQueries({ queryKey: ['app', 'staff'] })
      void qc.invalidateQueries({ queryKey: ['app', 'publications'] })
      void qc.invalidateQueries({ queryKey: staffKeys.dashboard(seat.assignmentId) })
      toast(draftOnly ? 'Brouillon enregistré' : publishes ? 'Annonce publiée' : 'Envoyée au pasteur pour validation')
      router.replace(back)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title={publishes ? 'Publier une annonce' : 'Rédiger'} fallback={back} />
      <Txt size={13} color={color.textMuted}>
        Pour tous les fidèles de {seat.structure.name}.
      </Txt>
      <form onSubmit={(e) => void save(e)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pwa-label">Type</span>
          <ChipRow>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} active={kind === k.value} onClick={() => setKind(k.value)} />
            ))}
          </ChipRow>
        </div>
        <Field label="Titre">
          <input className="pwa-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. Culte d’union dimanche 18 octobre" />
        </Field>
        <Field label="Texte" hint="Un paragraphe par ligne vide.">
          <textarea className="pwa-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} rows={7} />
        </Field>
        <ToggleRow label="Prévenir les fidèles" hint="Notification à la publication" value={notify} onChange={setNotify} />
        <FormError text={error} />
        <Btn type="submit" label={publishes ? 'Publier' : 'Envoyer au pasteur'} loading={busy} disabled={title.trim().length < 3} />
        <button type="button" onClick={(e) => void save(e as unknown as FormEvent, true)} disabled={busy || title.trim().length < 3} style={{ fontSize: 13, fontWeight: 700, color: color.primary, alignSelf: 'center' }}>
          Garder en brouillon
        </button>
      </form>
    </Screen>
  )
}
