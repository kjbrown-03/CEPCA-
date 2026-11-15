'use client'

import Link from 'next/link'
import { Check, HandHeart, Plus } from '@phosphor-icons/react'
import { agendaParts, fmtPct, pct, type EventDto, type ProjectDto } from '@cepca/shared'
import { errorMessage } from '@/lib/api'
import { useEvents, useMe, useProjects, useToggleRegistration, useToggleVolunteering, useVolunteering } from '../../../_lib/queries'
import { eventTime } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Btn, Card, Empty, ErrorState, ListRow, Loading, Overline, Progress, Screen, Txt, color } from '../../../_components/ui'

/** Maquette 3 · « Espace jeunes et actions sociales » : activités jeunesse, puis actions sociales avec « Donner ». */
export default function Youth() {
  const events = useEvents()
  const projects = useProjects()
  const youth = (events.data ?? []).filter((e) => e.kind === 'JEUNESSE')
  const [featured, ...others] = youth
  const social = (projects.data ?? []).filter((p) => p.kind === 'SOCIAL' && p.status !== 'COMPLETED')

  return (
    <Screen gap={16}>
      <BackHeader title="Espace jeunes" fallback="/app/mon-eglise" />

      {events.isPending ? (
        <Loading minHeight={160} />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : featured ? (
        <>
          <Featured e={featured} />
          {others.length ? (
            <section>
              <Txt as="h2" serif size={22} style={{ marginBottom: 4 }}>
                Pour vous
              </Txt>
              {others.map((e) => {
                const d = agendaParts(e.startsAt)
                return (
                  <ListRow key={e.id} href={`/app/agenda/${encodeURIComponent(e.id)}`}>
                    <span style={{ flex: 'none', width: 46, borderRadius: 12, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', background: e.isRegistered ? color.primary : color.primarySoft, color: e.isRegistered ? color.onPrimary : color.primary }}>
                      <Txt as="span" size={10} weight={700} upper>
                        {d.wd}
                      </Txt>
                      <Txt as="span" serif size={22} lh={1.1}>
                        {d.d}
                      </Txt>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <Txt as="span" size={14} weight={700} style={{ display: 'block' }}>
                        {e.title}
                      </Txt>
                      <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
                        {eventTime(e)} · {e.place}
                      </Txt>
                    </span>
                  </ListRow>
                )
              })}
            </section>
          ) : null}
        </>
      ) : (
        <Empty>Aucune activité jeunesse prévue pour le moment.</Empty>
      )}

      <section>
        <Txt as="h2" serif size={22} style={{ marginBottom: 6 }}>
          Actions sociales
        </Txt>
        {projects.isPending ? (
          <Loading minHeight={120} />
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
        ) : social.length === 0 ? (
          <Empty>Aucune action sociale en cours.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {social.map((p) => (
              <SocialCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </Screen>
  )
}

function Featured({ e }: { e: EventDto }) {
  const toast = useToast()
  const reg = useToggleRegistration(e.id)
  const d = agendaParts(e.startsAt)
  const full = e.remaining === 0 && !e.isRegistered
  return (
    <Card dark style={{ padding: 18, borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Overline color={color.accentLight}>
        {e.source} · {d.wd} {d.d} {d.monthShort}
      </Overline>
      <Link href={`/app/agenda/${encodeURIComponent(e.id)}`}>
        <Txt serif size={28} lh={1.05} color={color.onPrimary}>
          {e.title}
        </Txt>
      </Link>
      <Txt size={12} color={color.onPrimaryMuted}>
        {eventTime(e)} · {e.place}
      </Txt>
      {e.registrationOpen ? (
        <Btn
          label={e.isRegistered ? 'Inscrit(e)' : full ? 'Complet' : 'Je m’inscris'}
          icon={e.isRegistered ? Check : Plus}
          variant={e.isRegistered ? 'light' : 'ochre'}
          height={44}
          size={14}
          disabled={full}
          loading={reg.isPending}
          style={{ alignSelf: 'flex-start', padding: '0 18px' }}
          onClick={() => reg.mutate(!e.isRegistered, { onError: (err) => toast(errorMessage(err), 'error') })}
        />
      ) : null}
    </Card>
  )
}

function SocialCard({ p }: { p: ProjectDto }) {
  const toast = useToast()
  const me = useMe()
  const mine = useVolunteering()
  const vol = useToggleVolunteering(p.id)
  const on = !!mine.data?.includes(p.id)
  const active = me.data?.membership?.status === 'ACTIVE'
  const progress = pct(p.raisedAmount, p.goalAmount)

  return (
    <Card style={{ padding: 16, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href={`/app/projets/${encodeURIComponent(p.id)}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <Txt size={15} weight={700} lh={1.3}>
          {p.title}
        </Txt>
        {p.goalAmount ? (
          <Txt as="span" size={13} weight={700} color={color.primary} style={{ flex: 'none' }}>
            {fmtPct(progress, 0)}
          </Txt>
        ) : null}
      </Link>
      {p.goalAmount ? <Progress value={progress} /> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {p.collectOpen ? <Btn label="Donner" icon={HandHeart} height={40} size={13} href={`/app/contribuer?projet=${encodeURIComponent(p.id)}`} style={{ flex: 1 }} /> : null}
        <Btn
          label={on ? 'Bénévole ✓' : 'Je donne du temps'}
          variant={on ? 'outlineGreen' : 'outline'}
          height={40}
          size={13}
          disabled={!active && !on}
          loading={vol.isPending}
          style={{ flex: 1 }}
          onClick={() =>
            vol.mutate(!on, {
              onSuccess: (r) => toast(r.volunteer ? 'Merci ! Le responsable pourra vous contacter.' : 'Vous ne figurez plus parmi les bénévoles.'),
              onError: (err) => toast(errorMessage(err), 'error'),
            })
          }
        />
      </div>
    </Card>
  )
}
