// Back-office : schémas d'entrée et formes de réponse. Objets stricts, comme le reste de l'API.
import { z } from 'zod'
import { emailAddress, phoneE164 } from './schemas'

const id = z.string().min(10).max(40)
const isoDate = z.iso.datetime({ offset: true })

export const MODULES = [
  'NEWS',
  'EVENTS',
  'SERMONS',
  'DOCUMENTS',
  'MEMBERS',
  'CONTRIBUTIONS',
  'PROJECTS',
  'REPORTS',
  'USERS_ROLES',
  'SETTINGS',
  'NOTIFICATIONS',
  'AUDIT',
  'STRUCTURES',
] as const
export type ModuleKey = (typeof MODULES)[number]

export const MODULE_LABEL: Record<ModuleKey, string> = {
  NEWS: 'Actualités et annonces',
  EVENTS: 'Événements',
  SERMONS: 'Prédications',
  DOCUMENTS: 'Documents',
  MEMBERS: 'Fidèles',
  CONTRIBUTIONS: 'Contributions',
  PROJECTS: 'Projets',
  REPORTS: 'Rapports',
  USERS_ROLES: 'Utilisateurs et rôles',
  SETTINGS: 'Paramétrage',
  NOTIFICATIONS: 'Notifications',
  AUDIT: "Journal d'audit",
  STRUCTURES: 'Structures',
}

// ── Mot de passe des responsables ──

/** 10 caractères minimum, avec au moins une lettre et un chiffre. */
export const adminPassword = z
  .string()
  .min(10, 'Au moins 10 caractères')
  .max(200)
  .regex(/[A-Za-zÀ-ÿ]/, 'Au moins une lettre')
  .regex(/\d/, 'Au moins un chiffre')

export const passwordResetRequestSchema = z.strictObject({ email: emailAddress })
export const passwordResetSchema = z.strictObject({
  challengeId: id,
  code: z.string().regex(/^\d{6}$/, 'Le code compte 6 chiffres'),
  password: adminPassword,
})

// ── Structures ──

export const createStructureSchema = z.strictObject({
  parentId: id,
  name: z.string().trim().min(3).max(160),
  code: z.string().trim().regex(/^[A-Z0-9]{2,12}$/, 'Code : 2 à 12 lettres majuscules ou chiffres').optional(),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200).optional(),
})

/** Nouvelle confession (CEPCA) : sa hiérarchie propre est définie à la création (§7). */
export const createConfessionSchema = z.strictObject({
  code: z.string().trim().regex(/^[A-Z]{2,8}$/, 'Sigle : 2 à 8 lettres majuscules'),
  name: z.string().trim().min(3).max(160),
  levels: z
    .array(z.strictObject({ key: z.string().regex(/^[a-z_]{2,20}$/), name: z.string().trim().min(2).max(40), isMembership: z.boolean() }))
    .min(1)
    .max(6)
    .refine((ls) => ls.some((l) => l.isMembership), 'Au moins un niveau doit accueillir des fidèles')
    .refine((ls) => new Set(ls.map((l) => l.key)).size === ls.length, 'Clés de niveau en double'),
})

export const updateStructureSchema = z.strictObject({
  name: z.string().trim().min(3).max(160).optional(),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: phoneE164.nullable().optional(),
  email: z.email().max(200).nullable().optional(),
  serviceSchedule: z.string().trim().max(80).nullable().optional(),
  timezone: z.enum(['Africa/Douala', 'Europe/Paris', 'America/Toronto', 'America/New_York']).optional(),
  status: z.enum(['ACTIVE', 'CONFIGURATION', 'VACANT', 'SUSPENDED']).optional(),
})

// ── Utilisateurs, rattachements, rôles ──

export const userListSchema = z.strictObject({
  q: z.string().trim().max(80).optional(),
  filter: z.enum(['ALL', 'LEADERS', 'MEMBERS', 'PENDING', 'SUSPENDED']).default('ALL'),
  structureId: id.optional(),
  cursor: id.optional(),
})

export const membershipDecisionSchema = z.strictObject({ note: z.string().trim().max(500).optional() })
export const membershipStatusSchema = z.strictObject({
  status: z.enum(['ACTIVE', 'INACTIVE', 'DECEASED', 'TO_VERIFY']),
  note: z.string().trim().max(500).optional(),
})
export const transferSchema = z.strictObject({ structureId: id, note: z.string().trim().max(500).optional() })

