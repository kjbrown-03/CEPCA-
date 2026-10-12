import { File, Paths } from 'expo-file-system'
import type { EventDto } from '@cepca/shared'

// « Ajouter à mon calendrier » : un fichier .ics ouvert par l'agenda du téléphone.
// (expo-calendar n'est pas disponible dans Expo Go ; le .ics marche partout sans permission.)

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c)

export function eventIcs(e: EventDto): File {
  const start = new Date(e.startsAt)
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 2 * 3600 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CEPCA//Application des fideles//FR',
    'BEGIN:VEVENT',
    `UID:${e.id}@cepca`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `LOCATION:${esc(e.place)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.liveUrl ? [`URL:${e.liveUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const f = new File(Paths.cache, `cepca-${e.id.replace(/[^\w-]/g, '_')}.ics`)
  if (f.exists) f.delete()
  f.create()
  f.write(lines.join('\r\n'))
  return f
}
