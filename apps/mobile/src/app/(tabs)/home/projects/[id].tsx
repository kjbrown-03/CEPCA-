import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircleIcon, CircleIcon, HandHeartIcon } from 'phosphor-react-native'
import { fmtMillions, fmtPct, pct } from '@cepca/shared'
import { useProject } from '@/lib/queries'
import { BackHeader, Btn, Card, ErrorState, ListRow, Loading, Photo, Progress, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useProject(id)
  const p = q.data
  return (
    <Screen gap={14} bottom={28} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Projet" fallback="/home/projects" />
      {q.isPending ? (
        <Loading />
      ) : q.isError || !p ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Photo uri={p.imageUrl} radius={22} style={{ height: 200 }} />
          <Txt serif size={30} lh={1.1} accessibilityRole="header">
            {p.title}
          </Txt>
          <Txt size={15} lh={1.6} color={color.textMuted2}>
            {p.description}
          </Txt>
          <Card dark style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Txt serif size={34} color={color.onPrimary}>
                {p.goalAmount ? fmtPct(pct(p.raisedAmount, p.goalAmount)) : `${fmtMillions(p.raisedAmount)} FCFA`}
              </Txt>
              {p.endLabel ? (
                <Txt size={12} color={color.onPrimaryMuted} style={{ flexShrink: 1 }} align="right">
                  Échéance : {p.endLabel}
                </Txt>
              ) : null}
            </View>
            {p.goalAmount ? <Progress value={pct(p.raisedAmount, p.goalAmount)} height={8} track={extra.progressOnDark} fill={color.accent} /> : null}
            <Txt size={13} color={color.onPrimaryMuted2}>
              {p.goalAmount ? `${fmtMillions(p.raisedAmount)} sur ${fmtMillions(p.goalAmount)} FCFA · ` : ''}
              {p.contributorCount} contributeurs
            </Txt>
          </Card>

          {p.steps.length ? (
            <View style={{ gap: 2 }}>
              <Txt serif size={22}>
                Étapes
              </Txt>
              {p.steps.map((s) => (
                <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                  {s.done ? <CheckCircleIcon size={18} weight="fill" color={color.primary} /> : <CircleIcon size={18} color={color.textFaint} />}
                  <Txt size={14} color={s.done ? color.text : color.textMuted}>
                    {s.label}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}

          {p.updates.length ? (
            <View>
              <Txt serif size={22} style={{ marginBottom: 4 }}>
                Suivi du projet
              </Txt>
              {p.updates.map((u, i) => (
                <ListRow key={i} py={8} align="flex-start">
                  <Txt size={12} weight={700} color={color.textMuted} style={{ width: 62 }}>
                    {u.date}
                  </Txt>
                  <Txt size={14} style={{ flex: 1 }}>
                    {u.title}
                  </Txt>
                </ListRow>
              ))}
            </View>
          ) : null}

          {p.collectOpen ? (
            <Btn
              label="Soutenir ce projet"
              icon={HandHeartIcon}
              style={{ marginTop: 4 }}
              onPress={() => router.navigate({ pathname: '/give', params: { project: p.id } })}
            />
          ) : (
            <Txt size={13} color={color.textMuted} align="center">
              La collecte de ce projet est fermée.
            </Txt>
          )}
        </>
      )}
    </Screen>
  )
}
