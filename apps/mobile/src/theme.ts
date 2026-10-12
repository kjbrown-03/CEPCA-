import { color, layout, radius } from '@cepca/tokens'

export { color, layout, radius }

/** Familles chargées par useFonts : une famille par graisse (React Native n'en synthétise pas). */
export const family = {
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
} as const

export type Weight = 400 | 500 | 600 | 700 | 800

/** Couleurs des maquettes qui n'ont pas de jeton dédié. */
export const extra = {
  divider: '#dde3d8', // filet sous les lignes de liste
  fieldBorder: '#d6dfd3',
  rowRule: '#ece9df', // filet des récapitulatifs
  progressOnDark: '#24452f',
} as const

export const PAD = layout.mobileMargin // 18
