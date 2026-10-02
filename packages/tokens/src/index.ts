// Design tokens CEPCA Digital, repris à l'identique du README de handoff.
// Trois couches : primitives (valeurs brutes) → sémantiques (rôle) → composants.
// Les écrans n'utilisent que les couches sémantique et composant.

export const primitive = {
  green700: '#1f5a36',
  green750: '#164429',
  green800: '#133524',
  green900: '#102a1c',
  green780: '#1d4a33',
  green100: '#e3eee5',
  green200: '#c9dccd',
  cream: '#f4efe6',
  card: '#fbf8f2',
  paper: '#fffdf8',
  rule1: '#d9d2c2',
  rule2: '#e6dfd0',
  rule3: '#ece6d9',
  rule4: '#dde3d8',
  rule5: '#d6dfd3',
  ink: '#1c2a21',
  ink2: '#55665a',
  ink3: '#33443a',
  ink4: '#7a877e',
  onGreen: '#f4efe6',
  onGreen2: '#a9c4b2',
  onGreen3: '#d6e6db',
  ochre: '#e0a043',
  ochreText: '#9a6414',
  ochreLight: '#f2c77a',
  warnBg: '#f6ead2',
  warnFg: '#8a5a10',
  errBg: '#f3dcdc',
  errFg: '#8a2330',
  infoBg: '#e1e8f0',
  infoFg: '#2b4a6b',
  pubBg: '#e8e3f1',
  pubFg: '#4b3a7a',
  momo: '#ffcb05',
  orange: '#ff7900',
  toggleOff: '#c9d3c8',
  track: '#e3e8df',
  darkBg: '#0e1f15',
  darkSurface: '#15291c',
  darkText: '#f1ece2',
} as const

export const color = {
  primary: primitive.green700,
  primaryHover: primitive.green750,
  sidebar: primitive.green800,
  deep: primitive.green900,
  sidebarHover: primitive.green780,
  primarySoft: primitive.green100,
  primarySoft2: primitive.green200,
  bg: primitive.cream,
  surface: primitive.card,
  paper: primitive.paper,
  border: primitive.rule1,
  borderCard: primitive.rule2,
  borderSoft: primitive.rule3,
  borderGreen: primitive.rule4,
  borderGreen2: primitive.rule5,
  text: primitive.ink,
  textMuted: primitive.ink2,
  textMuted2: primitive.ink3,
  textFaint: primitive.ink4,
  onPrimary: primitive.onGreen,
  onPrimaryMuted: primitive.onGreen2,
  onPrimaryMuted2: primitive.onGreen3,
  accent: primitive.ochre,
  accentText: primitive.ochreText,
  accentLight: primitive.ochreLight,
  warnBg: primitive.warnBg,
  warnFg: primitive.warnFg,
  errorBg: primitive.errBg,
  errorFg: primitive.errFg,
  infoBg: primitive.infoBg,
  infoFg: primitive.infoFg,
  pubBg: primitive.pubBg,
  pubFg: primitive.pubFg,
  draftBg: primitive.rule3,
  draftFg: primitive.ink2,
  momo: primitive.momo,
  orangeMoney: primitive.orange,
  toggleOff: primitive.toggleOff,
  track: primitive.track,
  darkBg: primitive.darkBg,
  darkSurface: primitive.darkSurface,
  darkText: primitive.darkText,
} as const

export const font = {
  serif: 'Instrument Serif',
  sans: 'Manrope',
} as const

// Tailles en px
export const fontSize = {
  hero: 92,
  display1: 64,
  display2: 54,
  display3: 44,
  h1: 34,
  h2: 30,
  h3: 26,
  h4: 24,
  h5: 22,
  lead: 19,
  body: 16,
  body2: 15,
  sm: 14,
  xs: 13,
  xxs: 12,
  micro: 11,
  nano: 10,
} as const

export const space = { 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 4.5: 18, 5: 20, 6: 24, 7: 28, 9: 36 } as const

export const radius = {
  pill: 999,
  card: 20,
  cardLg: 22,
  field: 14,
  fieldSm: 12,
  fieldLg: 16,
  block: 10,
  blockSm: 8,
  photo: 16,
  photoLg: 26,
} as const

export const layout = {
  backOfficeMargin: 36,
  mobileMargin: 18,
  mobileMarginLg: 20,
  portalMargin: 32,
  portalMax: 1320,
  tabBarHeight: 80,
} as const

export const shadow = {
  cardInset: `inset 0 0 0 1px ${primitive.rule2}`,
  toast: '0 12px 30px rgba(16,42,28,.35)',
} as const

// Composants : valeurs fixées par le README (§ Composants récurrents)
export const component = {
  button: { heightSm: 44, height: 52, heightLg: 56, bg: color.primary, fg: color.onPrimary, weight: 700 },
  chip: { height: 36, activeBg: color.primary, activeFg: color.onPrimary, idleBg: color.surface, idleBorder: color.border },
  toggle: { w: 48, h: 28, wMobile: 50, hMobile: 30, knob: 22, on: color.primary, off: color.toggleOff },
  progress: { h: 6, hLg: 8, track: color.track, fill: color.primary, fillOnDark: color.accent },
  toast: { bg: color.deep, icon: color.accent, durationMs: 2400 },
} as const

export type StatusTone = 'success' | 'warn' | 'error' | 'draft' | 'info' | 'pub' | 'neutral'

export const statusTone: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: color.primarySoft, fg: color.primary },
  warn: { bg: color.warnBg, fg: color.warnFg },
  error: { bg: color.errorBg, fg: color.errorFg },
  draft: { bg: color.draftBg, fg: color.draftFg },
  info: { bg: color.infoBg, fg: color.infoFg },
  pub: { bg: color.pubBg, fg: color.pubFg },
  neutral: { bg: color.borderSoft, fg: color.textMuted2 },
}

export const tokens = { primitive, color, font, fontSize, space, radius, layout, shadow, component, statusTone }
export default tokens
