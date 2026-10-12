import { Stack } from 'expo-router'
import { color } from '@/theme'

// Arrivée directe sur un détail (notification, autre onglet) : le retour ramène à la liste
export const unstable_settings = { initialRouteName: 'index' }

export default function TabStack() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }} />
}
