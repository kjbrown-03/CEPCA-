'use client'

import { useRef } from 'react'

/** Six cases ; un collage de « 123456 » remplit tout. */
export function CodeInput({ value, onChange, invalid, length = 6 }: { value: string; onChange: (v: string) => void; invalid?: boolean; length?: number }) {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? '')
  const set = (i: number, d: string) => {
    const next = digits.slice()
    next[i] = d
    onChange(next.join('').replace(/\D/g, '').slice(0, length))
  }
  return (
    <div className="otp" role="group" aria-label={`Code à ${length} chiffres`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="input"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Chiffre ${i + 1}`}
          aria-invalid={invalid || undefined}
          // Pas de maxLength : le collage du code reçu par e-mail insère les 6 chiffres dans la première case
          value={d}
          autoFocus={i === 0}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            // Frappe dans une case déjà remplie : le nouveau chiffre remplace l'ancien
            if (v.length === 2 && d) {
              set(i, v[0] === d ? v[1] : v[0])
              if (i < length - 1) refs.current[i + 1]?.focus()
              return
            }
            // Collage ou remplissage automatique : les chiffres se répartissent à partir de cette case
            if (v.length > 1) {
              const merged = (value.slice(0, i) + v).slice(0, length)
              onChange(merged)
              refs.current[Math.min(merged.length, length) - 1]?.focus()
              return
            }
            set(i, v)
            if (v && i < length - 1) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) refs.current[i - 1]?.focus()
          }}
          onPaste={(e) => {
            const v = e.clipboardData.getData('text').replace(/\D/g, '')
            if (v) {
              e.preventDefault()
              onChange(v.slice(0, length))
              refs.current[Math.min(v.length, length) - 1]?.focus()
            }
          }}
        />
      ))}
    </div>
  )
}