/** Nomination : la personne est retrouvée par son e-mail ; un compte est créé si besoin (invitation, nom et téléphone requis). */
export const assignRoleSchema = z.strictObject({
  email: emailAddress,
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneE164.optional(),
  roleId: id,
  structureId: id,
  title: z.string().trim().max(80).optional(),
  endsAt: isoDate.optional(),
})

const permCell = z.strictObject({ read: z.boolean(), write: z.boolean(), validate: z.boolean() })
export const rolePermissionsSchema = z.strictObject({
  permissions: z.partialRecord(z.enum(MODULES), permCell),
})
export const createRoleSchema = z.strictObject({
  confessionId: id,
  key: z.string().regex(/^[a-z_]{3,30}$/),
  label: z.string().trim().min(3).max(80),
  description: z.string().trim().max(300).optional(),
  basedOn: id.optional(),
})

// ── Publications ──

export const adminPublicationSchema = z.strictObject({
  title: z.string().trim().min(3).max(200),
  kind: z.enum(['ACTUALITE', 'ANNONCE', 'COMMUNIQUE', 'ALERTE']),
  body: z.string().trim().max(20000).default(''),
  targetStructureId: id,
  groupId: id.nullable().optional(),
  notify: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  imageKey: z.string().max(200).nullable().optional(),
})
export const updatePublicationSchema = adminPublicationSchema.partial()
export const returnSchema = z.strictObject({ note: z.string().trim().min(3, 'Expliquez ce qui doit être revu').max(1000) })

// ── Événements ──

export const adminEventSchema = z
  .strictObject({
    title: z.string().trim().min(3).max(200),
    kind: z.enum(['CULTE', 'CONFERENCE', 'SEMINAIRE', 'FORMATION', 'REUNION', 'CONCERT', 'JEUNESSE', 'SOCIAL', 'CAMPAGNE', 'CEPCA', 'AUTRE']).default('AUTRE'),
    description: z.string().max(5000).nullable().optional(),
    startsAt: isoDate,
    endsAt: isoDate.nullable().optional(),
    place: z.string().trim().min(2).max(200),
    isLive: z.boolean().default(false),
    liveUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
    registrationOpen: z.boolean().default(false),
    capacity: z.number().int().positive().max(100000).nullable().optional(),
    responsible: z.string().trim().max(120).nullable().optional(),
    isPublic: z.boolean().default(true),
    imageKey: z.string().max(200).nullable().optional(),
    structureId: id,
  })
  .refine((e) => !e.endsAt || Date.parse(e.endsAt) >= Date.parse(e.startsAt), { message: 'La fin précède le début', path: ['endsAt'] })
export const updateEventSchema = z.strictObject({
  title: z.string().trim().min(3).max(200).optional(),
  kind: z.enum(['CULTE', 'CONFERENCE', 'SEMINAIRE', 'FORMATION', 'REUNION', 'CONCERT', 'JEUNESSE', 'SOCIAL', 'CAMPAGNE', 'CEPCA', 'AUTRE']).optional(),
  description: z.string().max(5000).nullable().optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.nullable().optional(),
  place: z.string().trim().min(2).max(200).optional(),
  isLive: z.boolean().optional(),
  liveUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  registrationOpen: z.boolean().optional(),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  responsible: z.string().trim().max(120).nullable().optional(),
  isPublic: z.boolean().optional(),
  imageKey: z.string().max(200).nullable().optional(),
})

// ── Prédications et documents ──

export const adminSermonSchema = z.strictObject({
  structureId: id,
  title: z.string().trim().min(3).max(200),
  kind: z.enum(['PREDICATION', 'MEDITATION', 'ETUDE_BIBLIQUE', 'ENSEIGNEMENT', 'MESSAGE_PASTORAL', 'CONFERENCE']).default('PREDICATION'),
  mediaType: z.enum(['AUDIO', 'VIDEO', 'TEXT', 'PDF']),
  speaker: z.string().trim().max(120).nullable().optional(),
  scriptureRef: z.string().trim().max(80).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  body: z.string().trim().max(20000).nullable().optional(),
  durationSec: z.number().int().positive().max(24 * 3600).nullable().optional(),
  externalUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  imageKey: z.string().max(200).nullable().optional(),
  offlineAllowed: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  recordedAt: isoDate.nullable().optional(),
})
export const updateSermonSchema = adminSermonSchema.omit({ structureId: true }).partial()

