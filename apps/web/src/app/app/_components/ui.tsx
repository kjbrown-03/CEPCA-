'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties, ElementType, ReactNode } from 'react'
import { ArrowLeft, CheckCircle, Circle, WarningCircle, type Icon } from '@phosphor-icons/react'
import { errorMessage } from '@/lib/api'

/** Couleurs des maquettes, en variables CSS (@cepca/tokens). */
export const color = {
  primary: 'var(--c-primary)',
  onPrimary: 'var(--c-on-primary)',
  onPrimaryMuted: 'var(--c-on-primary-muted)',
  onPrimaryMuted2: 'var(--c-on-primary-muted-2)',
  primarySoft: 'var(--c-primary-soft)',
  primarySoft2: 'var(--c-primary-soft-2)',
  accent: 'var(--c-accent)',
  accentLight: 'var(--c-accent-light)',
  deep: 'var(--c-deep)',
  sidebar: 'var(--c-sidebar)',
  sidebarHover: 'var(--c-sidebar-hover)',
  bg: 'var(--c-bg)',
  surface: 'var(--c-surface)',
  text: 'var(--c-text)',
  textMuted: 'var(--c-text-muted)',
  textMuted2: 'var(--c-text-muted-2)',
  textFaint: 'var(--c-text-faint)',
  warnBg: 'var(--c-warn-bg)',
  warnFg: 'var(--c-warn-fg)',
  errorBg: 'var(--c-error-bg)',
  errorFg: 'var(--c-error-fg)',
  infoBg: 'var(--c-info-bg)',
  infoFg: 'var(--c-info-fg)',
  momo: 'var(--c-momo)',
  orangeMoney: 'var(--c-orange-money)',
  track: 'var(--c-track)',
  divider: 'var(--c-border-green)',
  fieldBorder: 'var(--c-border-green-2)',
  rowRule: '#ece9df',
  progressOnDark: '#24452f',
} as const

type Weight = 400 | 500 | 600 | 700 | 800

/** Texte aux styles des maquettes : Instrument Serif pour les titres, Manrope sinon. */
export function Txt({
  as: Tag = 'div',
  serif,
  italic,
  size = 14,
  weight = 400,
  color: c,
  lh,
  upper,
  ls,
  tabular,
  align,
  clamp,
  style,
  className,
  children,
  id,
}: {
  as?: ElementType
  serif?: boolean
  italic?: boolean
  size?: number
  weight?: Weight
  color?: string
  lh?: number
  upper?: boolean
  ls?: number
  tabular?: boolean
  align?: CSSProperties['textAlign']
  /** Nombre de lignes avant les points de suspension */
  clamp?: number
  style?: CSSProperties
  className?: string
  children?: ReactNode
  id?: string
}) {
  return (
    <Tag
      id={id}
      className={className}
      style={{
        fontFamily: serif ? 'var(--font-serif), Georgia, serif' : undefined,
        fontStyle: italic ? 'italic' : undefined,
        fontSize: size,
        fontWeight: serif ? 400 : weight,
        color: c,
        lineHeight: lh ?? (serif ? 1.1 : 1.4),
        textTransform: upper ? 'uppercase' : undefined,
        letterSpacing: ls ? `${ls}em` : undefined,
        fontVariantNumeric: tabular ? 'tabular-nums' : undefined,
        textAlign: align,
        ...(clamp ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : null),
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

/** Surtitre : Manrope 700, majuscules, interlettrage. */
export function Overline({ children, color: c = color.primary, size = 11, ls = 0.06 }: { children: ReactNode; color?: string; size?: number; ls?: number }) {
  return (
    <Txt size={size} weight={700} upper ls={ls} color={c}>
      {children}
    </Txt>
  )
}

/** Écran défilant aux marges des maquettes (4 18 24). */
export function Screen({ children, gap = 16, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <main className="pwa-screen" style={{ gap, ...style }}>
      {children}
    </main>
  )
}

/** Retour à l'écran précédent, ou à l'écran parent si on est arrivé directement (notification, lien partagé). */
export function useGoBack() {
  const router = useRouter()
  return (fallback: string) => {
    if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back()
    else router.replace(fallback)
  }
}

export function RoundButton({ onClick, label, children, size = 40, style, href }: { onClick?: () => void; label: string; children: ReactNode; size?: number; style?: CSSProperties; href?: string }) {
  const s = { width: size, height: size, ...style }
  if (href)
    return (
      <Link href={href} className="pwa-round" aria-label={label} style={s}>
        {children}
      </Link>
    )
  return (
    <button type="button" className="pwa-round" aria-label={label} onClick={onClick} style={s}>
      {children}
    </button>
  )
}

/** En-tête des écrans de détail : retour, titre, action à droite. */
export function BackHeader({ title, fallback, right }: { title: string; fallback: string; right?: ReactNode }) {
  const back = useGoBack()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <RoundButton label="Retour" onClick={() => back(fallback)}>
        <ArrowLeft size={18} weight="bold" />
      </RoundButton>
      <Txt as="h1" size={15} weight={700} clamp={1} style={{ flex: 1 }}>
        {title}
      </Txt>
      {right}
    </div>
  )
}

export type BtnVariant = 'primary' | 'ochre' | 'outline' | 'outlineGreen' | 'light' | 'danger'

/** Bouton pilule (hauteur 44–56) ; avec `href`, c'est un lien. */
export function Btn({
  label,
  onClick,
  href,
  variant = 'primary',
  height = 56,
  size = 16,
  icon: I,
  iconWeight = 'bold',
  disabled,
  loading,
  type = 'button',
  style,
  external,
}: {
  label: string
  onClick?: () => void
  href?: string
  variant?: BtnVariant
  height?: number
  size?: number
  icon?: Icon
  iconWeight?: 'regular' | 'bold' | 'fill'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  style?: CSSProperties
  external?: boolean
}) {
  const s: CSSProperties = { height, fontSize: size, fontWeight: variant === 'outline' && size < 15 ? 600 : 700, ...style }
  const inner = (
    <>
      {loading ? <span className="pwa-spinner" style={{ width: 18, height: 18 }} aria-hidden /> : I ? <I size={size + 2} weight={iconWeight} aria-hidden /> : null}
      <span>{label}</span>
    </>
  )
  if (href && !disabled) {
    if (external)
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`pwa-btn ${variant}`} style={s}>
          {inner}
        </a>
      )
    return (
      <Link href={href} className={`pwa-btn ${variant}`} style={s}>
        {inner}
      </Link>
    )
  }
  return (
    <button type={type} className={`pwa-btn ${variant}`} style={s} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined}>
      {inner}
    </button>
  )
}

