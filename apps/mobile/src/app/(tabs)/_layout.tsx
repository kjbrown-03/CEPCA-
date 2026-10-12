import { Pressable, View } from 'react-native'
import { Redirect, Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarBlankIcon, HandHeartIcon, HouseIcon, NewspaperIcon, UserIcon, type Icon } from 'phosphor-react-native'
import { useAuth } from '@/lib/auth'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

const TABS: Record<string, { label: string; icon: Icon }> = {
  home: { label: 'Accueil', icon: HouseIcon },
  news: { label: 'Actualités', icon: NewspaperIcon },
  give: { label: 'Contribuer', icon: HandHeartIcon },
  agenda: { label: 'Agenda', icon: CalendarBlankIcon },
  me: { label: 'Moi', icon: UserIcon },
}

export default function TabsLayout() {
  const { status } = useAuth()
  if (status === 'signedOut') return <Redirect href="/welcome" />
  return (
    <Tabs
      // Changer d'onglet le remet à son premier écran, comme dans la maquette
      screenOptions={{ headerShown: false, popToTopOnBlur: true, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={({ state, navigation }) => <TabBar routes={state.routes.map((r) => ({ key: r.key, name: r.name }))} index={state.index} onPress={(name, key, focused) => {
        const e = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true })
        if (!focused && !e.defaultPrevented) navigation.navigate(name)
      }} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="news" />
      <Tabs.Screen name="give" />
      <Tabs.Screen name="agenda" />
      <Tabs.Screen name="me" />
    </Tabs>
  )
}

/** Barre d'onglets : 5 onglets, hauteur 80, actif vert + icône pleine. */
function TabBar({ routes, index, onPress }: { routes: Array<{ key: string; name: string }>; index: number; onPress: (name: string, key: string, focused: boolean) => void }) {
  const insets = useSafeAreaInsets()
  const bottom = Math.max(18, insets.bottom)
  return (
    <View style={{ height: 62 + bottom, paddingTop: 6, paddingBottom: bottom, paddingHorizontal: 8, flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: extra.divider }} accessibilityRole="tablist">
      {routes.map((r, i) => {
        const t = TABS[r.name]
        if (!t) return null
        const on = i === index
        const I = t.icon
        return (
          <Pressable key={r.key} onPress={() => onPress(r.name, r.key, on)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            <I size={24} weight={on ? 'fill' : 'regular'} color={on ? color.primary : color.textFaint} />
            <Txt size={10} weight={on ? 700 : 500} color={on ? color.primary : color.textFaint}>
              {t.label}
            </Txt>
          </Pressable>
        )
      })}
    </View>
  )
}
