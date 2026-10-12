import { Text, type TextProps, type TextStyle } from 'react-native'
import { color, family, type Weight } from '@/theme'

export interface TxtProps extends TextProps {
  /** Instrument Serif (titres) ; Manrope sinon */
  serif?: boolean
  italic?: boolean
  size?: number
  weight?: Weight
  color?: string
  /** Interligne en multiple de la taille */
  lh?: number
  upper?: boolean
  /** Interlettrage en em */
  ls?: number
  tabular?: boolean
  align?: TextStyle['textAlign']
}

export function Txt({ serif, italic, size = 14, weight = 400, color: c = color.text, lh, upper, ls, tabular, align, style, ...rest }: TxtProps) {
  const fontFamily = serif ? (italic ? family.serifItalic : family.serif) : family[weight]
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily,
          fontSize: size,
          color: c,
          // Instrument Serif a de grandes capitales : un interligne < 1.1 rogne les accents sur Android
          lineHeight: lh ? Math.round(size * Math.max(lh, serif ? 1.1 : lh)) : undefined,
          textTransform: upper ? 'uppercase' : undefined,
          letterSpacing: ls ? ls * size : undefined,
          fontVariant: tabular ? ['tabular-nums'] : undefined,
          textAlign: align,
        },
        style,
      ]}
    />
  )
}

/** Surtitre : Manrope 700, majuscules, interlettrage. */
export function Overline({ children, color: c = color.primary, size = 11, ls = 0.06 }: { children: React.ReactNode; color?: string; size?: number; ls?: number }) {
  return (
    <Txt size={size} weight={700} upper ls={ls} color={c}>
      {children}
    </Txt>
  )
}
