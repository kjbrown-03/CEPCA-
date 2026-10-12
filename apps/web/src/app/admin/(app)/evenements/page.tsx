'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarBlank, Check, Plus } from '@phosphor-icons/react'
import { agendaParts, monthTitle, parisOffsetHours, timeIn, TZ_PARIS } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { EventDto, Page } from '@/lib/types'
import { doualaParts, fromDouala } from '@/lib/format'
import { ErrorBox, Field, Loading, PageHead, Pill, ToggleRow, useToast } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

const KINDS: Record<string, string> = {
  CULTE: 'Culte',
  CONFERENCE: 'Conférence',
  SEMINAIRE: 'Séminaire',
  FORMATION: 'Formation',
  REUNION: 'Réunion',
  CONCERT: 'Concert',
  JEUNESSE: 'Jeunesse',
  SOCIAL: 'Action sociale',
  CAMPAGNE: 'Campagne',
  CEPCA: 'Événement CEPCA',
  AUTRE: 'Autre',
}

interface Draft {
  id: string | null
  title: string
  kind: string
  date: string
  time: string
  place: string
  isLive: boolean
  liveUrl: string
  registrationOpen: boolean
  capacity: string
  responsible: string
  isPublic: boolean
  structureId: string
}

function nextSunday(): string {
  const d = new Date(Date.now() + 3600_000)
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7 || 7))
  return d.toISOString().slice(0, 10)
}

const fromDto = (e: EventDto): Draft => {
  const { date, time } = doualaParts(e.startsAt)
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    date,
    time,
    place: e.place,
    isLive: e.isLive,
    liveUrl: e.liveUrl ?? '',
    registrationOpen: e.registrationOpen,
    capacity: e.capacity ? String(e.capacity) : '',
    responsible: e.responsible ?? '',
    isPublic: e.isPublic,
    structureId: e.structure.id,
  }
}

export default function EventsPage() {
  return (
    <Suspense>
      <Events />
    </Suspense>
  )
}