/** Puce de filtre : active = vert, inactive = surface + filet. */
export function Chip({ label, active, onClick, height = 36, weight = 600, icon: I, style }: { label: string; active: boolean; onClick: () => void; height?: number; weight?: 600 | 700; icon?: Icon; style?: CSSProperties }) {
  return (
    <button type="button" className="pwa-chip" aria-pressed={active} onClick={onClick} style={{ height, fontWeight: weight, ...style }}>
      {I ? <I size={15} aria-hidden /> : null}
      {label}
    </button>
  )
}

export function ChipRow({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  return <div className={`pwa-chips${wrap ? '' : ' nowrap'}`}>{children}</div>
}

/** Ligne de choix (paroisse, projet, opérateur) : filet de 2 px quand elle est choisie. */
export function SelectRow({ icon: I, iconFill, label, sub, selected, onClick, height = 52, left }: { icon?: Icon; iconFill?: boolean; label: string; sub?: string; selected: boolean; onClick: () => void; height?: number; left?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className="pwa-select" onClick={onClick} style={{ minHeight: height }}>
      {left ?? (I ? <I size={18} color={color.primary} weight={iconFill ? 'fill' : 'regular'} aria-hidden /> : null)}
      <span style={{ flex: 1, minWidth: 0 }}>
        <Txt as="span" size={14} weight={600} style={{ display: 'block' }}>
          {label}
        </Txt>
        {sub ? (
          <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
            {sub}
          </Txt>
        ) : null}
      </span>
      {selected ? <CheckCircle size={20} weight="fill" color={color.primary} aria-hidden /> : <Circle size={20} color={color.primary} aria-hidden />}
    </button>
  )
}

/** Interrupteur mobile 50×30. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={value} aria-label={label} className="pwa-toggle" onClick={() => onChange(!value)} />
}

export function Progress({ value, height = 6, track = color.track, fill = color.primary }: { value: number; height?: number; track?: string; fill?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} style={{ height, borderRadius: height / 2, background: track, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${v}%`, borderRadius: height / 2, background: fill }} />
    </div>
  )
}

/**
 * Les URL de fichiers renvoyées par l'API sont absolues (PUBLIC_URL). Sur le même site, on les rend
 * relatives : elles passent par le relais /api de Next et emportent le cookie de session.
 */
export function media(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.pathname.startsWith('/api/files/')) return u.pathname + u.search
  } catch {
    // déjà relative
  }
  return url
}

