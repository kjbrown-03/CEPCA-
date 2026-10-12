// Formes des réponses du back-office qui ne sont pas déclarées dans @cepca/shared.
export type { AdminMeDto, AdminSeat, AdminUserDto, DashboardDto, QueueItemDto, ReportDto, RoleMatrixDto, StructureNodeDto, ModuleKey } from '@cepca/shared'

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface StructureDetail {
  id: string
  name: string
  code: string
  level: string
  status: string
  parent: { id: string; name: string } | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  serviceSchedule: string | null
  timezone: string
  children: number
  members: number
  pendingMembers: number
  leaders: Array<{ assignmentId: string; role: string; title: string | null; userId: string; name: string; endsAt: string | null }>
  canEdit: boolean
}

export interface PublicationDto {
  id: string
  title: string
  kind: 'ACTUALITE' | 'ANNONCE' | 'COMMUNIQUE' | 'ALERTE'
  kindLabel: string
  body: string
  status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'PUBLISHED' | 'ARCHIVED'
  statusLabel: string
  target: { id: string; name: string }
  group: { id: string; name: string } | null
  audience: string
  notify: boolean
  isPublic: boolean
  imageKey: string | null
  imageUrl: string | null
  author: { id: string; fullName: string }
  validatedBy: string | null
  returnNote: string | null
  readCount: number
  publishedAt: string | null
  updatedAt: string
  can: { edit: boolean; submit: boolean; publish: boolean; return: boolean; archive: boolean }
  recipients?: number
  notified?: number
}

export interface Audiences {
  structure: { id: string; name: string }
  all: number
  groups: Array<{ id: string; name: string; structure: string; recipients: number }>
}

export interface EventDto {
  id: string
  title: string
  kind: string
  description: string | null
  startsAt: string
  endsAt: string | null
  place: string
  isLive: boolean
  liveUrl: string | null
  registrationOpen: boolean
  capacity: number | null
  registeredCount: number
  responsible: string | null
  isPublic: boolean
  imageKey: string | null
  imageUrl: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED'
  statusLabel: string
  structure: { id: string; name: string }
  canEdit?: boolean
}

export interface SermonDto {
  id: string
  title: string
  kind: string
  mediaType: 'AUDIO' | 'VIDEO' | 'TEXT' | 'PDF'
  speaker: string | null
  scriptureRef: string | null
  summary: string | null
  body: string | null
  durationSec: number | null
  hasMedia: boolean
  externalUrl: string | null
  imageUrl: string | null
  offlineAllowed: boolean
  isPublic: boolean
  status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED' | 'ARCHIVED'
  playCount: number
  recordedAt: string | null
  publishedAt: string | null
  structure: { id: string; name: string }
}

export interface DocumentDto {
  id: string
  title: string
  category: string
  visibility: 'PUBLIC' | 'MEMBERS' | 'LEADERS'
  mimeType: string
  sizeBytes: number
  version: number
  downloads: number
  archived: boolean
  createdAt: string
  updatedAt: string
  structure: { id: string; name: string }
}

export interface CampaignDto {
  id: string
  title: string
  message: string
  // SMS : anciennes campagnes seulement, plus aucun envoi
  channels: Array<'PUSH' | 'EMAIL' | 'SMS'>
  audience: string
  groupId: string | null
  status: 'DRAFT' | 'SCHEDULED' | 'SENT' | 'CANCELLED'
  scheduledAt: string | null
  sentAt: string | null
  recipients: number
  opened: number
}

export interface ProjectDto {
  id: string
  code: string
  kind: 'PROJECT' | 'SOCIAL'
  title: string
  description: string
  location: string | null
  beneficiaries: string | null
  budget: number | null
  goalAmount: number | null
  raisedAmount: number
  progressPct: number
  contributorCount: number
  startsAt: string | null
  endsAt: string | null
  endLabel: string | null
  responsible: { id: string; fullName: string } | null
  imageUrl: string | null
  collectOpen: boolean
  status: string
  statusLabel: string
  validated: boolean
  structure: { id: string; name: string }
  steps: Array<{ label: string; done: boolean }>
  updates: Array<{ id: string; title: string; body: string | null; date: string }>
  can: { edit: boolean; validate: boolean }
  notified?: number
}

export interface ContributionRow {
  id: string
  at: string
  payer: string
  type: string
  destination: string
  structure: { id: string; name: string }
  channel: string
  channelLabel: string
  amount: number
  fee: number
  net: number
  status: 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  statusLabel: string
  manual: boolean
  reference: string | null
  receiptNumber: string | null
  recurring: boolean
  statusReason: string | null
}

export interface ContributionList extends Page<ContributionRow> {
  summary: { collected: number; succeeded: number; pending: number; failed: number; successRate: number | null }
}

export interface RefundDto {
  id: string
  amount: number
  reason: string
  status: 'REQUESTED' | 'VALIDATED' | 'EXECUTED' | 'REJECTED'
  createdAt: string
  requestedByMe: boolean
  contribution: ContributionRow
}

export interface ClosingDto {
  id: string
  year: number
  month: number
  label: string
  total: number
  txCount: number
  closedAt: string
}

export interface AuditRow {
  id: string
  at: string
  actor: string
  category: string
  categoryLabel: string
  action: string
  success: boolean
  ip: string | null
  entityType: string | null
  entityId: string | null
}

export interface RecentReport {
  id: string
  at: string
  title: string
  type: string
  period: string
  format: 'pdf' | 'xlsx' | 'csv'
  structureId: string | null
}

export interface ContributionTypeDto {
  id: string
  key: string
  label: string
  requiresProject: boolean
  active: boolean
  position: number
  used: number
}

export interface SettingsDto {
  structure: { id: string; name: string; level: string }
  locales: Array<'fr' | 'en'>
  receiptNote: string
  definedAt: Record<string, string> | null
  editable: boolean
  contributionTypes: ContributionTypeDto[] | null
  contributionTypesEditable: boolean
}
