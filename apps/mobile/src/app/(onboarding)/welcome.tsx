import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { CrossIcon } from 'phosphor-react-native'
import { Btn } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

// Photo d'illustration (Unsplash, Danique Godwin) en attendant les photos du CEPCA
const PHOTO = 'https://images.unsplash.com/photo-1604072366376-63d46248927e?auto=format&fit=crop&w=900&q=80'

export default function Welcome() {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flex: 1, backgroundColor: color.deep, justifyContent: 'flex-end' }}>
      <StatusBar style="light" />
      <Image source={PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(16,42,28,.97)', 'rgba(16,42,28,.25)', 'transparent']}
        locations={[0.34, 0.72, 1]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingHorizontal: 26, paddingBottom: insets.bottom + 40, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
            <CrossIcon size={18} color={color.onPrimary} />
          </View>
          <Txt serif size={26} color={color.onPrimary}>
            CEPCA
          </Txt>
        </View>
        <Txt serif size={44} lh={1.05} color={color.onPrimary} accessibilityRole="header">
          Votre Église,{' '}
          <Txt serif italic size={44} color={color.accentLight}>
            où que vous soyez.
          </Txt>
        </Txt>
        <Txt size={15} lh={1.55} color={color.onPrimaryMuted2}>
          Cultes en direct, annonces de votre paroisse et contributions par Mobile Money, au Cameroun comme dans la diaspora.
        </Txt>
        <Btn label="Créer mon compte" variant="ochre" onPress={() => router.push('/account')} />
        <Btn label="J'ai déjà un compte" variant="light" onPress={() => router.push({ pathname: '/account', params: { mode: 'login' } })} />
      </View>
    </View>
  )
}
