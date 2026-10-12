import { Pressable, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { BellIcon, BroadcastIcon, BuildingsIcon, ChurchIcon, MegaphoneIcon, MicrophoneStageIcon, ReceiptIcon, CalendarCheckIcon, type Icon } from 'phosphor-react-native'
import { relativeShort, type NotificationDto } from '@cepca/shared'
import { useMarkRead, useNotifications } from '@/lib/queries'
import { useNow } from '@/lib/hooks'
import { BackHeader, Empty, ErrorState, IconTile, Loading, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

const ICON: Record<string, Icon> = {
  LIVE: BroadcastIcon,
  ANNOUNCEMENT: MegaphoneIcon,
  RECEIPT: ReceiptIcon,
  PAYMENT: ReceiptIcon,
  SERMON: MicrophoneStageIcon,
  PROJECT: BuildingsIcon,
  EVENT: CalendarCheckIcon,
  MEMBERSHIP: ChurchIcon,
}

/** Écran lié à une notification (link.screen reprend les noms d'écrans de la maquette). */
function target(link: NotificationDto['link']): Href | null {
  if (!link) return null
  const id = link.id ? encodeURIComponent(link.id) : ''
  switch (link.screen) {
    case 'evt':
      return id ? `/agenda/${id}` : '/agenda'
    case 'newsD':
      return id ? `/news/${id}` : '/news'
    case 'sermD':
      return id ? `/home/sermons/${id}` : '/home/sermons'
    case 'projD':
      return id ? `/home/projects/${id}` : '/home/projects'
    case 'receipt':
      return id ? `/give/receipt/${id}` : '/give/history'
    case 'hist':
      return '/give/history'
    case 'docs':
      return '/home/documents'
    case 'prof':
      return '/me'
    default:
      return null
  }
}

export default function Notifications() {
  const q = useNotifications()
  const mark = useMarkRead()
  const now = useNow(60_000)
  const anyUnread = q.data?.some((n) => !n.read)

  return (
    <Screen gap={0} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ marginBottom: 8 }}>
        <BackHeader
          title="Notifications"
          fallback="/home"
          right={
            anyUnread ? (
              <Txt size={13} weight={700} color={color.primary} onPress={() => mark.mutate('all')} accessibilityRole="button" suppressHighlighting>
                Tout marquer lu
              </Txt>
            ) : null
          }
        />
      </View>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune notification pour le moment.</Empty>
      ) : (
        q.data.map((n) => {
          const go = target(n.link)
          return (
            <Pressable
              key={n.id}
              onPress={() => {
                if (!n.read) mark.mutate(n.id)
                if (go) router.push(go)
              }}
              accessibilityRole="button"
              accessibilityLabel={`${n.read ? '' : 'Non lue. '}${n.title}. ${n.body}`}
              style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 16, backgroundColor: n.read ? 'transparent' : color.surface, opacity: pressed ? 0.7 : 1 })}
            >
              <IconTile icon={ICON[n.kind] ?? BellIcon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={14} weight={n.read ? 500 : 700} lh={1.3}>
                  {n.title}
                </Txt>
                <Txt size={12} color={color.textMuted} style={{ marginTop: 2 }}>
                  {n.body}
                </Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Txt size={11} color={color.textMuted}>
                  {relativeShort(n.createdAt, now)}
                </Txt>
                {n.read ? null : <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.accent }} />}
              </View>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
