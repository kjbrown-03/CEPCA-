import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { AppError } from '../common/http'

const ACCESS_TTL_SEC = 15 * 60
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export interface AccessPayload {
  sub: string
  typ: 'access'
  /** Double authentification faite (mot de passe + code e-mail) : requise pour les fonctions des responsables */
  mfa?: boolean
}

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  signAccess(userId: string, mfa = false): string {
    return jwt.sign({ sub: userId, typ: 'access', ...(mfa ? { mfa: true } : {}) } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL_SEC,
      issuer: 'cepca-api',
    })
  }

  /** Algorithme imposé : un jeton `alg: none` ou signé autrement est refusé. */
  verifyAccess(token: string): AccessPayload | null {
    try {
      const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'cepca-api' }) as AccessPayload
      return p.typ === 'access' && typeof p.sub === 'string' ? p : null
    } catch {
      return null
    }
  }

  /** `mfa` : session ouverte par la double authentification ; elle le reste à chaque rotation. */
  async issue(userId: string, meta: { ip?: string | null; userAgent?: string | null }, opts: { family?: string; mfa?: boolean } = {}) {
    const raw = randomBytes(32).toString('base64url')
    const mfa = opts.mfa === true
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(raw),
        family: opts.family ?? randomBytes(12).toString('hex'),
        mfa,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 200) ?? null,
      },
    })
    return { accessToken: this.signAccess(userId, mfa), refreshToken: raw, expiresIn: ACCESS_TTL_SEC }
  }

  /**
   * Rotation : l'ancien jeton est révoqué et un nouveau est émis dans la même famille.
   * Réutiliser un jeton déjà tourné signale un vol : toute la famille est révoquée.
   */
  async rotate(raw: string, meta: { ip?: string | null; userAgent?: string | null }) {
    const found = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: { select: { status: true } } } })
    const invalid = new AppError(401, 'SESSION_EXPIRED', 'Votre session a expiré. Reconnectez-vous.')
    if (!found) throw invalid
    if (found.revokedAt) {
      await this.prisma.refreshToken.updateMany({ where: { family: found.family, revokedAt: null }, data: { revokedAt: new Date() } })
      throw invalid
    }
    if (found.expiresAt < new Date() || found.user.status !== 'ACTIVE') throw invalid
    const res = await this.prisma.refreshToken.updateMany({ where: { id: found.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (res.count !== 1) throw invalid // rotation concurrente
    return { userId: found.userId, tokens: await this.issue(found.userId, meta, { family: found.family, mfa: found.mfa }) }
  }

  async revoke(raw: string) {
    await this.prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } })
  }

  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  }
}
