// Formes des réponses de l'API, consommées par le web et le mobile.

export type Scope = 'PAROISSE' | 'CONFESSION' | 'CEPCA' | 'AUTRE'

export interface ApiError {
  code: string
  message: string
  fields?: Record<string, string>
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface StructureRef {
  id: string
  name: string
  level: string // libellé du niveau : « Paroisse »
  levelKey: string
}

export interface MeDto {
  id: string
  fullName: string
  phone: string
  email: string | null
  residence: 'CAMEROON' | 'DIASPORA'
  countryCode: string | null
  locale: string
  timezone: string
  membership: null | {
    status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'TRANSFERRED' | 'INACTIVE' | 'DECEASED' | 'TO_VERIFY'
    structure: StructureRef
    /** Du niveau confession jusqu'à la structure de rattachement */
    hierarchy: StructureRef[]
    confession: { id: string; code: string; name: string }
  }
  roles: Array<{ assignmentId: string; roleKey: string; label: string; structure: StructureRef }>
  unreadNotifications: number
}

export interface ConfessionDto {
  id: string
  code: string
  name: string
  description: string | null
  logoUrl: string | null
  website: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: string
  memberCount?: number
}

export interface MembershipOptionDto {
  id: string
  name: string
  level: string
  parentName: string | null
}

export interface PublicationDto {
  id: string
  kind: 'ACTUALITE' | 'ANNONCE' | 'COMMUNIQUE' | 'ALERTE'
  kindLabel: string
  scope: Scope
  source: string // « Paroisse de Deïdo », « CEPCA », « EEC »
  title: string
  body: string[]
  imageUrl: string | null
  attachmentUrl: string | null
  publishedAt: string
}

export interface EventDto {
  id: string
  title: string
  description: string | null
  kind: string
  startsAt: string
  endsAt: string | null
  place: string
  isLive: boolean
  liveUrl: string | null
  imageUrl: string | null
  source: string
  registrationOpen: boolean
  capacity: number | null
  registeredCount: number
  remaining: number | null
  isRegistered: boolean
}

export interface NotificationDto {
  id: string
  kind: string
  title: string
  body: string
  link: { screen: string; id?: string } | null
  createdAt: string
  read: boolean
}

export interface SermonDto {
  id: string
  title: string
  speaker: string | null
  scriptureRef: string | null
  summary: string | null
  mediaType: 'AUDIO' | 'VIDEO' | 'TEXT' | 'PDF'
  kind: string
  durationSec: number | null
  mediaUrl: string | null
  externalUrl: string | null
  imageUrl: string | null
  offlineAllowed: boolean
  publishedAt: string
}

export interface DocumentDto {
  id: string
  title: string
  category: string
  mimeType: string
  sizeBytes: number
  url: string
  createdAt: string
}

export interface ProjectDto {
  id: string
  code: string
  title: string
  description: string
  location: string | null
  goalAmount: number | null
  raisedAmount: number
  contributorCount: number
  endLabel: string
  imageUrl: string | null
  collectOpen: boolean
  status: string
  structure: string
  steps: Array<{ label: string; done: boolean }>
  updates: Array<{ date: string; title: string }>
}

export interface ContributionTypeDto {
  key: string
  label: string
  requiresProject: boolean
}

export interface ContributionDto {
  id: string
  reference: string // référence opérateur ou numéro de reçu
  receiptNumber: string | null
  type: string
  typeKey: string
  destination: string
  amount: number
  fee: number
  totalCharged: number
  channel: 'MTN_MOMO' | 'ORANGE_MONEY' | 'CARD' | 'BANK' | 'CASH' | 'SANDBOX'
  channelLabel: string
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED'
  statusLabel: string
  recurring: boolean
  createdAt: string
  confirmedAt: string | null
  failureReason: string | null
}

/** Réponse à la création d'une contribution : le paiement reste à confirmer sur le téléphone. */
export interface CreateContributionResult {
  contribution: ContributionDto
  /** Page de paiement à ouvrir (Orange Money Web Payment) ; null quand la demande arrive directement sur le téléphone */
  paymentUrl: string | null
  instructions: string
}

/** Écran « Mes contributions » : total des paiements réussis et liste paginée. */
export interface ContributionHistoryDto extends Paginated<ContributionDto> {
  summary: { total: number; count: number; since: string | null }
}

export interface RecurringPlanDto {
  id: string
  type: string
  destination: string
  amount: number
  channel: string
  channelLabel: string
  nextRunAt: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
}

export interface HomeDto {
  nextService: (EventDto & { countdownTo: string }) | null
  announcements: PublicationDto[]
  featuredProject: ProjectDto | null
  unreadNotifications: number
}

export const CHANNEL_LABEL: Record<string, string> = {
  MTN_MOMO: 'MTN MoMo',
  ORANGE_MONEY: 'Orange Money',
  CARD: 'Carte bancaire',
  BANK: 'Virement',
  CASH: 'Espèces',
  SANDBOX: 'Bac à sable',
}

export const CONTRIBUTION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  SUCCEEDED: 'Réussi',
  FAILED: 'Échec',
  CANCELLED: 'Annulé',
  REFUNDED: 'Remboursé',
}

export const PUBLICATION_KIND_LABEL: Record<string, string> = {
  ACTUALITE: 'Actualité',
  ANNONCE: 'Annonce',
  COMMUNIQUE: 'Communiqué',
  ALERTE: 'Alerte',
}

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}
