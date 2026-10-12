'use client'

import { useEffect, useState } from 'react'
import { doualaParis, timeIn, type EventDto } from '@cepca/shared'
import { download } from '@/lib/api'
import { media } from '../_components/ui'

/** Heure courante, rafraîchie à intervalle (compte à rebours du prochain culte). */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/**
 * Horaire d'une activité, comme dans l'agenda de la maquette : heures de Douala et de Paris
 * quand elle est retransmise (la diaspora la suit), plage horaire locale sinon.
 */
export function eventTime(e: Pick<EventDto, 'startsAt' | 'endsAt' | 'isLive'>): string {
  if (e.isLive) return doualaParis(e.startsAt)
  if (e.endsAt) return `${timeIn(e.startsAt)} – ${timeIn(e.endsAt)}`
  return timeIn(e.startsAt)
}

/** Chemin pour le client d'API (sans le préfixe /api) d'une URL de fichier renvoyée par l'API. */
function apiPath(url: string): string {
  const rel = media(url) ?? url
  return rel.startsWith('/api/') ? rel.slice(4) : rel
}

/** Télécharge un fichier servi par l'API (document, pièce jointe, reçu) : le téléphone propose de l'ouvrir. */
export function saveFile(url: string): Promise<void> {
  return download(apiPath(url))
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c)

/** « Ajouter à mon calendrier » : un fichier .ics que l'agenda du téléphone ouvre, sans permission. */
export function addToCalendar(e: EventDto) {
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
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cepca-${e.id.replace(/[^\w-]/g, '_')}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

// ── Prédications hors ligne : gardées dans le stockage du navigateur (Cache Storage) ──

const SERMONS = 'cepca-sermons'

export async function isOffline(url: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  const c = await caches.open(SERMONS)
  return !!(await c.match(media(url) ?? url))
}

export async function saveOffline(url: string): Promise<void> {
  const rel = media(url) ?? url
  const res = await fetch(rel, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Téléchargement refusé')
  // Demande au navigateur de ne pas effacer ces fichiers quand l'espace manque
  await navigator.storage?.persist?.().catch(() => false)
  await (await caches.open(SERMONS)).put(rel, res)
}

export async function removeOffline(url: string): Promise<void> {
  await (await caches.open(SERMONS)).delete(media(url) ?? url)
}

/** Adresse de lecture : le fichier gardé sur le téléphone s'il existe, sinon le flux en ligne. */
export async function playableUrl(url: string): Promise<string> {
  const rel = media(url) ?? url
  if (typeof caches !== 'undefined') {
    const hit = await (await caches.open(SERMONS)).match(rel)
    if (hit) return URL.createObjectURL(await hit.blob())
  }
  return rel
}

export const canKeepOffline = () => typeof window !== 'undefined' && 'caches' in window
