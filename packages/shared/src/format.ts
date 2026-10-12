// Formatage partagé par l'API (reçus, rapports), le web et le mobile.

/** Parité fixe du franc CFA (accord de change) : 1 € = 655,957 FCFA. */
export const XAF_PER_EUR = 655.957

const NBSP = ' ' // espace fine insécable, séparateur de milliers fr-FR

/** 25000 → « 25 000 » */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('fr-FR').replace(/\s/g, NBSP)
}

/** 25000 → « 25 000 FCFA » */
export function fmtFcfa(n: number): string {
  return `${fmtInt(n)} FCFA`
}

/** 25000000 → « 25 M », 5280000 → « 5,28 M », 25000 → « 25 000 » */
export function fmtMillions(n: number): string {
  if (n >= 1e6) return String(Math.round(n / 1e4) / 100).replace('.', ',') + ' M'
  return fmtInt(n)
}

/** 25000 → « 38,11 » */
export function fcfaToEur(n: number): string {
  return (n / XAF_PER_EUR).toFixed(2).replace('.', ',')
}

/** 62.5 → « 62,5 % » */
export function fmtPct(p: number, digits = 1): string {
  const f = 10 ** digits
  return String(Math.round(p * f) / f).replace('.', ',') + ' %'
}

export function pct(raised: number, goal: number | null | undefined): number {
  if (!goal || goal <= 0) return 0
  return Math.min(100, (raised / goal) * 100)
}

/** Frais opérateur affichés avant paiement (README : 1,5 %). */
export const OPERATOR_FEE_RATE = 0.015
export function operatorFee(amount: number, rate = OPERATOR_FEE_RATE): number {
  return Math.round(amount * rate)
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Masque un numéro pour l'affichage et le journal : +237 6•• •• 34 42 */
export function maskPhone(e164: string): string {
  const d = e164.replace(/\D/g, '')
  if (d.length < 6) return '••••'
  return `+${d.slice(0, 3)} ${d.slice(3, 4)}•• •• ${d.slice(-4, -2)} ${d.slice(-2)}`
}

/** Masque une adresse pour l'affichage et le journal : el•••@example.org */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '•••'
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`
}

/** +237677123442 → « +237 6 77 12 34 42 » */
export function prettyPhone(e164: string): string {
  const m = /^\+(237|33|1)(\d+)$/.exec(e164)
  if (!m) return e164
  const [, cc, rest] = m
  if (cc === '237' && rest.length === 9) return `+237 ${rest[0]} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7)}`
  if (cc === '33' && rest.length === 9) return `+33 ${rest[0]} ${rest.slice(1, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7)}`
  return `+${cc} ${rest}`
}

const HONORIFICS = ['Pasteur', 'Pasteure', 'Rév.', 'Révérend', 'Ancien', 'Ancienne', 'Rt Rev.', 'Rev.', 'Diacre', 'Évangéliste']

/**
 * « Pasteur Élise Moukoko » : le titre d'un mandat n'est repris devant le nom que s'il s'agit d'un titre
 * d'adresse (« Rév., administrateur EEC » → « Rév. Joseph Ekwalla » ; « Trésorière » → « Grâce Ndjock »).
 */
export function displayName(fullName: string, title?: string | null): string {
  const h = title?.split(',')[0].trim()
  return h && HONORIFICS.includes(h) ? `${h} ${fullName}` : fullName
}
