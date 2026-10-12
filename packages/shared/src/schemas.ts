// Schémas d'entrée partagés. Objets stricts : un champ inconnu (role, status, isAdmin…) est refusé.
import { z } from 'zod'

export const COUNTRY_CODES = ['+237', '+33', '+1'] as const

/** Normalise un numéro saisi en E.164. Renvoie null si invalide. */
export function toE164(cc: string, local: string): string | null {
  const digits = local.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 12) return null
  return cc + digits
}

export const phoneE164 = z.string().regex(/^\+\d{9,15}$/, 'Numéro de téléphone invalide')

/** Adresse e-mail, ramenée en minuscules : elle identifie le compte. */
export const emailAddress = z.string().trim().toLowerCase().pipe(z.email('Adresse e-mail invalide').max(160))

export const requestOtpSchema = z.strictObject({
  email: emailAddress,
  purpose: z.enum(['SIGNUP', 'LOGIN']),
})
export type RequestOtpInput = z.infer<typeof requestOtpSchema>

/** À l'inscription, le nom et le téléphone (paiement Mobile Money) sont obligatoires. */
export const verifyOtpSchema = z.strictObject({
  email: emailAddress,
  code: z.string().regex(/^\d{4}$/, 'Le code compte 4 chiffres'),
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: phoneE164.optional(),
  // Application web (PWA) : la session est posée en cookies httpOnly, les jetons ne passent pas par la page
  cookie: z.literal(true).optional(),
})
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

/** Back-office : e-mail + mot de passe + mandat choisi (rôle et structure). */
export const adminLoginSchema = z.strictObject({
  email: emailAddress,
  password: z.string().min(8).max(200),
  roleId: z.string().min(10).max(40),
  structureId: z.string().min(10).max(40),
})
export const adminVerifySchema = z.strictObject({
  challengeId: z.string().min(10).max(40),
  code: z.string().regex(/^\d{6}$/, 'Le code compte 6 chiffres'),
})

export const attachSchema = z.strictObject({
  structureId: z.string().min(10).max(40),
  residence: z.enum(['CAMEROON', 'DIASPORA']),
  countryCode: z.string().length(2).optional(),
  consent: z.literal(true, { error: 'Le consentement est nécessaire pour rattacher votre profil à une Église' }),
})
export type AttachInput = z.infer<typeof attachSchema>

// L'e-mail n'est pas modifiable ici : il identifie le compte (connexion par code), une faute de frappe le rendrait inaccessible
export const updateProfileSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(120).optional(),
  residence: z.enum(['CAMEROON', 'DIASPORA']).optional(),
  countryCode: z.string().length(2).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  locale: z.enum(['fr', 'en']).optional(),
  timezone: z.enum(['Africa/Douala', 'Europe/Paris', 'America/Toronto', 'America/New_York']).optional(),
})

export const MIN_CONTRIBUTION = 100
export const MAX_CONTRIBUTION = 10_000_000

export const createContributionSchema = z.strictObject({
  idempotencyKey: z.string().min(16).max(64),
  typeKey: z.string().min(2).max(40),
  structureId: z.string().min(10).max(40).optional(), // défaut : la paroisse du fidèle
  projectId: z.string().min(10).max(40).optional(),
  amount: z.number().int().min(MIN_CONTRIBUTION, 'Montant minimum : 100 FCFA').max(MAX_CONTRIBUTION),
  channel: z.enum(['MTN_MOMO', 'ORANGE_MONEY']),
  payerPhone: phoneE164,
  recurring: z.boolean().default(false),
})
export type CreateContributionInput = z.infer<typeof createContributionSchema>

export const contactSchema = z.strictObject({
  name: z.string().trim().min(2, 'Indiquez votre nom').max(120),
  email: z.email('Adresse e-mail invalide').max(200),
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(5, 'Votre message est trop court').max(5000),
})
export type ContactInput = z.infer<typeof contactSchema>

export const publicationSchema = z.strictObject({
  title: z.string().trim().min(3).max(200),
  kind: z.enum(['ACTUALITE', 'ANNONCE', 'COMMUNIQUE', 'ALERTE']),
  body: z.string().trim().max(20000).default(''),
  targetStructureId: z.string().min(10).max(40),
  groupId: z.string().min(10).max(40).nullable().optional(),
  notify: z.boolean().default(false),
  isPublic: z.boolean().default(true),
})

export const eventSchema = z.strictObject({
  title: z.string().trim().min(3).max(200),
  kind: z.enum(['CULTE', 'CONFERENCE', 'SEMINAIRE', 'FORMATION', 'REUNION', 'CONCERT', 'JEUNESSE', 'SOCIAL', 'CAMPAGNE', 'CEPCA', 'AUTRE']).default('AUTRE'),
  description: z.string().max(5000).optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  place: z.string().trim().min(2).max(200),
  isLive: z.boolean().default(false),
  liveUrl: z.url().optional(),
  registrationOpen: z.boolean().default(false),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  structureId: z.string().min(10).max(40),
})

export const paginationSchema = z.object({
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * Abonnement Web Push d'un navigateur. L'adresse doit appartenir à un service push connu
 * (Google, Mozilla, Apple, Microsoft) : le serveur ne contacte jamais une adresse arbitraire.
 */
export const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/
export const pushSubscriptionSchema = z.strictObject({
  endpoint: z
    .url({ protocol: /^https$/ })
    .max(1000)
    .refine((u) => PUSH_HOSTS.test(new URL(u).hostname), 'Service de notification inconnu'),
  keys: z.strictObject({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
})
export const pushUnsubscribeSchema = z.strictObject({ endpoint: z.string().max(1000) })