export const DOC_CATEGORIES = ['Méditations', 'Études bibliques', 'Lettres pastorales', 'Bulletins', 'Administratif'] as const
/** Champs du formulaire multipart accompagnant le fichier. */
export const adminDocumentSchema = z.strictObject({
  structureId: id,
  title: z.string().trim().min(3).max(200),
  category: z.enum(DOC_CATEGORIES),
  visibility: z.enum(['PUBLIC', 'MEMBERS', 'LEADERS']).default('MEMBERS'),
})
export const updateDocumentSchema = z.strictObject({
  title: z.string().trim().min(3).max(200).optional(),
  category: z.enum(DOC_CATEGORIES).optional(),
  visibility: z.enum(['PUBLIC', 'MEMBERS', 'LEADERS']).optional(),
})

// ── Notifications ──

// Pas de SMS (coût par message) : notification push et e-mail, tous deux gratuits.
export const campaignSchema = z.strictObject({
  targetStructureId: id,
  groupId: id.nullable().optional(),
  title: z.string().trim().min(3).max(80),
  message: z.string().trim().min(3).max(500),
  channels: z.array(z.enum(['PUSH', 'EMAIL'])).min(1, 'Choisissez au moins un canal').max(2),
  scheduledAt: isoDate.nullable().optional(),
})

// ── Projets ──

export const adminProjectSchema = z.strictObject({
  structureId: id,
  kind: z.enum(['PROJECT', 'SOCIAL']).default('PROJECT'),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(10000),
  location: z.string().trim().max(160).nullable().optional(),
  beneficiaries: z.string().trim().max(160).nullable().optional(),
  budget: z.number().int().positive().max(1e11).nullable().optional(),
  goalAmount: z.number().int().positive().max(1e11).nullable().optional(),
  startsAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
  endLabel: z.string().trim().max(60).nullable().optional(),
  responsibleId: id.nullable().optional(),
  imageKey: z.string().max(200).nullable().optional(),
  steps: z.array(z.string().trim().min(2).max(120)).max(20).default([]),
})
export const updateProjectSchema = adminProjectSchema.omit({ structureId: true, steps: true }).partial().extend({
  status: z.enum(['IDEA', 'PROPOSED', 'STUDY', 'VALIDATED', 'FUNDING', 'EXECUTION', 'COMPLETED', 'CLOSED']).optional(),
  collectOpen: z.boolean().optional(),
})
export const projectStepsSchema = z.strictObject({
  steps: z.array(z.strictObject({ label: z.string().trim().min(2).max(120), done: z.boolean() })).max(20),
})
export const projectUpdateSchema = z.strictObject({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(5000).nullable().optional(),
  imageKey: z.string().max(200).nullable().optional(),
})

// ── Contributions ──

export const contributionListSchema = z.strictObject({
  structureId: id.optional(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'MANUAL']).optional(),
  q: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: id.optional(),
})

export const manualContributionSchema = z.strictObject({
  idempotencyKey: z.string().min(16).max(64),
  structureId: id,
  typeKey: z.string().min(2).max(40),
  projectId: id.nullable().optional(),
  amount: z.number().int().min(100).max(100_000_000),
  channel: z.enum(['CASH', 'BANK']),
  payerLabel: z.string().trim().min(2).max(120),
  /** Date de réception des fonds ; défaut : maintenant */
  receivedAt: isoDate.optional(),
  note: z.string().trim().max(300).optional(),
})

export const resolveContributionSchema = z.strictObject({
  status: z.enum(['SUCCEEDED', 'FAILED']),
  note: z.string().trim().min(5, 'Indiquez la preuve de rapprochement (relevé, référence opérateur…)').max(500),
})

export const refundRequestSchema = z.strictObject({
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().min(5).max(500),
})
export const refundExecuteSchema = z.strictObject({ providerRef: z.string().trim().min(3).max(80) })

export const closingSchema = z.strictObject({
  structureId: id,
  year: z.number().int().min(2024).max(2100),
  month: z.number().int().min(1).max(12),
})

// ── Rapports ──

