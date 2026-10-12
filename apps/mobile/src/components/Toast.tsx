import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircleIcon, WarningCircleIcon } from 'phosphor-react-native'
import { component, shadow } from '@cepca/tokens'
import { color } from '@/theme'
import { Txt } from './Txt'

type Tone = 'ok' | 'error'
const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {})

export const useToast = () => useContext(Ctx)

/** Toast en bas au centre, vert très foncé, icône ocre, disparaît après 2,4 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: Tone; n: number } | null>(null)
  const opacity = useRef(new Animated.Value(0)).current
  const insets = useSafeAreaInsets()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string, tone: Tone = 'ok') => setMsg((m) => ({ text, tone, n: (m?.n ?? 0) + 1 })), [])

  useEffect(() => {
    if (!msg) return
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null))
    }, component.toast.durationMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [msg, opacity])

  const I = msg?.tone === 'error' ? WarningCircleIcon : CheckCircleIcon
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 96, alignItems: 'center', paddingHorizontal: 24 }}>
          <Animated.View
            accessibilityLiveRegion="polite"
            style={{ opacity, backgroundColor: color.deep, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: shadow.toast }}
          >
            <I size={18} weight="fill" color={color.accent} />
            <Txt size={14} weight={600} color={color.onPrimary} style={{ flexShrink: 1 }}>
              {msg.text}
            </Txt>
          </Animated.View>
        </View>
      ) : null}
    </Ctx.Provider>
  )
}
