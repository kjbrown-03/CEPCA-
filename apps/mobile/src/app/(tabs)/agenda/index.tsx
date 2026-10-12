import { Fragment } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { CheckIcon } from 'phosphor-react-native'
import { agendaParts, monthTitle } from '@cepca/shared'
import { useEvents } from '@/lib/queries'
import { eventTime } from '@/lib/format'
import { Empty, ErrorState, ListRow, Loading, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

export default function Agenda() {
  const q = useEvents()
  const first = q.data?.[0]
  return (
    <Screen gap={6} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Txt serif size={34} lh={1.05} accessibilityRole="header">
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
                <Txt serif size={24} style={{ marginTop: 18 }}>
                  {month}
                </Txt>
              ) : null}
              <ListRow onPress={() => router.push(`/agenda/${e.id}`)} label={`${d.wd} ${d.d} ${d.month}, ${e.title}`}>
                <View style={{ width: 52, borderRadius: 14, paddingVertical: 8, alignItems: 'center', backgroundColor: e.isRegistered ? color.primary : color.primarySoft }}>
                  <Txt size={10} weight={700} upper color={e.isRegistered ? color.onPrimary : color.primary}>
                    {d.wd}
                  </Txt>
                  <Txt serif size={26} lh={1.1} color={e.isRegistered ? color.onPrimary : color.primary}>
                    {d.d}
                  </Txt>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={14} weight={700} lh={1.3}>
                    {e.title}
                  </Txt>
                  <Txt size={12} color={color.textMuted} style={{ marginTop: 2 }}>
                    {eventTime(e)}
                  </Txt>
                  <Txt size={12} color={color.textMuted}>
                    {e.place}
                  </Txt>
                </View>
                {e.isRegistered ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <CheckIcon size={12} weight="bold" color={color.primary} />
                    <Txt size={11} weight={700} color={color.primary}>
                      Inscrit
                    </Txt>
                  </View>
                ) : null}
              </ListRow>
            </Fragment>
          )
        })
      )}
    </Screen>
  )
}
