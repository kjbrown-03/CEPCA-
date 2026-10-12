// Périodes comptables à l'heure de Douala (UTC+1 toute l'année, sans heure d'été).

const OFFSET_MS = 3600 * 1000
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Début du mois (1-12) à Douala, en UTC. month peut déborder (13 → janvier suivant). */
export function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - OFFSET_MS)
}

export function monthRange(year: number, month: number) {
  return { from: monthStart(year, month), to: monthStart(year, month + 1) }
}

/** Année et mois à Douala d'un instant. */
export function doualaYm(d: Date): { year: number; month: number } {
  const x = new Date(d.getTime() + OFFSET_MS)
  return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 }
}

/** « 2026-09 », « 2026-Q3 », « 2026 » → bornes [from, to[ et libellé. */
export function parsePeriod(period: string): { from: Date; to: Date; label: string } {
  const [y, rest] = period.split('-')
  const year = Number(y)
  if (!rest) return { from: monthStart(year, 1), to: monthStart(year + 1, 1), label: `Année ${year}` }
  if (rest.startsWith('Q')) {
    const q = Number(rest.slice(1))
    return { from: monthStart(year, (q - 1) * 3 + 1), to: monthStart(year, q * 3 + 1), label: `${q === 1 ? '1er' : `${q}e`} trimestre ${year}` }
  }
  const m = Number(rest)
  const label = `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${year}`
  return { ...monthRange(year, m), label }
}

/** Les n derniers mois (le mois en cours compris), du plus ancien au plus récent. */
export function lastMonths(n: number, now = new Date()) {
  const { year, month } = doualaYm(now)
  return Array.from({ length: n }, (_, i) => {
    const m = month - (n - 1 - i)
    const d = new Date(Date.UTC(year, m - 1, 1))
    const ym = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
    return { ...ym, ...monthRange(ym.year, ym.month), label: SHORT[ym.month - 1] }
  })
}

export function monthLabel(month: number) {
  return MONTHS[month - 1]
}
