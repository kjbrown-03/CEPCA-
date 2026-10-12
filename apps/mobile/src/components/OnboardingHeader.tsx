import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeftIcon } from 'phosphor-react-native'
import { color, extra } from '@/theme'
import { RoundButton, goBack } from './ui'

/** Retour + trois traits de progression (étapes numéro, code, Église). */
export function OnboardingHeader({ step, onBack }: { step: 1 | 2 | 3; onBack?: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: insets.top + 4, paddingHorizontal: 20 }}>
      <RoundButton label="Retour" onPress={onBack ?? (() => goBack('/welcome'))}>
        <ArrowLeftIcon size={18} weight="bold" color={color.text} />
      </RoundButton>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }} accessibilityLabel={`Étape ${step} sur 3`}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= step ? color.primary : extra.fieldBorder }} />
        ))}
      </View>
    </View>
  )
}
