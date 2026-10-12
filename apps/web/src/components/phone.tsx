'use client'

const COUNTRIES = [
  { cc: '+237', label: 'Cameroun +237' },
  { cc: '+33', label: 'France +33' },
  { cc: '+1', label: 'Canada / É.-U. +1' },
] as const

export interface PhoneValue {
  cc: string
  number: string
}

export const emptyPhone: PhoneValue = { cc: '+237', number: '' }

/** « 6 77 12 34 42 » → « +237677123442 » ; null si trop court. */
export function toE164(v: PhoneValue): string | null {
  const digits = v.number.replace(/\D/g, '').replace(/^0+/, '')
  return digits.length >= 8 ? `${v.cc}${digits}` : null
}

export function PhoneField({ value, onChange, id, invalid, autoFocus }: { value: PhoneValue; onChange: (v: PhoneValue) => void; id?: string; invalid?: boolean; autoFocus?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 8 }}>
      <select className="select" aria-label="Indicatif du pays" value={value.cc} onChange={(e) => onChange({ ...value, cc: e.target.value })}>
        {COUNTRIES.map((c) => (
          <option key={c.cc} value={c.cc}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={value.cc === '+237' ? '6 77 12 34 42' : value.cc === '+33' ? '6 12 45 78 90' : '514 555 0123'}
        value={value.number}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
        onChange={(e) => onChange({ ...value, number: e.target.value.replace(/[^\d\s]/g, '') })}
      />
    </div>
  )
}
