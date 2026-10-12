import { doualaParis, timeIn, type EventDto } from '@cepca/shared'

/**
 * Horaire d'une activité, comme dans l'agenda de la maquette : heures de Douala et de Paris
 * quand elle est retransmise (la diaspora la suit), plage horaire locale sinon.
 */
export function eventTime(e: Pick<EventDto, 'startsAt' | 'endsAt' | 'isLive'>): string {
  if (e.isLive) return doualaParis(e.startsAt)
  if (e.endsAt) return `${timeIn(e.startsAt)} – ${timeIn(e.endsAt)}`
  return timeIn(e.startsAt)
}
