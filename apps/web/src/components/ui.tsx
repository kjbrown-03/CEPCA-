'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'

// ── Pastilles de statut : couleurs de la maquette (table ST) ──

const TONE: Record<string, 'ok' | 'warn' | 'err' | 'info' | 'pub' | 'neutral'> = {
  Actif: 'ok',
  Active: 'ok',
  Réussi: 'ok',
  Publié: 'ok',
  Achevé: 'ok',
  Validé: 'ok',
  Envoyée: 'ok',
  Exécuté: 'ok',
  'En cours': 'warn',
  'En exécution': 'warn',
  'En attente': 'warn',
  Configuration: 'warn',
  'À valider': 'warn',
  Programmée: 'warn',
  Proposé: 'warn',
  'En étude': 'warn',
  Demandé: 'warn',
  'À vérifier': 'warn',
  Suspendu: 'err',
  Annulé: 'err',
  Annulée: 'err',
  'À pourvoir': 'err',
  Échec: 'err',
  Renvoyé: 'err',
  Refusé: 'err',
  Remboursé: 'info',
  'Saisie manuelle': 'info',
  Brouillon: 'neutral',
  Archivé: 'neutral',
  Clôturé: 'neutral',
  Inactif: 'neutral',
  Idée: 'neutral',
}

export function Pill({ label, small, tone }: { label: string; small?: boolean; tone?: keyof typeof TONE_CLASS }) {
  const t = tone ?? TONE[label] ?? 'neutral'
  return <span className={`pill ${small ? 'pill-sm ' : ''}${TONE_CLASS[t]}`}>{label}</span>
}
const TONE_CLASS = { ok: 'tone-ok', warn: 'tone-warn', err: 'tone-err', info: 'tone-info', pub: 'tone-pub', neutral: '' } as const

// ── Interrupteur, puces ──

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!on)} />
}

export function ToggleRow({ title, sub, on, onChange, disabled }: { title: string; sub?: ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1 }}>
        <div className="t">{title}</div>
        {sub ? <div className="s">{sub}</div> : null}
      </div>
      <Toggle on={on} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`chip${value === o.value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Champs ──

export function Field({ label, error, hint, children }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  return (
    <div className="search">
      <MagnifyingGlass size={16} />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label ?? placeholder} />
    </div>
  )
}

// ── Titre de page ──

export function PageHead({ eyebrow, title, note, children }: { eyebrow: string; title: string; note?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="txt">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {note ? <span className="note">{note}</span> : null}
      </div>
      {children ? <div className="actions">{children}</div> : null}
    </div>
  )
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden="true" />
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={40} />
      ))}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Une erreur est survenue.'
  return (
    <div className="alert err" role="alert">
      <WarningCircle size={18} />
      <div style={{ flex: 1 }}>{msg}</div>
      {onRetry ? (
        <button type="button" className="link-danger" onClick={onRetry}>
          Réessayer
        </button>
      ) : null}
    </div>
  )
}

// ── Toast (2,4 s, en bas au centre) ──

type ToastState = { text: string; error: boolean } | null
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string, error = false) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ text, error })
    timer.current = setTimeout(() => setToast(null), error ? 4000 : 2400)
  }, [])
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {toast ? (
          <div className={`toast${toast.error ? ' err' : ''}`}>
            {toast.error ? <WarningCircle size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}
            {toast.text}
          </div>
        ) : null}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
