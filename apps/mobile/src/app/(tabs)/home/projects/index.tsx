import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { fmtMillions, fmtPct, pct } from '@cepca/shared'
import { useProjects } from '@/lib/queries'
import { BackHeader, Empty, ErrorState, Loading, Photo, Progress, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

export default function Projects() {
  const q = useProjects()
  return (
    <Screen gap={14} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Projets et campagnes" fallback="/home" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucun projet en cours.</Empty>
      ) : (
        q.data.map((p) => {
          const v = pct(p.raisedAmount, p.goalAmount)
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/home/projects/${p.id}`)}
              accessibilityRole="button"
              accessibilityLabel={p.title}
              style={({ pressed }) => ({ borderRadius: 22, overflow: 'hidden', backgroundColor: color.surface, borderWidth: 1, borderColor: extra.divider, opacity: pressed ? 0.85 : 1 })}
            >
              <Photo uri={p.imageUrl} style={{ height: 140 }} />
              <View style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Txt size={15} weight={700} style={{ flex: 1 }}>
                    {p.title}
                  </Txt>
                  {p.goalAmount ? (
                    <Txt size={12} weight={700} color={color.primary}>
                      {fmtPct(v)}
                    </Txt>
                  ) : null}
                </View>
                {p.goalAmount ? <Progress value={v} /> : null}
                <Txt size={12} color={color.textMuted}>
                  {fmtMillions(p.raisedAmount)}
                  {p.goalAmount ? ` / ${fmtMillions(p.goalAmount)}` : ''} FCFA · {p.contributorCount} contributeurs
                </Txt>
              </View>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
