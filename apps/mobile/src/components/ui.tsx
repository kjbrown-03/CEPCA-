import { useEffect, useRef, type ReactNode } from 'react'
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, type Href } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeftIcon, CheckCircleIcon, CircleIcon, WarningCircleIcon, type Icon } from 'phosphor-react-native'
import { color, extra, PAD } from '@/theme'
import { media } from '@/lib/config'
import { errorMessage } from '@/lib/api'
import { Txt } from './Txt'

/** Écran défilant aux marges des maquettes (4 18 24), sous la barre d'état. */
export function Screen({
  children,
  gap = 16,
  bottom = 24,
  refreshing,
  onRefresh,
  scroll = true,
  style,
}: {
  children: ReactNode
  gap?: number
  bottom?: number
  refreshing?: boolean
  onRefresh?: () => void
  scroll?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const insets = useSafeAreaInsets()
  const pad = { paddingTop: insets.top + 4, paddingHorizontal: PAD, paddingBottom: bottom, gap }
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: color.bg }, pad, style]}>{children}</View>
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={[pad, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.primary} colors={[color.primary]} /> : undefined}
    >
      {children}
    </ScrollView>
  )
}

/** Retour à l'écran précédent, ou à l'écran parent si on est arrivé directement (notification). */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}

export function RoundButton({ onPress, label, children, size = 40, style }: { onPress: () => void; label: string; children: ReactNode; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: extra.fieldBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }, style]}
    >
      {children}
    </Pressable>
  )
}

/** En-tête des écrans de détail : retour, titre, action à droite. */
export function BackHeader({ title, fallback, right }: { title: string; fallback: Href; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <RoundButton label="Retour" onPress={() => goBack(fallback)}>
        <ArrowLeftIcon size={18} weight="bold" color={color.text} />
      </RoundButton>
      <Txt size={15} weight={700} style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Txt>
      {right}
    </View>
  )
}

type BtnVariant = 'primary' | 'ochre' | 'outline' | 'outlineGreen' | 'light' | 'danger'

const BTN: Record<BtnVariant, { bg: string; fg: string; border?: string; bw?: number }> = {
  primary: { bg: color.primary, fg: color.onPrimary },
  ochre: { bg: color.accent, fg: color.deep },
  outline: { bg: 'transparent', fg: color.text, border: extra.fieldBorder, bw: 1 },
  outlineGreen: { bg: 'transparent', fg: color.primary, border: color.primary, bw: 1.5 },
  light: { bg: 'transparent', fg: color.onPrimary, border: 'rgba(244,239,230,.7)', bw: 1.5 },
  danger: { bg: 'transparent', fg: color.errorFg, border: extra.fieldBorder, bw: 1 },
}

/** Bouton pilule (hauteur 44–56). */
export function Btn({
  label,
  onPress,
  variant = 'primary',
  height = 56,
  size = 16,
  icon: I,
  iconWeight = 'bold',
  disabled,
  loading,
  style,
}: {
  label: string
  onPress?: () => void
  variant?: BtnVariant
  height?: number
  size?: number
  icon?: Icon
  iconWeight?: 'regular' | 'bold' | 'fill'
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const v = BTN[variant]
  const off = disabled || loading
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        { height, borderRadius: 999, backgroundColor: v.bg, borderWidth: v.bw ?? 0, borderColor: v.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
        { opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : I ? <I size={size + 2} weight={iconWeight} color={v.fg} /> : null}
      <Txt size={size} weight={variant === 'outline' && size < 15 ? 600 : 700} color={v.fg}>
        {label}
      </Txt>
    </Pressable>
  )
}

/** Puce de filtre : active = vert, inactive = surface + filet. */
export function Chip({ label, active, onPress, height = 36, weight = 600, icon: I, style }: { label: string; active: boolean; onPress: () => void; height?: number; weight?: 600 | 700; icon?: Icon; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        { height, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
        { backgroundColor: active ? color.primary : color.surface, borderColor: active ? color.primary : extra.fieldBorder },
        style,
      ]}
    >
      {I ? <I size={15} color={active ? color.onPrimary : color.text} /> : null}
      <Txt size={13} weight={weight} color={active ? color.onPrimary : color.text}>
        {label}
      </Txt>
    </Pressable>
  )
}

export function ChipRow({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: 6, flexWrap: wrap ? 'wrap' : 'nowrap' }}>{children}</View>
}

