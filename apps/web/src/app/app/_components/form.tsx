'use client'

import type { ReactNode } from 'react'
import { Toggle, Txt, color } from './ui'

/** Champ des formulaires rapides de l'espace responsable : libellé au-dessus, aide en dessous. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="pwa-label">{label}</span>
      {children}
      {hint ? (
        <Txt as="span" size={12} color={color.textMuted} lh={1.45}>
          {hint}
        </Txt>
      ) : null}
    </label>
  )
}

/** Ligne avec interrupteur (notifier, inscriptions, direct). */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="pwa-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16 }}>
      <div style={{ flex: 1 }}>
        <Txt size={14} weight={700}>
          {label}
        </Txt>
        {hint ? (
          <Txt size={12} color={color.textMuted}>
            {hint}
          </Txt>
        ) : null}
      </div>
      <Toggle value={value} onChange={onChange} label={label} />
    </div>
  )
}

/** Date et heure saisies à Douala (UTC+1, sans heure d'été) → instant ISO. */
export function doualaIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const d = new Date(`${date}T${time}:00+01:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Date du jour à Douala, au format des champs date. */
export function todayDouala(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
