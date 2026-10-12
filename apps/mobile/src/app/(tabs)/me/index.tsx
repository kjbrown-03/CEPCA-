import { Pressable, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellIcon, CalendarCheckIcon, CaretRightIcon, FolderSimpleIcon, GlobeHemisphereWestIcon, ReceiptIcon, SignOutIcon, TranslateIcon, type Icon } from 'phosphor-react-native'
import { initials, prettyPhone, type MeDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { qk, useMe, useRegistrations } from '@/lib/queries'
import { Btn, Card, ErrorState, Loading, Screen } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

const TZ_LABEL: Record<string, string> = { 'Africa/Douala': 'Douala', 'Europe/Paris': 'Paris', 'America/Toronto': 'Toronto', 'America/New_York': 'New York' }
const TZ_CYCLE = ['Africa/Douala', 'Europe/Paris', 'America/Toronto', 'America/New_York']

const MEMBERSHIP_BADGE: Partial<Record<NonNullable<MeDto['membership']>['status'], { label: string; bg: string; fg: string }>> = {
  ACTIVE: { label: 'Rattachement validé', bg: color.primarySoft, fg: color.primary },
  PENDING: { label: 'En attente de validation', bg: color.warnBg, fg: color.warnFg },
  TO_VERIFY: { label: 'À vérifier', bg: color.warnBg, fg: color.warnFg },
  REJECTED: { label: 'Rattachement refusé', bg: color.errorBg, fg: color.errorFg },
}

export default function Me() {
  const me = useMe()
  const regs = useRegistrations()
  const { signOut } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const tz = useMutation({
    mutationFn: (timezone: string) => api<MeDto>('/me', { method: 'PATCH', body: { timezone } }),
    onSuccess: (d) => qc.setQueryData(qk.me, d),
    onError: (e) => toast(errorMessage(e), 'error'),
  })

  if (me.isPending) return <Screen><Loading /></Screen>
  if (me.isError) return <Screen><ErrorState error={me.error} onRetry={() => me.refetch()} /></Screen>
  const u = me.data
  const m = u.membership
  const badge = m ? MEMBERSHIP_BADGE[m.status] : undefined

  const menu: Array<{ icon: Icon; label: string; value?: string; go: () => void }> = [
    { icon: ReceiptIcon, label: 'Mes contributions', go: () => router.navigate('/give/history') },
    { icon: CalendarCheckIcon, label: 'Mes inscriptions', value: regs.data ? String(regs.data.length) : '', go: () => router.navigate('/agenda') },
    { icon: BellIcon, label: 'Notifications', value: u.unreadNotifications ? `${u.unreadNotifications} non lue(s)` : '', go: () => router.navigate('/home/notifications') },
    { icon: FolderSimpleIcon, label: 'Mes documents', go: () => router.navigate('/home/documents') },
    { icon: TranslateIcon, label: 'Langue', value: 'Français', go: () => toast('L’anglais arrive dans une prochaine version.') },
    {
      icon: GlobeHemisphereWestIcon,
      label: 'Fuseau horaire',
      value: TZ_LABEL[u.timezone] ?? u.timezone,
      go: () => tz.mutate(TZ_CYCLE[(TZ_CYCLE.indexOf(u.timezone) + 1) % TZ_CYCLE.length]),
    },
  ]

  return (
    <Screen gap={16} refreshing={me.isRefetching} onRefresh={() => me.refetch()}>
      <Txt serif size={34} lh={1.05} accessibilityRole="header">
        Moi
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Txt size={20} weight={700} color={color.onPrimary}>
            {initials(u.fullName)}
          </Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt size={17} weight={700}>
            {u.fullName}
          </Txt>
          <Txt size={13} color={color.textMuted}>
            {prettyPhone(u.phone)} · {u.residence === 'CAMEROON' ? 'Au Cameroun' : 'Diaspora'}
          </Txt>
        </View>
      </View>

      <Card style={{ padding: 16, borderRadius: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <Txt serif size={22}>
            Mon Église
          </Txt>
          {badge ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: badge.bg }}>
              <Txt size={11} weight={700} color={badge.fg}>
                {badge.label}
              </Txt>
            </View>
          ) : null}
        </View>
        {m && m.status !== 'REJECTED' ? (
          m.hierarchy.map((h, i) => {
            const last = i === m.hierarchy.length - 1
            return (
              <View key={h.id} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 14, alignItems: 'center' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, borderWidth: 2, borderColor: color.primary, backgroundColor: last ? color.primary : color.surface }} />
                  <View style={{ flex: 1, width: 2, backgroundColor: last ? 'transparent' : color.primarySoft2 }} />
                </View>
                <View style={{ flex: 1, paddingBottom: 10 }}>
                  <Txt size={10} weight={700} upper ls={0.08} color={color.textMuted}>
                    {h.level}
                  </Txt>
                  <Txt size={last ? 16 : 14} weight={last ? 700 : 500} lh={1.3}>
                    {h.name}
                  </Txt>
                </View>
              </View>
            )
          })
        ) : (
          <View style={{ gap: 10 }}>
            <Txt size={14} lh={1.5} color={color.textMuted}>
              {m ? 'Votre demande n’a pas été acceptée. Choisissez à nouveau votre paroisse ou contactez-la.' : 'Rattachez-vous à votre paroisse pour recevoir ses annonces et contribuer.'}
            </Txt>
            <Btn label="Choisir mon Église" height={46} size={14} onPress={() => router.push('/church')} />
          </View>
        )}
      </Card>

      <View>
        {menu.map((it) => (
          <Pressable
            key={it.label}
            onPress={it.go}
            accessibilityRole="button"
            accessibilityLabel={it.value ? `${it.label}, ${it.value}` : it.label}
            style={({ pressed }) => ({ height: 54, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: extra.divider, opacity: pressed ? 0.7 : 1 })}
          >
            <it.icon size={21} color={color.primary} />
            <Txt size={14} weight={600} style={{ flex: 1 }}>
              {it.label}
            </Txt>
            {it.value ? (
              <Txt size={13} weight={500} color={color.textMuted}>
                {it.value}
              </Txt>
            ) : null}
            <CaretRightIcon size={14} color={color.textMuted} />
          </Pressable>
        ))}
      </View>

      <Btn
        label="Se déconnecter"
        icon={SignOutIcon}
        iconWeight="regular"
        variant="danger"
        height={50}
        size={14}
        onPress={async () => {
          await signOut()
          router.replace('/welcome')
        }}
      />
    </Screen>
  )
}
