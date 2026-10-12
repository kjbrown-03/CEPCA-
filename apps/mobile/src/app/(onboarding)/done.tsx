import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CheckCircleIcon } from 'phosphor-react-native'
import { useMe } from '@/lib/queries'
import { Btn } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

export default function Done() {
  const { parish = 'paroisse' } = useLocalSearchParams<{ parish?: string }>()
  const me = useMe()
  const first = me.data?.fullName.split(' ')[0] ?? ''
  return (
    <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 40, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: color.bg }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircleIcon size={44} weight="fill" color={color.primary} />
      </View>
      <Txt serif size={38} lh={1.05} align="center" accessibilityRole="header">
        Bienvenue{first ? `, ${first}` : ''}
      </Txt>
      <Txt size={15} lh={1.55} color={color.textMuted} align="center">
        Votre demande de rattachement à la {parish} a été envoyée au pasteur. Vous pouvez déjà suivre les cultes et les annonces.
      </Txt>
      <Btn label="Découvrir l'application" onPress={() => router.replace('/home')} style={{ marginTop: 10, paddingHorizontal: 32 }} />
    </View>
  )
}
