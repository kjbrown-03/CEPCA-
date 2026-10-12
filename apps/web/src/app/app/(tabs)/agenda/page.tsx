'use client'

import { Fragment } from 'react'
import { Check } from '@phosphor-icons/react'
import { agendaParts, monthTitle } from '@cepca/shared'
import { useEvents } from '../../_lib/queries'
import { eventTime } from '../../_lib/device'
import { Empty, ErrorState, ListRow, Loading, Screen, Txt, color } from '../../_components/ui'

export default function Agenda() {
  const q = useEvents()
  const first = q.data?.[0]
  return (
    <Screen gap={6}>
      <Txt as="h1" serif size={34} lh={1.05}>
        Agenda
      </Txt>
      <Txt size={13} color={color.textMuted} style={{ marginBottom: 8 }}>
        {first ? monthTitle(first.startsAt) : monthTitle(new Date())} · heures de Douala et de Paris
      </Txt>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune activité prévue pour le moment.</Empty>
      ) : (
        q.data.map((e, i) => {
          const d = agendaParts(e.startsAt)
          const month = monthTitle(e.startsAt)
          // Intertitre quand on change de mois (le premier mois est dans le sous-titre)
          const newMonth = i > 0 && month !== monthTitle(q.data[i - 1].startsAt)
          return (
            <Fragment key={e.id}>
              {newMonth ? (
                <Txt as="h2" serif size={24} style={{ marginTop: 18 }}>
                  {month}
                </Txt>
              ) : null}
              <ListRow href={`/app/agenda/${encodeURIComponent(e.id)}`} label={`${d.wd} ${d.d} ${d.month}, ${e.title}`}>
                <span style={{ flex: 'none', width: 52, borderRadius: 14, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', background: e.isRegistered ? color.primary : color.primarySoft, color: e.isRegistered ? color.onPrimary : color.primary }}>
                  <Txt as="span" size={10} weight={700} upper>
                    {d.wd}
                  </Txt>
                  <Txt as="span" serif size={26} lh={1.1}>
                    {d.d}
                  </Txt>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Txt as="span" size={14} weight={700} lh={1.3} style={{ display: 'block' }}>
                    {e.title}
                  </Txt>
                  <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block', marginTop: 2 }}>
                    {eventTime(e)}
                  </Txt>
                  <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
                    {e.place}
                  </Txt>
                </span>
                {e.isRegistered ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: color.primary, fontSize: 11, fontWeight: 700 }}>
                    <Check size={12} weight="bold" aria-hidden />
                    Inscrit
                  </span>
                ) : null}
              </ListRow>
            </Fragment>
          )
        })
      )}
    </Screen>
  )
}
