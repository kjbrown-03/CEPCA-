import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { BellIcon, BuildingsIcon, FolderSimpleIcon, HandHeartIcon, MicrophoneStageIcon, PlayIcon, type Icon } from 'phosphor-react-native'
import { agendaParts, countdown, dayMonth, doualaParis, fmtMillions, fmtPct, initials, pct, type HomeDto } from '@cepca/shared'
import { useHome, useMe } from '@/lib/queries'
import { useNow } from '@/lib/hooks'
import { ErrorState, ListRow, Loading, Photo, Progress, Screen } from '@/components/ui'
import { Txt, Overline } from '@/components/Txt'
import { color, extra } from '@/theme'

export default function Home() {
  const me = useMe()
  const home = useHome()
  const refresh = () => {
    void me.refetch()
    void home.refetch()
  }

  const name = me.data?.fullName ?? ''
  const unread = home.data?.unreadNotifications ?? me.data?.unreadNotifications ?? 0

  return (
    <Screen gap={18} refreshing={home.isRefetching} onRefresh={refresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={15} weight={700} color={color.onPrimary}>
            {name ? initials(name) : ''}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt size={12} color={color.textMuted}>
            Bonjour {name.split(' ')[0]}
          </Txt>
          <Txt serif size={24} lh={1.1} numberOfLines={1}>
            {me.data?.membership?.structure.name ?? 'CEPCA'}
          </Txt>
        </View>
        <Pressable
          onPress={() => router.push('/home/notifications')}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
          style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: extra.fieldBorder, alignItems: 'center', justifyContent: 'center' }}
        >
          <BellIcon size={20} color={color.text} />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Txt size={10} weight={800}>
                {unread > 99 ? '99+' : unread}
              </Txt>
            </View>
          ) : null}
        </Pressable>
      </View>

      {home.isPending ? (
        <Loading />
      ) : home.isError ? (
        <ErrorState error={home.error} onRetry={refresh} />
      ) : (
        <>
          {home.data.nextService ? <NextService e={home.data.nextService} /> : null}
          <QuickAccess />
          <Announcements items={home.data.announcements} />
          {home.data.featuredProject ? <FeaturedProject p={home.data.featuredProject} /> : null}
        </>
      )}
    </Screen>
  )
}

function NextService({ e }: { e: NonNullable<HomeDto['nextService']> }) {
  const now = useNow()
  const cd = countdown(e.countdownTo, now)
  const badge = e.isLive ? (cd ? `Direct ${cd}` : 'En direct') : cd
  const d = agendaParts(e.startsAt)
  return (
    <Pressable onPress={() => router.push(`/agenda/${e.id}`)} accessibilityRole="button" accessibilityLabel={`Prochain culte : ${e.title}`} style={{ height: 224, borderRadius: 26, overflow: 'hidden' }}>
      <Photo uri={e.imageUrl} style={StyleSheet.absoluteFill} />
      <LinearGradient pointerEvents="none" colors={['rgba(16,42,28,.92)', 'transparent']} locations={[0, 0.62]} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      {badge ? (
        <View style={{ position: 'absolute', left: 14, top: 14, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.deep }} />
          <Txt size={11} weight={800} upper>
            {badge}
          </Txt>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Overline color={color.accentLight} ls={0.1}>
            Prochain culte
          </Overline>
          <Txt serif size={26} lh={1.05} color={color.onPrimary}>
            {e.title}
          </Txt>
          <Txt size={12} color={color.onPrimary} style={{ marginTop: 3 }}>
            {d.wd} {d.d} {d.monthShort} · {doualaParis(e.startsAt)}
          </Txt>
        </View>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.onPrimary, alignItems: 'center', justifyContent: 'center' }}>
          <PlayIcon size={18} weight="fill" color={color.primary} />
        </View>
      </View>
    </Pressable>
  )
}

const QUICK: Array<{ icon: Icon; label: string; go: () => void; main?: boolean }> = [
  { icon: HandHeartIcon, label: 'Contribuer', go: () => router.navigate('/give'), main: true },
  { icon: MicrophoneStageIcon, label: 'Prédications', go: () => router.push('/home/sermons') },
  { icon: BuildingsIcon, label: 'Projets', go: () => router.push('/home/projects') },
  { icon: FolderSimpleIcon, label: 'Documents', go: () => router.push('/home/documents') },
]

function QuickAccess() {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {QUICK.map((q) => (
        <Pressable key={q.label} onPress={q.go} accessibilityRole="button" style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: q.main ? color.primary : color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <q.icon size={22} color={q.main ? color.onPrimary : color.primary} />
          </View>
          <Txt size={11} weight={700} align="center">
            {q.label}
          </Txt>
        </Pressable>
      ))}
    </View>
  )
}

function Announcements({ items }: { items: HomeDto['announcements'] }) {
  if (!items.length) return null
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt serif size={24}>
          Annonces
        </Txt>
        <Txt size={13} weight={700} color={color.primary} onPress={() => router.navigate('/news')} accessibilityRole="link" suppressHighlighting>
          Tout voir
        </Txt>
      </View>
      {items.map((n) => (
        <ListRow key={n.id} py={10} onPress={() => router.push(`/news/${n.id}`)} label={n.title}>
          <Photo uri={n.imageUrl} radius={16} style={{ width: 68, height: 68 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={11} weight={700} color={color.primary}>
              {n.source} · {dayMonth(n.publishedAt)}
            </Txt>
            <Txt size={14} weight={600} lh={1.3}>
              {n.title}
            </Txt>
          </View>
        </ListRow>
      ))}
    </View>
  )
}

function FeaturedProject({ p }: { p: NonNullable<HomeDto['featuredProject']> }) {
  const v = pct(p.raisedAmount, p.goalAmount)
  return (
    <Pressable
      onPress={() => router.push(`/home/projects/${p.id}`)}
      accessibilityRole="button"
      style={{ padding: 12, borderRadius: 22, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.divider, flexDirection: 'row', gap: 12, alignItems: 'center' }}
    >
      <Photo uri={p.imageUrl} radius={16} style={{ width: 76, height: 76 }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Overline color={color.textMuted} ls={0.08}>
          Projet à soutenir
        </Overline>
        <Txt size={14} weight={700}>
          {p.title}
        </Txt>
        <Progress value={v} />
        <Txt size={11} color={color.textMuted}>
          {fmtPct(v)} · {fmtMillions(p.raisedAmount)}
          {p.goalAmount ? ` / ${fmtMillions(p.goalAmount)}` : ''} FCFA
        </Txt>
      </View>
    </Pressable>
  )
}
