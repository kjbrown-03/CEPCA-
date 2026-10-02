import { Injectable, Logger } from '@nestjs/common'
import type { OtpPurpose } from '@prisma/client'
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { maskPhone } from '@cepca/shared'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { AppError } from '../common/http'

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const MAX_PER_HOUR = 5
const RESEND_COOLDOWN_MS = 30 * 1000

export interface SmsGateway {
  send(phone: string, text: string): Promise<void>
}

/** En développement, le SMS s'affiche dans le terminal de l'API. */
@Injectable()
export class ConsoleSmsGateway implements SmsGateway {
  private readonly log = new Logger('SMS')
  async send(phone: string, text: string) {
    this.log.log(`→ ${phone} : ${text}`)
  }
}

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: ConsoleSmsGateway,
  ) {}

  private hash(phone: string, code: string) {
    return createHmac('sha256', env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex')
  }

  /** Plafond par numéro, en plus du limiteur par IP : un attaquant qui change d'IP ne bombarde pas un numéro de SMS. */
  async issue(phone: string, purpose: OtpPurpose, ip: string | null, digits: 4 | 6 = 4) {
    const since = new Date(Date.now() - 3600 * 1000)
    const recent = await this.prisma.otpChallenge.findMany({ where: { phone, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, take: MAX_PER_HOUR })
    if (recent.length >= MAX_PER_HOUR) throw new AppError(429, 'OTP_TOO_MANY', "Trop de codes demandés pour ce numéro. Réessayez dans une heure.")
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'OTP_COOLDOWN', 'Un code vient de vous être envoyé. Patientez 30 secondes avant d’en demander un autre.')
    }
    const code = String(randomInt(0, 10 ** digits)).padStart(digits, '0')
    // Les codes précédents de ce numéro deviennent caducs
    await this.prisma.otpChallenge.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } })
    const ch = await this.prisma.otpChallenge.create({
      data: { phone, purpose, codeHash: this.hash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), ip },
    })
    await this.sms.send(phone, `CEPCA : votre code est ${code}. Il expire dans 5 minutes. Ne le communiquez à personne.`)
    return { challengeId: ch.id, expiresInSec: OTP_TTL_MS / 1000, sentTo: maskPhone(phone) }
  }

  async verify(phone: string, code: string, purposes: OtpPurpose[], challengeId?: string) {
    const ch = await this.prisma.otpChallenge.findFirst({
      where: { phone, purpose: { in: purposes }, consumedAt: null, ...(challengeId ? { id: challengeId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    if (!ch || ch.expiresAt < new Date()) throw new AppError(400, 'OTP_EXPIRED', 'Ce code a expiré. Demandez-en un nouveau.')
    if (ch.attempts >= MAX_ATTEMPTS) throw new AppError(400, 'OTP_LOCKED', 'Trop d’essais. Demandez un nouveau code.')
    const a = Buffer.from(ch.codeHash, 'hex')
    const b = Buffer.from(this.hash(phone, code), 'hex')
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