function Events() {
  const params = useSearchParams()
  const { seat, can } = useSession()
  const [selId, setSelId] = useState<string | null>(params.get('id'))
  const [creating, setCreating] = useState(params.get('nouveau') === '1')
  const list = useInfiniteQuery({
    queryKey: ['events', seat.structure.id],
    queryFn: ({ pageParam }) => api.get<Page<EventDto>>('/admin/events', { structureId: seat.structure.id, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const offset = parisOffsetHours(new Date())

  // Regroupement par mois, comme l'agenda des fidèles
  const groups: Array<{ title: string; items: EventDto[] }> = []
  for (const e of rows) {
    const t = monthTitle(e.startsAt)
    if (groups[groups.length - 1]?.title !== t) groups.push({ title: t, items: [] })
    groups[groups.length - 1].items.push(e)
  }

  return (
    <>
      <PageHead
        eyebrow={`${seat.roleLabel} · ${seat.structure.level}`}
        title="Événements"
        note="Activités et cultes de l’agenda des fidèles, avec horaires Douala et Paris, retransmission et inscriptions."
      >
        {can('EVENTS', 'write') ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreating(true)
              setSelId(null)
            }}
          >
            <Plus size={16} weight="bold" />
            Nouvel événement
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        <section className="card tight main" style={{ flexBasis: 480 }}>
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.isPending ? <Loading rows={5} /> : null}
          {!list.isPending && rows.length === 0 ? (
            <div className="empty">
              <CalendarBlank size={40} />
              Aucun événement à venir. Créez le prochain culte ou la prochaine activité.
            </div>
          ) : null}
          {groups.map((g, gi) => (
            <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: gi ? 16 : 0 }}>
              <div className="card-head" style={{ marginBottom: 8 }}>
                <h2>{g.title}</h2>
                {gi === 0 ? <span className="meta">Heures de Douala · Paris {offset ? `+${offset} h` : 'même heure'}</span> : null}
              </div>
              {g.items.map((e) => {
                const p = agendaParts(e.startsAt)
                return (
                  <button
                    key={e.id}
                    type="button"
                    className="pick"
                    aria-pressed={e.id === selId && !creating}
                    onClick={() => {
                      setSelId(e.id)
                      setCreating(false)
                    }}
                  >
                    <div style={{ width: 54, flex: 'none', textAlign: 'center', borderRadius: 12, background: 'var(--c-primary-soft)', color: 'var(--c-primary)', padding: '7px 0' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{p.wd.replace('.', '')}</div>
                      <div style={{ font: '26px/1 var(--font-serif), serif' }}>{p.d}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, opacity: e.status === 'CANCELLED' ? 0.5 : 1 }}>{e.title}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                        {timeIn(e.startsAt)} · {e.place}
                        {e.structure.id !== seat.structure.id ? ` · ${e.structure.name}` : ''}
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 6 }}>
                        {e.isLive ? <span className="pill pill-sm tone-warn">Direct</span> : null}
                        {e.registrationOpen ? (
                          <span className="pill pill-sm tone-ok">
                            {e.registeredCount}
                            {e.capacity ? ` / ${e.capacity}` : ''} inscrit{e.registeredCount > 1 ? 's' : ''}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Pill label={e.statusLabel} />
                  </button>
                )
              })}
            </div>
          ))}
          {list.hasNextPage ? (
            <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 12 }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Afficher plus
            </button>
          ) : null}
        </section>

        <section className="card side">
          {creating ? (
            <Sheet
              key="new"
              initial={{ id: null, title: '', kind: 'CULTE', date: nextSunday(), time: '10:00', place: seat.structure.name.replace(/^Paroisse (de |d’|d')/, 'Temple de '), isLive: false, liveUrl: '', registrationOpen: false, capacity: '', responsible: '', isPublic: true, structureId: seat.structure.id }}
              onSaved={(id) => {
                setCreating(false)
                setSelId(id)
              }}
            />
          ) : selId ? (
            <Loaded id={selId} />
          ) : (
            <div className="empty">
              <CalendarBlank size={40} />
              Sélectionnez un événement pour voir sa fiche.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function Loaded({ id }: { id: string }) {
  const e = useQuery({ queryKey: ['event', id], queryFn: () => api.get<EventDto>(`/admin/events/${id}`) })
  if (e.isPending) return <Loading rows={6} />
  if (e.isError) return <ErrorBox error={e.error} onRetry={() => e.refetch()} />
  return <Sheet key={`${e.data.id}-${e.data.status}-${e.data.registeredCount}`} initial={fromDto(e.data)} ev={e.data} onSaved={() => undefined} />
}

function Sheet({ initial, ev, onSaved }: { initial: Draft; ev?: EventDto; onSaved: (id: string) => void }) {
  const { nodes } = useSeatSubtree()
  const qc = useQueryClient()
  const toast = useToast()
  const [d, setD] = useState<Draft>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const status = ev?.status ?? 'DRAFT'
  const editable = ev ? ev.canEdit !== false && status !== 'CANCELLED' : true
  const cap = parseInt(d.capacity || '0', 10)
  const n = ev?.registeredCount ?? 0
  const startsAt = d.date && d.time ? fromDouala(d.date, d.time) : null
  const valid = d.title.trim().length >= 3 && d.place.trim().length >= 2 && !!startsAt && (!d.isLive || !d.liveUrl || /^https:\/\//.test(d.liveUrl))

  const body = () => ({
    title: d.title.trim(),
    kind: d.kind,
    startsAt,
    place: d.place.trim(),
    isLive: d.isLive,
    liveUrl: d.isLive && d.liveUrl.trim() ? d.liveUrl.trim() : null,
    registrationOpen: d.registrationOpen,
    capacity: d.registrationOpen && cap > 0 ? cap : null,
    responsible: d.responsible.trim() || null,
    isPublic: d.isPublic,
  })

  const run = async (what: 'save' | 'publish' | 'cancel') => {
    setBusy(true)
    try {
      let id = d.id
      if (what === 'cancel') {
        if (!window.confirm(`Annuler « ${d.title} » ?${n ? ` Les ${n} inscrits seront prévenus.` : ''}`)) return
        const r = await api.post<{ notified: number }>(`/admin/events/${id}/cancel`)
        toast(`Événement annulé${r.notified ? ` · ${r.notified} inscrit(s) prévenu(s)` : ''}`)
      } else {
        if (id) await api.patch(`/admin/events/${id}`, body())
        else {
          id = (await api.post<EventDto>('/admin/events', { ...body(), structureId: d.structureId })).id
          setD((x) => ({ ...x, id }))
        }
        if (what === 'publish' && status === 'DRAFT') {
          await api.post(`/admin/events/${id}/publish`)
          toast("Publié dans l'agenda des fidèles")
        } else toast(status === 'PUBLISHED' ? 'Modifications enregistrées' : 'Brouillon enregistré')
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['events'] }), qc.invalidateQueries({ queryKey: ['event', id] }), qc.invalidateQueries({ queryKey: ['dashboard'] })])
      if (!initial.id && id) onSaved(id)
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card-head" style={{ alignItems: 'center' }}>
        <h2>Fiche de l’événement</h2>
        <Pill label={ev?.statusLabel ?? 'Brouillon'} />
      </div>
      <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Field label="Titre">
          <input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. Veillée de prière" maxLength={200} />
        </Field>
        <div className="cols-2">
          <Field label="Date">
            <input className="input" type="date" value={d.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Heure (Douala)">
            <input className="input" type="time" value={d.time} onChange={(e) => set('time', e.target.value)} />
          </Field>
        </div>
        {startsAt ? (
          <span className="muted" style={{ fontSize: 12, marginTop: -6 }}>
            Affiché aux fidèles de la diaspora : {timeIn(startsAt, TZ_PARIS)} à Paris
          </span>
        ) : null}
        <div className="cols-2">
          <Field label="Lieu">
            <input className="input" value={d.place} onChange={(e) => set('place', e.target.value)} />
          </Field>
          <Field label="Type">
            <select className="select" value={d.kind} onChange={(e) => set('kind', e.target.value)}>
              {Object.entries(KINDS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Responsable (facultatif)">
          <input className="input" value={d.responsible} onChange={(e) => set('responsible', e.target.value)} placeholder="Ex. Conseil paroissial" maxLength={120} />
        </Field>
        {!d.id && nodes.length > 1 ? (
          <div className="field">
            <span>Structure</span>
            <StructureSelect value={d.structureId} onChange={(v) => set('structureId', v)} />
          </div>
        ) : null}
        <ToggleRow title="Retransmission en direct" sub="Visible dans l’app à l’heure de l’événement" on={d.isLive} onChange={(v) => set('isLive', v)} />
        {d.isLive ? (
          <Field label="Lien du direct (facultatif)" error={d.liveUrl && !/^https:\/\//.test(d.liveUrl) ? 'Adresse https:// attendue' : undefined}>
            <input className="input" type="url" value={d.liveUrl} onChange={(e) => set('liveUrl', e.target.value)} placeholder="https://youtube.com/live/…" />
          </Field>
        ) : null}
        <ToggleRow title="Inscriptions" sub="Les fidèles s’inscrivent depuis l’agenda" on={d.registrationOpen} onChange={(v) => set('registrationOpen', v)} />
        {d.registrationOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Places disponibles" hint="Laissez vide pour ne pas limiter.">
              <input className="input" inputMode="numeric" value={d.capacity} onChange={(e) => set('capacity', e.target.value.replace(/\D/g, '').slice(0, 6))} />
            </Field>
            {cap > 0 ? (
              <>
                <div className="progress">
                  <div style={{ width: `${Math.min(100, (n / cap) * 100)}%` }} />
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  {n} inscrit{n > 1 ? 's' : ''} sur {cap}
                </span>
              </>
            ) : n ? (
              <span className="muted" style={{ fontSize: 12 }}>
                {n} inscrit{n > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        ) : null}
        <ToggleRow title="Visible sur le portail public" sub="Sinon, réservé aux fidèles connectés" on={d.isPublic} onChange={(v) => set('isPublic', v)} />
      </fieldset>
      {editable ? (
        <div className="row">
          <button type="button" className="btn" disabled={busy || !valid} onClick={() => run('publish')}>
            <Check size={16} weight="bold" />
            {status === 'PUBLISHED' ? 'Enregistrer' : "Publier dans l'agenda"}
          </button>
          {status === 'DRAFT' ? (
            <button type="button" className="btn-ghost" disabled={busy || !valid} onClick={() => run('save')}>
              Enregistrer le brouillon
            </button>
          ) : null}
          {d.id ? (
            <button type="button" className="btn-ghost btn-danger" disabled={busy} onClick={() => run('cancel')}>
              Annuler l’événement
            </button>
          ) : null}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>{status === 'CANCELLED' ? 'Événement annulé : il ne se modifie plus.' : 'Lecture seule.'}</span>
      )}
    </div>
  )
}
