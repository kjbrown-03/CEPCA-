// Heures affichées à Douala et à Paris. Douala est à UTC+1 toute l'année ;
// Paris est à UTC+2 l'été et UTC+1 l'hiver. L'écart est donc calculé, jamais écrit en dur.

export const TZ_DOUALA = 'Africa/Douala'
export const TZ_PARIS = 'Europe/Paris'

const timeFmt = (tz: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })

/** « 10:00 » */
export function timeIn(date: Date | string, tz: string = TZ_DOUALA): string {
  return timeFmt(tz).format(new Date(date)).replace(/\s?h\s?/, ':')
}

/** « 10:00 Douala · 11:00 Paris », ou seulement l'heure de Douala si identiques et `compact` */
export function doualaParis(date: Date | string): string {
  return `${timeIn(date, TZ_DOUALA)} Douala · ${timeIn(date, TZ_PARIS)} Paris`
}

/** Écart Paris − Douala en heures à cette date (0 ou 1). */
export function parisOffsetHours(date: Date | string): number {
  const d = new Date(date)
  const h = (tz: string) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(d))
  return (h(TZ_PARIS) - h(TZ_DOUALA) + 24) % 24
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const WD_SHORT = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']

function partsIn(date: Date | string, tz = TZ_DOUALA) {
  const p = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', timeZone: tz }).formatToParts(new Date(date))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  const wdIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  return { y: Number(get('year')), m: Number(get('month')) - 1, d: Number(get('day')), wd: wdIdx }
}

/** « 30 sept. » */
export function dayMonth(date: Date | string, tz = TZ_DOUALA): string {
  const { d, m } = partsIn(date, tz)
  return `${d} ${MONTHS_SHORT[m]}`
}

/** « 27 sept. 2026 » */
export function dayMonthYear(date: Date | string, tz = TZ_DOUALA): string {
  const { d, m, y } = partsIn(date, tz)
  return `${d} ${MONTHS_SHORT[m]} ${y}`
}

/** { wd: 'Dim.', d: '4', month: 'octobre' } pour les pavés de l'agenda */
export function agendaParts(date: Date | string, tz = TZ_DOUALA) {
  const { d, m, wd, y } = partsIn(date, tz)
  return { wd: WD_SHORT[wd], d: String(d), month: MONTHS_LONG[m], monthShort: MONTHS_SHORT[m], year: y }
}

/** « Octobre 2026 » */
export function monthTitle(date: Date | string, tz = TZ_DOUALA): string {
  const { m, y } = partsIn(date, tz)
  const s = MONTHS_LONG[m]
  return s[0].toUpperCase() + s.slice(1) + ' ' + y
}

/** Libellé relatif court des notifications : « 9:00 », « Hier », « 27 sept. » */
export function relativeShort(date: Date | string, now: Date = new Date(), tz = TZ_DOUALA): string {
  const a = partsIn(date, tz)
  const b = partsIn(now, tz)
  if (a.y === b.y && a.m === b.m && a.d === b.d) return timeIn(date, tz)
  const y = partsIn(new Date(now.getTime() - 86400000), tz)
  if (a.y === y.y && a.m === y.m && a.d === y.d) return 'Hier'
  return dayMonth(date, tz)
}

/** « dans 1 h 19 » — compte à rebours du prochain culte. */
export function countdown(to: Date | string, now: Date = new Date()): string | null {
  const ms = new Date(to).getTime() - now.getTime()
  if (ms <= 0) return null
  const min = Math.floor(ms / 60000)
  const h = Math.floor(min / 60)
  const mm = min % 60
  if (h >= 48) return `dans ${Math.floor(h / 24)} j`
  if (h >= 1) return `dans ${h} h ${String(mm).padStart(2, '0')}`
  return `dans ${mm} min`
}
