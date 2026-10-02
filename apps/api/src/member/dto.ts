// Conversion des lignes Prisma en DTO partagés (@cepca/shared).
import type { Prisma } from '@prisma/client'
import {
  CHANNEL_LABEL,
  CONTRIBUTION_STATUS_LABEL,
  PUBLICATION_KIND_LABEL,
  dayMonth,
  type ContributionDto,
  type EventDto,
  type ProjectDto,
  type PublicationDto,
  type Scope,
  type SermonDto,
} from '@cepca/shared'
import { mediaUrl } from '../storage/storage.service'

export const structureLite = { select: { id: true, name: true, path: true, depth: true, levelType: { select: { key: true, name: true, rank: true, isMembership: true } }, confession: { select: { code: true } } } } as const
type StructureLite = Prisma.StructureGetPayload<typeof structureLite>

export function scopeOf(s: StructureLite): Scope {
  if (s.levelType.rank === 0) return 'CEPCA'
  if (s.levelType.isMembership) return 'PAROISSE'
  return 'CONFESSION'
}

/** Nom court de la source : « CEPCA », « EEC », « Paroisse de Deïdo » */
export function sourceOf(s: StructureLite): string {
  if (s.levelType.rank === 0) return 'CEPCA'
  if (s.levelType.rank === 1) return s.confession?.code ?? s.name
  return s.name
}

export const publicationInclude = { target: structureLite } as const
export function toPublication(p: Prisma.PublicationGetPayload<{ include: typeof publicationInclude }>): PublicationDto {
  return {
    id: p.id,
    kind: p.kind,
    kindLabel: PUBLICATION_KIND_LABEL[p.kind],
    scope: scopeOf(p.target),
    source: sourceOf(p.target),
    title: p.title,
    body: p.body.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean),
    imageUrl: mediaUrl('img', p.imageKey),
    attachmentUrl: p.attachmentKey ? mediaUrl('doc', p.attachmentKey) : null,
    publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
  }
}

export const eventInclude = { structure: structureLite, _count: { select: { registrations: { where: { cancelledAt: null } } } } } as const
export function toEvent(e: Prisma.EventGetPayload<{ include: typeof eventInclude }>, isRegistered: boolean): EventDto {
  const n = e._count.registrations
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    kind: e.kind,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    place: e.place,
    isLive: e.isLive,
    liveUrl: e.liveUrl,
    imageUrl: mediaUrl('img', e.imageKey),
    source: sourceOf(e.structure),
    registrationOpen: e.registrationOpen,
    capacity: e.capacity,
    registeredCount: n,
    remaining: e.capacity == null ? null : Math.max(0, e.capacity - n),
    isRegistered,
  }
}

export function toSermon(s: Prisma.SpiritualContentGetPayload<object>): SermonDto {
  return {
    id: s.id,
    title: s.title,
    speaker: s.speaker,
    scriptureRef: s.scriptureRef,
    summary: s.summary,
    mediaType: s.mediaType,
    kind: s.kind,
    durationSec: s.durationSec,
    mediaUrl: s.mediaKey ? mediaUrl('sermon', s.id) : null,
    externalUrl: s.externalUrl,
    imageUrl: mediaUrl('img', s.imageKey),
    offlineAllowed: s.offlineAllowed,
    publishedAt: (s.publishedAt ?? s.createdAt).toISOString(),
  }
}

export const projectInclude = {
  structure: { select: { name: true } },
  steps: { orderBy: { position: 'asc' } },
  updates: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' } },
} as const satisfies Prisma.ProjectInclude
export function toProject(p: Prisma.ProjectGetPayload<{ include: typeof projectInclude }>): ProjectDto {
  const end = p.endLabel ?? (p.endsAt ? new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'Africa/Douala' }).format(p.endsAt) : '')
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    description: p.description,
    location: p.location,
    goalAmount: p.goalAmount,
    raisedAmount: p.raisedAmount,
    contributorCount: p.contributorCount,
    endLabel: end,
    imageUrl: mediaUrl('img', p.imageKey),
    collectOpen: p.collectOpen,
    status: p.status,
    structure: p.structure.name,
    steps: p.steps.map((s) => ({ label: s.label, done: s.done })),
    // Ordre chronologique, comme la maquette (plus ancien en haut)
    updates: [...p.updates].reverse().map((u) => ({ date: dayMonth(u.createdAt), title: u.title })),
  }
}

export const contributionInclude = {
  type: { select: { key: true, label: true } },
  structure: { select: { name: true } },
  project: { select: { title: true } },
  transactions: { orderBy: { requestedAt: 'desc' }, take: 1, select: { providerRef: true, failureReason: true } },
} as const satisfies Prisma.ContributionInclude
export function toContribution(c: Prisma.ContributionGetPayload<{ include: typeof contributionInclude }>): ContributionDto {
  const tx = c.transactions[0]
  return {
    id: c.id,
    reference: c.receiptNumber ?? tx?.providerRef ?? c.id.slice(-10).toUpperCase(),
    receiptNumber: c.receiptNumber,
    type: c.type.label,
    typeKey: c.type.key,
    destination: c.project?.title ?? c.structure.name,
    amount: c.amount,
    fee: c.fee,
    totalCharged: c.totalCharged,
    channel: c.channel,
    channelLabel: CHANNEL_LABEL[c.channel] ?? c.channel,
    status: c.status,
    statusLabel: CONTRIBUTION_STATUS_LABEL[c.status],
    recurring: !!c.recurringPlanId,
    createdAt: c.createdAt.toISOString(),
    confirmedAt: c.confirmedAt?.toISOString() ?? null,
    failureReason: c.statusReason ?? tx?.failureReason ?? null,
  }
}
