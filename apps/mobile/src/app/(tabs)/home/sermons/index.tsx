import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { HeadphonesIcon, VideoCameraIcon } from 'phosphor-react-native'
import { dayMonth } from '@cepca/shared'
import { useSermons } from '@/lib/queries'
import { BackHeader, Chip, ChipRow, Empty, ErrorState, ListRow, Loading, Photo, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

const FILTERS = [
  { label: 'Tout', type: undefined },
  { label: 'Audio', type: 'AUDIO' as const },
  { label: 'Vidéo', type: 'VIDEO' as const },
]

export default function Sermons() {
  const [f, setF] = useState(0)
  const q = useSermons(FILTERS[f].type)
  return (
    <Screen gap={12} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Prédications" fallback="/home" />
      <ChipRow wrap={false}>
        {FILTERS.map((x, i) => (
          <Chip key={x.label} label={x.label} active={f === i} onPress={() => setF(i)} />
        ))}
      </ChipRow>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune prédication pour ce filtre.</Empty>
      ) : (
        <View>
          {q.data.map((s) => {
            const video = s.mediaType === 'VIDEO'
            const I = video ? VideoCameraIcon : HeadphonesIcon
            return (
              <ListRow key={s.id} py={8} onPress={() => router.push(`/home/sermons/${s.id}`)} label={s.title}>
                <View style={{ width: 96, height: 72 }}>
                  <Photo uri={s.imageUrl} radius={14} style={{ flex: 1 }} />
                  <View style={{ position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <I size={12} weight="fill" color={color.primary} />
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt size={11} weight={700} color={color.primary}>
                    {video ? 'Vidéo' : 'Audio'}
                    {s.durationSec ? ` · ${Math.round(s.durationSec / 60)} min` : ''}
                  </Txt>
                  <Txt serif size={20} lh={1.15}>
                    {s.title}
                  </Txt>
                  <Txt size={12} color={color.textMuted} numberOfLines={1}>
                    {[s.speaker, dayMonth(s.publishedAt)].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
              </ListRow>
            )
          })}
        </View>
      )}
    </Screen>
  )
}
