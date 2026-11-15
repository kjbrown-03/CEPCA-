'use client'

import Link from 'next/link'
import { useState } from 'react'
import { agendaParts, fmtFcfa, fmtInt, fmtPct, pct, type EventDto } from '@cepca/shared'
import { errorMessage } from '@/lib/api'
import { useEngagement, useEvents, useRegistrations, useToggleRegistration } from '../../../_lib/queries'
import { eventTime } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Card, Empty, ErrorState, ListRow, Loading, Overline, Progress, Screen, Txt, color } from '../../../_components/ui'

type Tab = 'proj' | 'act'

/** Maquette 3 · « Mon engagement » : mes projets (dons de l'année, bénévolat) et mes activités. */
export default function Engagement() {
  const [tab, setTab] = useState<Tab>('proj')
  return (
    <Screen gap={14}>
      <BackHeader title="Mon engagement" fallback="/app/mon-eglise" />
      <div role="tablist" aria-label="Mon engagement" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: color.primarySoft }}>
        {(
          [
            ['proj', 'Mes projets'],
            ['act', 'Mes activités'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ flex: '1 1 0', minWidth: 0, height: 38, borderRadius: 999, textAlign: 'center', fontSize: 13, fontWeight: 700, background: tab === k ? color.primary : 'transparent', color: tab === k ? color.onPrimary : color.text }}>
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'proj' ? <Projects /> : <Activities />}</div>
    </Screen>
  )
}

function Projects() {
  const q = useEngagement()
  if (q.isPending) return <Loading />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const e = q.data
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card dark style={{ padding: 18, borderRadius: 22 }}>
        <Overline color={color.accentLight}>Mes dons aux projets en {e.year}</Overline>
        <Txt serif size={36} lh={1.1} color={color.onPrimary} style={{ marginTop: 6 }}>
          {fmtFcfa(e.givenThisYear)}
        </Txt>
      </Card>
      {e.projects.length === 0 ? (
        <Empty>Vous n’avez pas encore soutenu de projet. Donner ou proposer votre temps les fera apparaître ici.</Empty>
      ) : (
        e.projects.map(({ project: p, given, volunteer }) => {
          const progress = pct(p.raisedAmount, p.goalAmount)
          const role = [given > 0 ? 'Contributeur' : null, volunteer ? 'bénévole' : null].filter(Boolean).join(' · ')
          return (
            <Link key={p.id} href={`/app/projets/${encodeURIComponent(p.id)}`} className="pwa-press">
              <Card style={{ padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <Txt size={15} weight={700} lh={1.3}>
                    {p.title}
                  </Txt>
                  {p.goalAmount ? (
                    <Txt as="span" size={13} weight={700} color={color.primary} style={{ flex: 'none' }}>
                      {fmtPct(progress)}
                    </Txt>
                  ) : null}
                </div>
                {p.goalAmount ? <Progress value={progress} /> : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Txt as="span" size={12} color={color.textMuted}>
                    {role.replace(/^./, (x) => x.toUpperCase())}
                  </Txt>
                  {given > 0 ? (
                    <Txt as="span" size={12} weight={700}>
                      Mes dons : {fmtInt(given)}
                    </Txt>
                  ) : null}
                </div>
              </Card>
            </Link>
          )
        })
      )}
    </div>
  )
}

/** Mes inscriptions à venir, puis les activités ouvertes où je ne suis pas encore inscrit(e). */
function Activities() {
  const events = useEvents()
  const regs = useRegistrations()
  if (events.isPending || regs.isPending) return <Loading />
  if (events.isError) return <ErrorState error={events.error} onRetry={() => events.refetch()} />
  const now = Date.now()
  const mineIds = new Set((regs.data ?? []).map((e) => e.id))
  const list = events.data.filter((e) => (e.registrationOpen || mineIds.has(e.id)) && new Date(e.endsAt ?? e.startsAt).getTime() >= now - 3 * 3600_000)
  if (list.length === 0) return <Empty>Aucune activité ouverte aux inscriptions pour le moment.</Empty>
  return (
    <>
      {list.map((e) => (
        <ActivityRow key={e.id} e={e} />
      ))}
    </>
  )
}

function ActivityRow({ e }: { e: EventDto }) {
  const toast = useToast()
  const reg = useToggleRegistration(e.id)
  const d = agendaParts(e.startsAt)
  const full = e.remaining === 0 && !e.isRegistered
  return (
    <ListRow>
      <Link href={`/app/agenda/${encodeURIComponent(e.id)}`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 'none', width: 46, borderRadius: 12, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', background: color.primarySoft, color: color.primary }}>
          <Txt as="span" size={10} weight={700} upper>
            {d.monthShort}
          </Txt>
          <Txt as="span" serif size={22} lh={1.1}>
            {d.d}
          </Txt>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Txt as="span" size={14} weight={700} lh={1.3} style={{ display: 'block' }}>
            {e.title}
          </Txt>
          <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
            {eventTime(e)} · {e.place}
          </Txt>
        </span>
      </Link>
      {e.registrationOpen || e.isRegistered ? (
        <button
          type="button"
          disabled={full || reg.isPending}
          aria-busy={reg.isPending || undefined}
          onClick={() => reg.mutate(!e.isRegistered, { onError: (err) => toast(errorMessage(err), 'error') })}
          style={{ flex: 'none', height: 34, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: e.isRegistered ? color.primary : 'transparent', color: e.isRegistered ? color.onPrimary : color.primary, boxShadow: `inset 0 0 0 1.5px ${color.primary}`, opacity: full ? 0.5 : 1 }}
        >
          {e.isRegistered ? 'Inscrit ✓' : full ? 'Complet' : 'S’inscrire'}
        </button>
      ) : null}
    </ListRow>
  )
}
