'use client'

import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { BellRinging, EnvelopeSimple, PaperPlaneTilt } from '@phosphor-icons/react'
import { fmtInt } from '@cepca/shared'
import { api } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSeatSubtree, useSession } from '@/lib/session'
import type { Audiences, CampaignDto, Page } from '@/lib/types'
import { dayTime } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead } from '@/components/ui'
import { StructureSelect } from '@/components/structure-select'

/** Valeur par défaut du champ « programmer » : demain 8:00 à Douala. */
function tomorrowMorning(): string {
  const d = new Date(Date.now() + 86_400_000 + 3600_000)
  return `${d.toISOString().slice(0, 10)}T08:00`
}

export default function NotificationsPage() {
  const { seat, can } = useSession()
  const { nodes } = useSeatSubtree()
  const [target, setTarget] = useState(seat.structure.id)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [groupId, setGroupId] = useState('')
  const [push, setPush] = useState(true)
  const [mail, setMail] = useState(false)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState(tomorrowMorning)

  const aud = useQuery({ queryKey: ['audiences', target], queryFn: () => api.get<Audiences>('/admin/campaigns/audiences', { structureId: target }), staleTime: 60_000 })
  const list = useInfiniteQuery({
    queryKey: ['campaigns'],
    queryFn: ({ pageParam }) => api.get<Page<CampaignDto>>('/admin/campaigns', { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []

  const group = aud.data?.groups.find((g) => g.id === groupId)
  const n = group ? group.recipients : (aud.data?.all ?? 0)
  const audLabel = group?.name ?? 'Tous les fidèles'
  const channels = [push && 'PUSH', mail && 'EMAIL'].filter(Boolean) as Array<'PUSH' | 'EMAIL'>
  const scheduledAt = when === 'later' && at ? new Date(`${at}:00+01:00`) : null
  const past = !!scheduledAt && scheduledAt.getTime() < Date.now()
  const valid = title.trim().length >= 3 && message.trim().length >= 3 && message.length <= 500 && channels.length > 0 && !past

  const send = useAct(
    () =>
      api.post<{ status: string; recipients: number }>('/admin/campaigns', {
        targetStructureId: target,
        groupId: groupId || null,
        title: title.trim(),
        message: message.trim(),
        channels,
        scheduledAt: scheduledAt?.toISOString() ?? null,
      }),
    {
      ok: (r) => (r.status === 'SCHEDULED' ? 'Notification programmée' : `Notification envoyée à ${fmtInt(r.recipients)} personne${r.recipients > 1 ? 's' : ''}`),
      invalidate: [['campaigns'], ['dashboard']],
      onDone: () => {
        setTitle('')
        setMessage('')
      },
    },
  )
  const cancel = useAct((id: string) => api.post(`/admin/campaigns/${id}/cancel`), { ok: 'Envoi programmé annulé', invalidate: [['campaigns']] })
  const writable = can('NOTIFICATIONS', 'write')
  const submit = () => valid && !send.isPending && send.mutate()

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Notifications" note="Envoyez une notification push ou un e-mail aux fidèles, maintenant ou à une date programmée.">
        {writable ? (
          <button type="button" className="btn" disabled={!valid || send.isPending} onClick={submit}>
            <PaperPlaneTilt size={16} weight="bold" />
            Envoyer la notification
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        {writable ? (
          <form
            className="card main"
            style={{ flexBasis: 420 }}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <h2>Nouvelle notification</h2>
            <Field label="Titre">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Culte d'union dimanche" maxLength={80} />
            </Field>
            <label className="field">
              <span className="row" style={{ justifyContent: 'space-between' }}>
                Message
                <span style={{ fontWeight: 600, color: 'var(--c-text-muted)' }}>{message.length} / 500</span>
              </span>
              <textarea className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Le texte de la notification" maxLength={500} />
            </label>
            {nodes.length > 1 ? (
              <div className="field">
                <span>Structure</span>
                <StructureSelect
                  value={target}
                  onChange={(v) => {
                    setTarget(v)
                    setGroupId('')
                  }}
                />
              </div>
            ) : null}
            <div className="field">
              <span>Destinataires</span>
              <Chips label="Destinataires" options={[{ value: '', label: 'Tous les fidèles' }, ...(aud.data?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))]} value={groupId} onChange={setGroupId} />
            </div>
            <div className="field">
              <span>Canal</span>
              <div className="chips">
                <button type="button" role="checkbox" aria-checked={push} className={`chip${push ? ' on' : ''}`} onClick={() => setPush(!push)}>
                  Push
                </button>
                <button type="button" role="checkbox" aria-checked={mail} className={`chip${mail ? ' on' : ''}`} onClick={() => setMail(!mail)}>
                  E-mail
                </button>
              </div>
            </div>
            <div className="field">
              <span>Envoi</span>
              <Chips
                label="Envoi"
                options={[
                  { value: 'now', label: 'Maintenant' },
                  { value: 'later', label: 'Programmer' },
                ]}
                value={when}
                onChange={setWhen}
              />
            </div>
            {when === 'later' ? (
              <Field label="Date et heure (Douala)" error={past ? 'Cette date est passée.' : undefined}>
                <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
              </Field>
            ) : null}
            <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--c-primary-soft)', fontSize: 13, lineHeight: 1.5 }}>
              {fmtInt(n)} destinataire{n > 1 ? 's' : ''} ({audLabel.toLowerCase()})
              {mail ? ' · par e-mail aux fidèles qui ont renseigné leur adresse' : ''} · envoi gratuit.
            </div>
            <button type="submit" className="btn" disabled={!valid || send.isPending}>
              <PaperPlaneTilt size={16} weight="bold" />
              {when === 'now' ? 'Envoyer maintenant' : "Programmer l'envoi"}
            </button>
          </form>
        ) : null}

        <section className="card tight main" style={{ flexBasis: 420 }}>
          <h2 style={{ marginBottom: 8 }}>Envoyées et programmées</h2>
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          {list.isPending ? <Loading rows={3} /> : null}
          {!list.isPending && rows.length === 0 ? <div className="empty-line">Aucune notification envoyée pour le moment.</div> : null}
          {rows.map((x) => {
            const Icon = x.channels.length === 1 && x.channels[0] === 'EMAIL' ? EnvelopeSimple : BellRinging
            const ch = x.channels.map((c) => (c === 'PUSH' ? 'Push' : c === 'EMAIL' ? 'E-mail' : 'SMS')).join(' + ')
            const whenL = x.status === 'SCHEDULED' ? `Programmée · ${dayTime(x.scheduledAt!)}` : x.status === 'CANCELLED' ? 'Annulée' : dayTime(x.sentAt ?? x.scheduledAt ?? new Date().toISOString())
            const rate = x.status === 'SENT' && x.recipients ? `${Math.round((x.opened / x.recipients) * 100)} % ouvertes` : x.status === 'SCHEDULED' ? 'En attente' : ''
            return (
              <div key={x.id} className="line" style={{ alignItems: 'flex-start', gap: 12, boxShadow: '0 1px 0 var(--c-border-soft)' }}>
                <span className="tile">
                  <Icon size={18} />
                </span>
                <div className="grow">
                  <div className="t" style={{ fontWeight: 700 }}>
                    {x.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c-text-muted-2)', marginTop: 2 }}>{x.message}</div>
                  <div className="m" style={{ marginTop: 4 }}>
                    {x.audience} · {ch} · {whenL}
                  </div>
                </div>
                <div className="right muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 700, color: 'var(--c-text)' }}>{fmtInt(x.recipients)}</div>
                  {rate}
                  {x.status === 'SCHEDULED' && writable ? (
                    <div>
                      <button type="button" className="link-danger" disabled={cancel.isPending} onClick={() => cancel.mutate(x.id)}>
                        Annuler
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
          {list.hasNextPage ? (
            <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              Afficher plus
            </button>
          ) : null}
        </section>
      </div>
    </>
  )
}
