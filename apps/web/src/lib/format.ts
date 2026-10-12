// Libellés d'affichage propres au back-office.
import { displayName } from '@cepca/shared'

export { displayName }

/** « Bonjour, Pasteur Élise » (maquette : deux premiers mots du nom affiché). */
export function greetingName(fullName: string, title: string | null | undefined): string {
  return displayName(fullName, title).split(' ').slice(0, 2).join(' ')
}

const dt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', ...o })
const DAY_TIME = dt({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const DAY = dt({ day: 'numeric', month: 'short' })
const TIME = dt({ hour: '2-digit', minute: '2-digit' })
const YMD = dt({ year: 'numeric', month: '2-digit', day: '2-digit' })

/** « 2 oct. 10:14 » à l'heure de Douala */
export const dayTime = (iso: string) => DAY_TIME.format(new Date(iso)).replace(',', '').replace(' à ', ' ')
/** « 2 oct. » */
export const dayShort = (iso: string) => DAY.format(new Date(iso))
/** « 10:14 » */
export const timeShort = (iso: string) => TIME.format(new Date(iso))

/** Journal récent : « 09:42 » aujourd'hui, « Hier 18:04 », puis « 28 sept. » */
export function auditStamp(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const key = (x: Date) => YMD.format(x)
  if (key(d) === key(now)) return TIME.format(d)
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return `Hier ${TIME.format(d)}`
  return DAY.format(d)
}

/** Date (AAAA-MM-JJ) et heure (HH:MM) à Douala d'un instant, pour les champs de formulaire. */
export function doualaParts(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + 3600_000)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}

/** Champs de formulaire (heure de Douala, UTC+1 toute l'année) → instant ISO. */
export function fromDouala(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}:00+01:00`).toISOString()
}

/** 1 258 291 octets → « 1,2 Mo » */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

/** 2280 s → « 38 min » */
export function duration(sec: number | null | undefined): string {
  if (!sec) return '—'
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}

/** Saisie libre « 10 000 » → 10000 */
export const parseAmount = (s: string) => parseInt(s.replace(/\D/g, '') || '0', 10)
