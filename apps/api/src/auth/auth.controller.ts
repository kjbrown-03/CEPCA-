import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import {
  adminLoginSchema,
  adminVerifySchema,
  maskPhone,
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

// Hachage factice : une tentative sur un numéro inconnu coûte autant qu'une vraie (pas d'oracle temporel)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12)

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

  /** Étape 1 de l'app : envoi du code SMS. */
  @Post('otp/request')
  @HttpCode(200)
  async requestOtp(@Body(new ZodPipe(requestOtpSchema)) body: RequestOtpInput, @Req() req: Request) {
    if (body.purpose === 'LOGIN') {
      const user = await this.prisma.user.findUnique({ where: { phone: body.phone }, select: { status: true } })
      if (!user || user.status === 'DELETED') throw new AppError(404, 'NO_ACCOUNT', 'Aucun compte n’est associé à ce numéro. Créez votre compte.')
      if (user.status === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu. Contactez votre paroisse.')
    }
    return this.otp.issue(body.phone, body.purpose, req.ip ?? null, 4)
  }

  /** Étape 2 : vérification du code. Crée le compte à la première vérification. */
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body(new ZodPipe(verifyOtpSchema)) body: VerifyOtpInput, @Req() req: Request) {
    try {
      await this.otp.verify(body.phone, body.code, ['SIGNUP', 'LOGIN'])
    } catch (e) {
      await this.audit.record({ actorLabel: maskPhone(body.phone), category: 'CONNEXION', action: 'Échec de connexion (code SMS)', ip: req.ip, success: false })
      throw e
    }
    let user = await this.prisma.user.findUnique({ where: { phone: body.phone } })
    let created = false
    if (!user) {
      if (!body.fullName) throw new AppError(400, 'NAME_REQUIRED', 'Indiquez votre nom pour créer votre compte.')
      user = await this.prisma.user.create({ data: { phone: body.phone, fullName: body.fullName, residence: body.phone.startsWith('+237') ? 'CAMEROON' : 'DIASPORA' } })
      created = true
    }
    if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu. Contactez votre paroisse.')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const tokens = await this.tokens.issue(user.id, this.meta(req))
    return { ...tokens, created }
  }

  /** Back-office, étape 1 : téléphone + mot de passe → code SMS à 6 chiffres. */
  @Post('admin/login')
  @HttpCode(200)
  async adminLogin(@Body(new ZodPipe(adminLoginSchema)) body: z.infer<typeof adminLoginSchema>, @Req() req: Request) {
    const user = await this.prisma.user.findUnique({ where: { phone: body.phone }, include: { roleAssignments: { where: { revokedAt: null }, take: 1 } } })
    const ok = await bcrypt.compare(body.password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !ok || !user.passwordHash || user.status !== 'ACTIVE' || user.roleAssignments.length === 0) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskPhone(body.phone), category: 'CONNEXION', action: 'Échec de connexion au back-office', ip: req.ip, success: false })
      throw new AppError(401, 'BAD_CREDENTIALS', 'Numéro ou mot de passe incorrect.')
    }
    const ch = await this.otp.issue(user.phone, 'ADMIN_2FA', req.ip ?? null, 6)
    return { challengeId: ch.challengeId, sentTo: ch.sentTo, expiresInSec: ch.expiresInSec }
  }

  /** Back-office, étape 2 : code SMS → cookies de session httpOnly. */
  @Post('admin/verify')
  @HttpCode(200)
  async adminVerify(@Body(new ZodPipe(adminVerifySchema)) body: z.infer<typeof adminVerifySchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: body.challengeId } })
    if (!ch || ch.purpose !== 'ADMIN_2FA') throw new AppError(400, 'OTP_EXPIRED', 'Ce code a expiré. Reconnectez-vous.')
    const user = await this.prisma.user.findUnique({ where: { phone: ch.phone } })
    try {
      await this.otp.verify(ch.phone, body.code, ['ADMIN_2FA'], ch.id)
    } catch (e) {
      await this.audit.record({ actorId: user?.id, actorLabel: user?.fullName ?? maskPhone(ch.phone), category: 'CONNEXION', action: 'Échec de connexion (code SMS)', ip: req.ip, success: false })
      throw e
    }
    if (!user || user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est suspendu.')
    const tokens = await this.tokens.issue(user.id, this.meta(req))
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await this.audit.record({ actorId: user.id, actorLabel: user.fullName, category: 'CONNEXION', action: 'Connexion au back-office', ip: req.ip })
    this.setCookies(res, tokens)
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
