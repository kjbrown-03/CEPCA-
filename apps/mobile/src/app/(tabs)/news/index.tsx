import { useState } from 'react'
import { Pressable } from 'react-native'
import { router } from 'expo-router'
import { dayMonth, type Scope } from '@cepca/shared'
import { usePublications } from '@/lib/queries'
import { Chip, ChipRow, Empty, ErrorState, Loading, Photo, Screen } from '@/components/ui'
import { Overline, Txt } from '@/components/Txt'

const FILTERS: Array<{ label: string; scope?: Scope }> = [
  { label: 'Tout' },
  { label: 'Paroisse', scope: 'PAROISSE' },
  { label: 'Confession', scope: 'CONFESSION' },
  { label: 'CEPCA', scope: 'CEPCA' },
]

export default function News() {
  const [f, setF] = useState(0)
  const q = usePublications(FILTERS[f].scope)
  return (
    <Screen gap={14} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Txt serif size={34} lh={1.05} accessibilityRole="header">
        Actualités
      </Txt>
      <ChipRow>
        {FILTERS.map((x, i) => (
          <Chip key={x.label} label={x.label} active={f === i} onPress={() => setF(i)} />
        ))}
      </ChipRow>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune publication pour ce filtre.</Empty>
      ) : (
        q.data.map((n) => (
          <Pressable key={n.id} onPress={() => router.push(`/news/${n.id}`)} accessibilityRole="button" accessibilityLabel={n.title} style={({ pressed }) => ({ gap: 8, paddingBottom: 6, opacity: pressed ? 0.8 : 1 })}>
            <Photo uri={n.imageUrl} radius={20} style={{ height: 170 }} />
            <Overline>
              {n.kindLabel} · {n.source} · {dayMonth(n.publishedAt)}
            </Overline>
            <Txt serif size={23} lh={1.15}>
              {n.title}
            </Txt>
          </Pressable>
        ))
      )}
    </Screen>
  )
}