/** Ligne de choix (paroisse, projet, opérateur) : filet de 2 px quand elle est choisie. */
export function SelectRow({ icon: I, iconFill, label, sub, selected, onPress, height = 52, left }: { icon?: Icon; iconFill?: boolean; label: string; sub?: string; selected: boolean; onPress: () => void; height?: number; left?: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={{ minHeight: height, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: color.surface, borderWidth: selected ? 2 : 1, borderColor: color.primary, flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      {left ?? (I ? <I size={18} color={color.primary} weight={iconFill ? 'fill' : 'regular'} /> : null)}
      <View style={{ flex: 1 }}>
        <Txt size={14} weight={600}>
          {label}
        </Txt>
        {sub ? (
          <Txt size={12} color={color.textMuted}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {selected ? <CheckCircleIcon size={20} weight="fill" color={color.primary} /> : <CircleIcon size={20} color={color.primary} />}
    </Pressable>
  )
}

/** Interrupteur mobile 50×30. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const x = useRef(new Animated.Value(value ? 23 : 3)).current
  useEffect(() => {
    Animated.timing(x, { toValue: value ? 23 : 3, duration: 200, useNativeDriver: false }).start()
  }, [value, x])
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} hitSlop={6}>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? color.primary : color.toggleOff }}>
        <Animated.View style={{ position: 'absolute', top: 3, left: x, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  )
}

export function Progress({ value, height = 6, track = color.track, fill = color.primary }: { value: number; height?: number; track?: string; fill?: string }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, value))}%`, borderRadius: height / 2, backgroundColor: fill }} />
    </View>
  )
}

/** Photo distante (ou fond neutre en attendant les photos du CEPCA). */
export function Photo({ uri, radius = 0, style }: { uri: string | null | undefined; radius?: number; style?: StyleProp<ViewStyle> }) {
  const src = media(uri)
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: extra.divider }, style]}>
      {src ? <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" /> : null}
    </View>
  )
}

/** Ligne de liste avec filet inférieur (0 1px 0 #dde3d8). */
export function ListRow({ children, onPress, py = 12, align = 'center', label }: { children: ReactNode; onPress?: () => void; py?: number; align?: 'center' | 'flex-start'; label?: string }) {
  const style = { flexDirection: 'row' as const, alignItems: align, gap: 12, paddingVertical: py, borderBottomWidth: 1, borderBottomColor: extra.divider }
  if (!onPress) return <View style={style}>{children}</View>
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  )
}

/** Pastille ronde à icône (accès rapides, notifications, historique). */
export function IconTile({ icon: I, size = 42, radius = 14, bg = color.primarySoft, fg = color.primary, iconSize = 20, weight = 'regular' }: { icon: Icon; size?: number; radius?: number; bg?: string; fg?: string; iconSize?: number; weight?: 'regular' | 'fill' | 'bold' }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <I size={iconSize} color={fg} weight={weight} />
    </View>
  )
}

export function Card({ children, style, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return <View style={[dark ? { backgroundColor: color.sidebar } : { backgroundColor: color.surface, borderWidth: 1, borderColor: extra.divider }, { borderRadius: 20 }, style]}>{children}</View>
}

/** Récapitulatif clé / valeur (paiement, reçu). */
export function SummaryRows({ rows, py = 8, size = 14 }: { rows: Array<{ k: string; v: string; strong?: boolean; color?: string }>; py?: number; size?: number }) {
  return (
    <Card style={{ paddingVertical: 8, paddingHorizontal: 18 }}>
      {rows.map((r, i) => (
        <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: py, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: extra.rowRule }}>
          <Txt size={size} color={color.textMuted}>
            {r.k}
          </Txt>
          <Txt size={size} weight={r.strong ? 800 : 600} color={r.color} align="right" style={{ flexShrink: 1 }}>
            {r.v}
          </Txt>
        </View>
      ))}
    </Card>
  )
}

export function Loading({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <View style={{ minHeight, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={color.primary} size="large" />
    </View>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 40, alignItems: 'center', gap: 12 }}>
      <WarningCircleIcon size={34} color={color.errorFg} />
      <Txt size={14} color={color.textMuted} align="center" lh={1.5}>
        {errorMessage(error)}
      </Txt>
      {onRetry ? <Btn label="Réessayer" variant="outline" height={44} size={14} onPress={onRetry} /> : null}
    </View>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ paddingVertical: 30 }}>
      <Txt size={14} color={color.textMuted} align="center" lh={1.5}>
        {children}
      </Txt>
    </View>
  )
}

/** Champ de saisie aux couleurs des maquettes (52 px, rayon 14, filet #d6dfd3). */
export const fieldStyle = {
  height: 52,
  borderRadius: 14,
  backgroundColor: color.surface,
  borderWidth: 1,
  borderColor: extra.fieldBorder,
  paddingHorizontal: 16,
  fontSize: 15,
  color: color.text,
} as const
