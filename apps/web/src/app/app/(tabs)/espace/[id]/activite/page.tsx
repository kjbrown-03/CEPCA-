'use client'

import { use, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { AdminSeat } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { SeatGate, can } from '../../../../_components/seat-gate'
import { Field, ToggleRow, doualaIso, todayDouala } from '../../../../_components/form'
import { useToast } from '../../../../_components/toast'
import { BackHeader, Btn, Chip, ChipRow, Empty, FormError, Screen, Txt, color } from '../../../../_components/ui'

const KINDS = [
  { value: 'CULTE', label: 'Culte' },
  { value: 'REUNION', label: 'Réunion' },
  { value: 'JEUNESSE', label: 'Jeunesse' },
  { value: 'FORMATION', label: 'Formation' },
  { value: 'AUTRE', label: 'Autre' },
] as const

export default function EventFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <SeatGate id={id} title="Créer une activité" fallback={`/app/espace/${id}`}>
      {(seat) => <EventForm seat={seat} />}
    </SeatGate>
  )
}

/** Activité de la structure, publiée dans l'agenda des fidèles. Heures saisies à Douala (Paris = +1 h l'hiver). */
function EventForm({ seat }: { seat: AdminSeat }) {
  const router = useRouter()
  const qc = useQueryClient()
  const toast = useToast()
  const back = `/app/espace/${seat.assignmentId}`
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('CULTE')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayDouala())
  const [start, setStart] = useState('10:00')
  const [end, setEnd] = useState('')
  const [place, setPlace] = useState('')
  const [description, setDescription] = useState('')
  const [registration, setRegistration] = useState(false)
  const [capacity, setCapacity] = useState('')
  const [live, setLive] = useState(false)
  const [liveUrl, setLiveUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!can(seat, 'EVENTS', 'write'))
    return (
      <Screen>
        <BackHeader title="Créer une activité" fallback={back} />
        <Empty>Votre rôle ne permet pas de créer des activités.</Empty>
      </Screen>
    )

  const startsAt = doualaIso(date, start)
  const endsAt = end ? doualaIso(date, end) : null
  const valid = title.trim().length >= 3 && place.trim().length >= 2 && !!startsAt && (!live || /^https:\/\//.test(liveUrl.trim()))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!valid || !startsAt) return
    setBusy(true)
    setError(null)
    try {
      const ev = await api.post<{ id: string }>('/admin/events', {
        title: title.trim(),
        kind,
        description: description.trim() || null,
        startsAt,
        endsAt,
        place: place.trim(),
        isLive: live,
        liveUrl: live ? liveUrl.trim() : null,
        registrationOpen: registration,
        capacity: registration && capacity ? Number(capacity) : null,
        isPublic: true,
        structureId: seat.structure.id,
      })
      await api.post(`/admin/events/${encodeURIComponent(ev.id)}/publish`)
      void qc.invalidateQueries({ queryKey: ['app'] })
      toast('Activité publiée dans l’agenda')
      router.replace(back)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Screen gap={16}>
      <BackHeader title="Créer une activité" fallback={back} />
      <Txt size={13} color={color.textMuted}>
        Dans l’agenda des fidèles de {seat.structure.name}.
      </Txt>
      <form onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="pwa-label">Type</span>
          <ChipRow>
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} active={kind === k.value} onClick={() => setKind(k.value)} />
            ))}
          </ChipRow>
        </div>
        <Field label="Titre">
          <input className="pwa-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ex. Culte d’union du consistoire" />
        </Field>
        <Field label="Date">
          <input className="pwa-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Field label="Début (Douala)">
              <input className="pwa-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Fin (facultatif)">
              <input className="pwa-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        </div>
        <Field label="Lieu">
          <input className="pwa-input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} placeholder="Ex. Temple de Deïdo" />
        </Field>
        <Field label="Description (facultatif)">
          <textarea className="pwa-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} rows={4} style={{ minHeight: 100 }} />
        </Field>
        <ToggleRow label="Inscriptions" hint="Les fidèles s’inscrivent depuis l’agenda" value={registration} onChange={setRegistration} />
        {registration ? (
          <Field label="Nombre de places (facultatif)">
            <input className="pwa-input" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Illimité" />
          </Field>
        ) : null}
        <ToggleRow label="Retransmis en direct" hint="Lien suivi par la diaspora" value={live} onChange={setLive} />
        {live ? (
          <Field label="Lien du direct" hint="Adresse https (YouTube, Facebook…)">
            <input className="pwa-input" type="url" inputMode="url" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="https://" />
          </Field>
        ) : null}
        <FormError text={error} />
        <Btn type="submit" label="Publier l’activité" loading={busy} disabled={!valid} />
      </form>
    </Screen>
  )
}