/** Photo distante (ou fond neutre en attendant les photos du CEPCA). */
export function Photo({ uri, radius = 0, style, alt = '' }: { uri: string | null | undefined; radius?: number; style?: CSSProperties; alt?: string }) {
  const src = media(uri)
  return (
    <div className="pwa-photo" style={{ borderRadius: radius, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- images servies par l'API, tailles libres */}
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : null}
    </div>
  )
}

/** Ligne de liste avec filet inférieur ; lien si `href`, bouton si `onClick`. */
export function ListRow({ children, href, onClick, py = 12, align = 'center', label }: { children: ReactNode; href?: string; onClick?: () => void; py?: number; align?: 'center' | 'flex-start'; label?: string }) {
  const style: CSSProperties = { alignItems: align, padding: `${py}px 0` }
  if (href)
    return (
      <Link href={href} className="pwa-row" style={style} aria-label={label}>
        {children}
      </Link>
    )
  if (onClick)
    return (
      <button type="button" className="pwa-row" style={style} onClick={onClick} aria-label={label}>
        {children}
      </button>
    )
  return (
    <div className="pwa-row" style={style}>
      {children}
    </div>
  )
}

/** Pastille ronde à icône (accès rapides, notifications, historique). */
export function IconTile({ icon: I, size = 42, radius = 14, bg = color.primarySoft, fg = color.primary, iconSize = 20, weight = 'regular' }: { icon: Icon; size?: number; radius?: number; bg?: string; fg?: string; iconSize?: number; weight?: 'regular' | 'fill' | 'bold' }) {
  return (
    <span style={{ flex: 'none', width: size, height: size, borderRadius: radius, background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <I size={iconSize} weight={weight} aria-hidden />
    </span>
  )
}

export function Card({ children, style, dark }: { children: ReactNode; style?: CSSProperties; dark?: boolean }) {
  return (
    <div className={`pwa-card${dark ? ' dark' : ''}`} style={style}>
      {children}
    </div>
  )
}

/** Récapitulatif clé / valeur (paiement, reçu). */
export function SummaryRows({ rows, py = 8, size = 14 }: { rows: Array<{ k: string; v: string; strong?: boolean; color?: string }>; py?: number; size?: number }) {
  return (
    <Card style={{ padding: '8px 18px' }}>
      <dl style={{ margin: 0 }}>
        {rows.map((r, i) => (
          <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: `${py}px 0`, boxShadow: i === rows.length - 1 ? undefined : `inset 0 -1px 0 ${color.rowRule}` }}>
            <Txt as="dt" size={size} color={color.textMuted}>
              {r.k}
            </Txt>
            <Txt as="dd" size={size} weight={r.strong ? 800 : 600} color={r.color} align="right" style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              {r.v}
            </Txt>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function Loading({ minHeight = 240 }: { minHeight?: number }) {
  return (
    <div style={{ minHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.primary }} role="status" aria-label="Chargement">
      <span className="pwa-spinner lg" />
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }} role="alert">
      <WarningCircle size={34} color={color.errorFg} aria-hidden />
      <Txt size={14} color={color.textMuted} align="center" lh={1.5}>
        {errorMessage(error)}
      </Txt>
      {onRetry ? <Btn label="Réessayer" variant="outline" height={44} size={14} onClick={onRetry} /> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <Txt size={14} color={color.textMuted} align="center" lh={1.5} style={{ padding: '30px 0' }}>
      {children}
    </Txt>
  )
}

export function FormError({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <div role="alert">
      <Txt size={13} weight={600} color={color.errorFg}>
        {text}
      </Txt>
    </div>
  )
}

/** Retour + trois traits de progression (étapes compte, code, Église). */
export function OnboardingHeader({ step, fallback = '/app/bienvenue' }: { step: 1 | 2 | 3; fallback?: string }) {
  const back = useGoBack()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <RoundButton label="Retour" onClick={() => back(fallback)}>
        <ArrowLeft size={18} weight="bold" />
      </RoundButton>
      <div style={{ flex: 1, display: 'flex', gap: 6 }} role="img" aria-label={`Étape ${step} sur 3`}>
        {[1, 2, 3].map((n) => (
          <span key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? color.primary : color.fieldBorder }} />
        ))}
      </div>
    </div>
  )
}