export const REPORT_TYPES = ['contributions', 'members', 'projects', 'activities', 'communication'] as const
export const reportQuerySchema = z.strictObject({
  type: z.enum(REPORT_TYPES),
  /** 2026-09 (mois), 2026-Q3 (trimestre) ou 2026 (année) */
  period: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/, 'Période invalide'),
  structureId: id.optional(),
  format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
})

// ── Journal d'audit ──

export const auditQuerySchema = z.strictObject({
  category: z.enum(['CONNEXION', 'VALIDATION', 'PAIEMENT', 'DROITS', 'EXPORT', 'PUBLICATION', 'SUPPRESSION', 'PARAMETRAGE']).optional(),
  q: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: id.optional(),
  format: z.enum(['json', 'csv']).default('json'),
})

// ── Paramètres ──

export const settingsSchema = z.strictObject({
  locales: z.array(z.enum(['fr', 'en'])).min(1).optional(),
  receiptNote: z.string().trim().max(300).optional(),
})
export const contributionTypeSchema = z.strictObject({
  key: z.string().regex(/^[a-z_0-9]{2,40}$/),
  label: z.string().trim().min(2).max(60),
  requiresProject: z.boolean().default(false),
  active: z.boolean().default(true),
})
export const updateContributionTypeSchema = z.strictObject({
  label: z.string().trim().min(2).max(60).optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).max(100).optional(),
})

// ── Réponses ──

export interface AdminSeat {
  assignmentId: string
  roleKey: string
  roleLabel: string
  title: string | null
  structure: { id: string; name: string; level: string; path: string }
  /** Modules du menu, dans l'ordre de la maquette */
  nav: string[]
  permissions: Partial<Record<ModuleKey, { read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }>>
}

export interface AdminMeDto {
  id: string
  fullName: string
  phone: string
  email: string | null
  seats: AdminSeat[]
}

export interface KpiDto {
  label: string
  value: string
  hint: string
}

export interface QueueItemDto {
  kind: 'MEMBERSHIP' | 'PUBLICATION' | 'REFUND' | 'PAYMENT' | 'PROJECT' | 'CLOSING' | 'SERMON'
  id: string
  title: string
  meta: string
  /** Actions possibles en un geste depuis le tableau de bord */
  actions: Array<'approve' | 'reject' | 'open'>
}

export interface DashboardDto {
  seat: AdminSeat
  crumbs: string[]
  scopeNote: string
  kpis: KpiDto[]
  chart: { title: string; unit: string; months: string[]; values: number[] }
  queue: QueueItemDto[]
  table: { title: string; columns: string[]; rows: Array<{ id: string; cells: string[]; status: string }> }
  recentAudit: Array<{ at: string; actor: string; action: string }>
}

export interface StructureNodeDto {
  id: string
  parentId: string | null
  name: string
  code: string
  level: string
  levelKey: string
  depth: number
  status: string
  leader: string | null
  members: number
  childLevel: string | null
}

export interface AdminUserDto {
  id: string
  fullName: string
  phone: string
  email: string | null
  status: string
  residence: string
  membership: null | { id: string; status: string; structureId: string; structure: string; requestedAt: string }
  roles: Array<{ assignmentId: string; roleId: string; label: string; title: string | null; structure: string; structureId: string; endsAt: string | null }>
  lastLoginAt: string | null
  createdAt: string
}

export interface RoleMatrixDto {
  id: string
  key: string
  label: string
  description: string | null
  confessionId: string | null
  isSystem: boolean
  editable: boolean
  permissions: Partial<Record<ModuleKey, { read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }>>
}

export interface ReportDto {
  type: string
  title: string
  period: { label: string; from: string; to: string }
  scope: string
  kpis: Array<[string, string]>
  columns: string[]
  rows: string[][]
  generatedAt: string
}

/** Formulaire de connexion du back-office : rôle, puis structure en cascade (confession → … → niveau du rôle). */
export interface AdminLoginOptionsDto {
  root: { id: string; name: string } | null
  /** levelKey : niveau où le rôle s'exerce (conseil, confession, synode, consistoire, paroisse, chapelle…) */
  roles: Array<{ id: string; label: string; levelKey: string | null; confessionId: string | null }>
  /** id = structure de la confession ; levels = sa hiérarchie propre, du plus haut au plus local */
  confessions: Array<{ id: string; name: string; confessionId: string | null; levels: Array<{ key: string; name: string }> }>
}

export interface AdminLoginStructureDto {
  id: string
  name: string
  levelKey: string
}
