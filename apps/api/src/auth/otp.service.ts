import { Injectable } from '@nestjs/common'
import type { OtpPurpose } from '@prisma/client'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { maskEmail } from '@cepca/shared'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { AppError } from '../common/http'
import { MailService } from '../mail/mail.service'

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_PER_HOUR = 5
const RESEND_COOLDOWN_MS = 30 * 1000

const SUBJECT: Record<OtpPurpose, string> = {
  SIGNUP: 'Votre code pour créer votre compte',
  LOGIN: 'Votre code de connexion',
  ADMIN_2FA: 'Votre code de connexion au back-office',
  PASSWORD_RESET: 'Votre code pour définir votre mot de passe',
}

/** Codes à usage unique envoyés par e-mail (aucun SMS). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private hash(email: string, code: string) {
    return createHmac('sha256', env.OTP_PEPPER).update(`${email}:${code}`).digest('hex')
  }

  /** Plafond par adresse, en plus du limiteur par IP : un attaquant qui change d'IP ne bombarde pas une boîte de codes. */
  async issue(email: string, purpose: OtpPurpose, ip: string | null, digits: 4 | 6 = 4) {
    const since = new Date(Date.now() - 3600 * 1000)
    const recent = await this.prisma.otpChallenge.findMany({ where: { email, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: MAX_PER_HOUR })
    if (recent.length >= MAX_PER_HOUR) throw new AppError(429, 'OTP_TOO_MANY', 'Trop de codes demandés pour cette adresse. Réessayez dans une heure.')
    // Délai de renvoi par usage : définir son mot de passe puis se connecter aussitôt reste possible (le plafond horaire borne le total)
    const last = recent.find((r) => r.purpose === purpose)
    if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'OTP_COOLDOWN', 'Un code vient de vous être envoyé. Patientez 30 secondes avant d’en demander un autre.')
    }
    const code = String(randomInt(0, 10 ** digits)).padStart(digits, '0')
    // Les codes précédents de cette adresse deviennent caducs
    await this.prisma.otpChallenge.updateMany({ where: { email, purpose, consumedAt: null }, data: { consumedAt: new Date() } })
    const ch = await this.prisma.otpChallenge.create({
      data: { email, purpose, codeHash: this.hash(email, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip },
    })
    await this.mail.send({
      to: email,
      subject: `CEPCA · ${SUBJECT[purpose]}`,
      text: `Bonjour,\n\nVotre code CEPCA est ${code}. Il expire dans ${OTP_TTL_MS / 60000} minutes.\n\nNe le communiquez à personne : l'équipe CEPCA ne vous le demandera jamais.\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
    })
    return { challengeId: ch.id, expiresInSec: OTP_TTL_MS / 1000, sentTo: maskEmail(email) }
  }

  async verify(email: string, code: string, purposes: OtpPurpose[], challengeId?: string) {
    const ch = await this.prisma.otpChallenge.findFirst({
      where: { email, purpose: { in: purposes }, consumedAt: null, ...(challengeId ? { id: challengeId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    if (!ch || ch.expiresAt < new Date()) throw new AppError(400, 'OTP_EXPIRED', 'Ce code a expiré. Demandez-en un nouveau.')
    if (ch.attempts >= MAX_ATTEMPTS) throw new AppError(400, 'OTP_LOCKED', 'Trop d’essais. Demandez un nouveau code.')
    const a = Buffer.from(ch.codeHash, 'hex')
    const b = Buffer.from(this.hash(email, code), 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } })
      const left = MAX_ATTEMPTS - ch.attempts - 1
      throw new AppError(400, 'OTP_INVALID', left > 0 ? `Code incorrect. Il vous reste ${left} essai${left > 1 ? 's' : ''}.` : 'Code incorrect. Demandez un nouveau code.')
    }
    // Consommation conditionnelle : deux vérifications simultanées ne passent pas toutes les deux
    const res = await this.prisma.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: new Date() } })
    if (res.count !== 1) throw new AppError(400, 'OTP_EXPIRED', 'Ce code a déjà été utilisé.')
    return ch
  }
}
