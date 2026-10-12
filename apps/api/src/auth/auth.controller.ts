import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import {
  adminLoginSchema,
  adminVerifySchema,
  maskEmail,
  passwordResetRequestSchema,
  passwordResetSchema,
  requestOtpSchema,
  verifyOtpSchema,
  type RequestOtpInput,
  type VerifyOtpInput,
} from '@cepca/shared'
import { AppError, Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { env } from '../config/env'
import { OtpService } from './otp.service'
import { TokensService } from './tokens.service'
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.guard'

const AUTH_LIMIT = { default: { limit: 20, ttl: 10 * 60 * 1000 } }
const refreshSchema = z.strictObject({ refreshToken: z.string().min(20).max(200).optional() })

// Hachage factice : une tentative sur une adresse inconnue coûte autant qu'une vraie (pas d'oracle temporel)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12)
const childrenQuery = z.strictObject({ parentId: z.string().min(10).max(40) })

/** Mandat en cours : ni révoqué, ni à venir, ni échu. */
function activeSeat(now = new Date()) {
  return { revokedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
}

@Controller('auth')
@Public()
@Throttle(AUTH_LIMIT)
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  private meta(req: Request) {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null }
  }

  /** Étape 1 de l'app : envoi du code par e-mail. */
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body(new ZodPipe(requestOtpSchema)) body: RequestOtpInput, @Req() req: Request) {
    if (body.purpose === 'LOGIN') {
      const user = await this.prisma.user.findUnique({ where: { email: body.email }, select: { status: true } })
      if (!user || user.status === 'DELETED') throw new AppError(404, 'NO_ACCOUNT', 'Aucun compte n’est associé à cette adresse. Créez votre compte.')
      if (user.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu. Contactez votre paroisse.')
    }
    return this.otp.issue(body.email, body.purpose, req.ip ?? null, 4)
  }

  /** Étape 2 : vérification du code. Crée le compte à la première vérification (nom et téléphone obligatoires). */
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body(new ZodPipe(verifyOtpSchema)) body: VerifyOtpInput, @Req() req: Request) {
    let user = await this.prisma.user.findUnique({ where: { email: body.email } })
    // Contrôlé avant le code : une inscription incomplète ne consomme pas d'essai
    if (!user) {
      if (!body.fullName) throw new AppError(400, 'NAME_REQUIRED', 'Indiquez votre nom pour créer votre compte.')
      if (!body.phone) throw new AppError(400, 'PHONE_REQUIRED', 'Indiquez votre numéro de téléphone (paiement Mobile Money).')
    }
    try {
      await this.otp.verify(body.email, body.code, ['SIGNUP', 'LOGIN'])
    } catch (e) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskEmail(body.email), category: 'CONNEXION', action: 'Échec de connexion (code e-mail)', ip: req.ip, success: false })
      throw e
    }
    let created = false
    if (!user) {
      const phone = body.phone!
      if (await this.prisma.user.findUnique({ where: { phone }, select: { id: true } })) {
        throw new AppError(409, 'PHONE_TAKEN', 'Ce numéro est déjà utilisé par un autre compte. Connectez-vous avec l’adresse e-mail de ce compte.')
      }
      user = await this.prisma.user.create({ data: { email: body.email, phone, fullName: body.fullName!, residence: phone.startsWith('+237') ? 'CAMEROON' : 'DIASPORA' } })
      created = true
    }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu. Contactez votre paroisse.')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const tokens = await this.tokens.issue(user.id, this.meta(req))
    return { ...tokens, created }
  }

  /**
   * Formulaire de connexion du back-office : rôles de responsabilité, confessions et leurs niveaux.
   * Rien de personnel : la liste ne dit pas qui détient quel rôle.
   */
  @Get('admin/options')
  async adminOptions() {
    const [root, roles, confessions] = await Promise.all([
      this.prisma.structure.findFirst({ where: { depth: 0 }, select: { id: true, name: true } }),
      this.prisma.role.findMany({ where: { key: { not: 'member' } }, select: { id: true, label: true, levelKey: true, confessionId: true } }),
      this.prisma.structure.findMany({
        where: { depth: 1, status: { not: 'SUSPENDED' } },
        select: { id: true, name: true, confessionId: true, confession: { select: { levelTypes: { select: { key: true, name: true, rank: true }, orderBy: { rank: 'asc' } } } } },
        orderBy: { name: 'asc' },
      }),
    ])
    const rank: Record<string, number> = { conseil: 0, confession: 1 }
    for (const c of confessions) for (const l of c.confession?.levelTypes ?? []) rank[l.key] ??= l.rank
    const r = (key: string | null) => rank[key ?? ''] ?? 99
    return {
      root,
      // Du plus haut niveau au plus local, dans l'ordre de la cascade
      roles: roles.sort((a, b) => r(a.levelKey) - r(b.levelKey) || a.label.localeCompare(b.label, 'fr')),
      confessions: confessions.map((c) => ({ id: c.id, name: c.name, confessionId: c.confessionId, levels: (c.confession?.levelTypes ?? []).map((l) => ({ key: l.key, name: l.name })) })),
    }
  }

  /** Cascade du formulaire : structures filles (synodes d'une confession, consistoires d'un synode…). */
  @Get('admin/structures')
  async adminStructures(@Query(new ZodPipe(childrenQuery)) q: z.infer<typeof childrenQuery>) {
    const rows = await this.prisma.structure.findMany({
      where: { parentId: q.parentId, status: { not: 'SUSPENDED' } },
      select: { id: true, name: true, levelType: { select: { key: true } } },
      orderBy: { name: 'asc' },
      take: 500,
    })
    return rows.map((s) => ({ id: s.id, name: s.name, levelKey: s.levelType.key }))
  }

  /** Back-office, étape 1 : e-mail + mot de passe + mandat choisi → code à 6 chiffres par e-mail. */
  @Post('admin/login')
  @HttpCode(200)
  async adminLogin(@Body(new ZodPipe(adminLoginSchema)) body: z.infer<typeof adminLoginSchema>, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { email: body.email },
      include: { roleAssignments: { where: activeSeat(), select: { id: true, roleId: true, structureId: true } } },
    })
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !ok || !user.passwordHash || user.status !== 'ACTIVE' || user.roleAssignments.length === 0) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskEmail(body.email), category: 'CONNEXION', action: 'Échec de connexion au back-office', ip: req.ip, success: false })
      throw new AppError(401, 'BAD_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.')
    }
    // Le mot de passe est juste : on peut dire que le mandat choisi n'est pas le bon
    const seat = user.roleAssignments.find((a) => a.roleId === body.roleId && a.structureId === body.structureId)
    if (!seat) {
      await this.audit.record({ actorId: user.id, actorLabel: user.fullName, category: 'CONNEXION', action: 'Échec de connexion au back-office (rôle ou structure)', ip: req.ip, success: false })
      throw new AppError(403, 'NO_SEAT', 'Vous n’avez pas ce rôle sur cette structure. Vérifiez le rôle et la structure choisis.')
    }
    const ch = await this.otp.issue(body.email, 'ADMIN_2FA', req.ip ?? null, 6)
    return { challengeId: ch.challengeId, sentTo: ch.sentTo, expiresInSec: ch.expiresInSec, assignmentId: seat.id }
  }

  /** Back-office, étape 2 : code reçu par e-mail → cookies de session httpOnly. */
  @Post('admin/verify')
  @HttpCode(200)
  async adminVerify(@Body(new ZodPipe(adminVerifySchema)) body: z.infer<typeof adminVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: body.challengeId } })
    if (!ch || ch.purpose !== 'ADMIN_2FA') throw new AppError(400, 'OTP_EXPIRED', 'Ce code a expiré. Reconnectez-vous.')
    const user = await this.prisma.user.findUnique({ where: { email: ch.email } })
    try {
      await this.otp.verify(ch.email, body.code, ['ADMIN_2FA'], ch.id)
    } catch (e) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskEmail(ch.email), category: 'CONNEXION', action: 'Échec de connexion (code e-mail)', ip: req.ip, success: false })
      throw e
    }
    if (!user || user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu.')
    const tokens = await this.tokens.issue(user.id, this.meta(req))
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await this.audit.record({ actorId: user.id, actorLabel: user.fullName, category: 'CONNEXION', action: 'Connexion au back-office', ip: req.ip })
    this.setCookies(res, tokens)
    return { ok: true }
  }

  /**
   * Définition (après une nomination) ou oubli du mot de passe : code à 6 chiffres envoyé à l'adresse du compte.
   * Même réponse que l'adresse soit connue ou non : la route ne dit pas qui est responsable.
   */
  @Post('admin/password/request')
  @HttpCode(200)
  async passwordRequest(@Body(new ZodPipe(passwordResetRequestSchema)) body: z.infer<typeof passwordResetRequestSchema>, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email }, include: { roleAssignments: { where: activeSeat(), take: 1 } } })
    if (!user || user.status !== 'ACTIVE' || user.roleAssignments.length === 0) {
      return { challengeId: 'c' + randomBytes(12).toString('hex'), sentTo: maskEmail(body.email), expiresInSec: 600 }
    }
    return this.otp.issue(body.email, 'PASSWORD_RESET', req.ip ?? null, 6)
  }

  /** Nouveau mot de passe : les sessions ouvertes sont fermées, la connexion repasse par le code e-mail. */
  @Post('admin/password/reset')
  @HttpCode(200)
  async passwordReset(@Body(new ZodPipe(passwordResetSchema)) body: z.infer<typeof passwordResetSchema>, @Req() req: Request) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: body.challengeId } })
    if (!ch || ch.purpose !== 'PASSWORD_RESET') throw new AppError(400, 'OTP_EXPIRED', 'Ce code a expiré. Demandez-en un nouveau.')
    const user = await this.prisma.user.findUnique({ where: { email: ch.email } })
    try {
      await this.otp.verify(ch.email, body.code, ['PASSWORD_RESET'], ch.id)
    } catch (e) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskEmail(ch.email), category: 'CONNEXION', action: 'Échec de définition du mot de passe (code e-mail)', ip: req.ip, success: false })
      throw e
    }
    if (!user || user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu.')
    const first = !user.passwordHash
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.password, 12) } })
    await this.tokens.revokeAll(user.id)
    await this.audit.record({ actorId: user.id, actorLabel: user.fullName, category: 'CONNEXION', action: first ? 'A défini son mot de passe' : 'A réinitialisé son mot de passe', ip: req.ip })
    return { ok: true }
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 10 * 60 * 1000 } })
  async refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE]
    const raw = body.refreshToken ?? fromCookie
    if (!raw) throw new AppError(401, 'SESSION_EXPIRED', 'Votre session a expiré. Reconnectez-vous.')
    const { tokens } = await this.tokens.rotate(raw, this.meta(req))
    if (!body.refreshToken) {
      this.setCookies(res, tokens)
      return { ok: true }
    }
    return tokens
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = body.refreshToken ?? (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE]
    if (raw) await this.tokens.revoke(raw)
    res.clearCookie(ACCESS_COOKIE, { path: '/' })
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' })
    return { ok: true }
  }

  private setCookies(res: Response, t: { accessToken: string; refreshToken: string; expiresIn: number }) {
    const secure = env.NODE_ENV === 'production'
    res.cookie(ACCESS_COOKIE, t.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: t.expiresIn * 1000 })
    res.cookie(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, secure, sameSite: 'strict', path: '/api/auth', maxAge: 30 * 24 * 3600 * 1000 })
  }
}
