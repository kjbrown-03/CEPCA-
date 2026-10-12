import { Injectable, Logger } from '@nestjs/common'
import webpush from 'web-push'
import type { NotificationKind, Prisma } from '@prisma/client'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { NotFound } from '../common/http'

const CHUNK = 1000

/** Écran de l'application web ouvert par une notification (mêmes noms d'écrans que la maquette). */
export function pushUrl(data: Record<string, unknown>): string {
  const id = typeof data.id === 'string' ? encodeURIComponent(data.id) : ''
  switch (data.screen) {
    case 'evt':
      return id ? `/app/agenda/${id}` : '/app/agenda'
    case 'agenda':
      return '/app/agenda'
    case 'newsD':
      return id ? `/app/actualites/${id}` : '/app/actualites'
    case 'sermD':
      return id ? `/app/predications/${id}` : '/app/predications'
    case 'projD':
      return id ? `/app/projets/${id}` : '/app/projets'
    case 'receipt':
      return id ? `/app/contribuer/recu/${id}` : '/app/contribuer/historique'
    case 'hist':
      return '/app/contribuer/historique'
    case 'docs':
      return '/app/documents'
    case 'me':
    case 'prof':
      return '/app/moi'
    default:
      return '/app/notifications'
  }
}

/**
 * Notifications push : Web Push (VAPID) pour l'application web installée, Expo Push pour une app native.
 * Sans clés VAPID (développement), l'envoi web est simulé dans le journal.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger('Push')
  private readonly vapid = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

  constructor(private readonly prisma: PrismaService) {
    if (this.vapid) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  }

  /** Renvoie le nombre de messages remis. Un échec n'interrompt jamais l'action qui l'a déclenché. */
  async send(userIds: string[], title: string, body: string, data: Record<string, unknown>): Promise<number> {
    if (userIds.length === 0) return 0
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true, platform: true, p256dh: true, auth: true } })
    if (tokens.length === 0) return 0
    const web = tokens.filter((t) => t.platform === 'web' && t.p256dh && t.auth)
    const expo = tokens.filter((t) => t.platform !== 'web')
    return (await this.sendWeb(web, title, body, data)) + (await this.sendExpo(expo.map((t) => t.token), title, body, data))
  }

  private async sendWeb(subs: Array<{ token: string; p256dh: string | null; auth: string | null }>, title: string, body: string, data: Record<string, unknown>): Promise<number> {
    if (subs.length === 0) return 0
    if (!this.vapid) {
      // Ne jamais écrire le contenu d'une notification dans les journaux.
      this.log.log(`Envoi Web Push simulé pour ${subs.length} navigateur(s)`)
      return subs.length
    }
    const payload = JSON.stringify({ title, body, url: pushUrl(data), tag: typeof data.id === 'string' ? data.id : undefined })
    const gone: string[] = []
    let sent = 0
    // Par paquets de 50 : un service push lent ne bloque pas tout l'envoi
    for (let i = 0; i < subs.length; i += 50) {
      const batch = subs.slice(i, i + 50)
      const results = await Promise.allSettled(
        batch.map((s) => webpush.sendNotification({ endpoint: s.token, keys: { p256dh: s.p256dh!, auth: s.auth! } }, payload, { TTL: 24 * 3600, timeout: 10_000 })),
      )
      results.forEach((r, j) => {
        if (r.status === 'fulfilled') sent++
        else {
          const code = (r.reason as { statusCode?: number }).statusCode
          // 404 / 410 : l'abonnement n'existe plus (application désinstallée, autorisation retirée)
          if (code === 404 || code === 410) gone.push(batch[j].token)
          else this.log.warn(`Web Push refusé (${code ?? 'réseau'})`)
        }
      })
    }
    if (gone.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: gone } } })
    return sent
  }

  private async sendExpo(tokens: string[], title: string, body: string, data: Record<string, unknown>): Promise<number> {
    if (tokens.length === 0) return 0
    if (env.EXPO_PUSH !== '1') {
      this.log.log(`Envoi Expo Push simulé pour ${tokens.length} appareil(s)`)
      return tokens.length
    }
    let sent = 0
    // Expo accepte 100 messages par requête
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100).map((to) => ({ to, title, body, data, sound: 'default' }))
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) sent += batch.length
        else this.log.warn(`Expo Push a répondu ${res.status}`)
      } catch (e) {
        this.log.warn(`Expo Push injoignable : ${(e as Error).message}`)
      }
    }
    return sent
  }
}

@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Destinataires d'un contenu ciblé (§14) : fidèles actifs rattachés au nœud ou à un descendant,
   * plus les responsables en poste sur ce sous-arbre. Ciblage d'un groupe : ses membres actifs.
   */
  async where(targetStructureId: string, groupId?: string | null): Promise<Prisma.UserWhereInput> {
    if (groupId) return { status: 'ACTIVE', groupMemberships: { some: { groupId, status: 'ACTIVE' } } }
    const s = await this.prisma.structure.findUnique({ where: { id: targetStructureId }, select: { path: true } })
    if (!s) throw NotFound('Structure')
    const under = { path: { startsWith: s.path } }
    return {
      status: 'ACTIVE',
      OR: [{ memberships: { some: { status: 'ACTIVE', structure: under } } }, { roleAssignments: { some: { revokedAt: null, structure: under } } }],
    }
  }

  async count(targetStructureId: string, groupId?: string | null) {
    return this.prisma.user.count({ where: await this.where(targetStructureId, groupId) })
  }

  async users(targetStructureId: string, groupId?: string | null) {
    return this.prisma.user.findMany({ where: await this.where(targetStructureId, groupId), select: { id: true, email: true } })
  }

  /** Boîte de réception de l'app, par paquets. */
  async inbox(userIds: string[], n: { kind: NotificationKind; title: string; body: string; link?: Prisma.InputJsonValue; campaignId?: string }) {
    for (let i = 0; i < userIds.length; i += CHUNK) {
      await this.prisma.notification.createMany({ data: userIds.slice(i, i + CHUNK).map((userId) => ({ userId, ...n })) })
    }
  }

  /** Groupe ciblable depuis une structure : il doit appartenir à ce nœud ou à son sous-arbre. */
  async assertGroup(groupId: string, targetPath: string) {
    const g = await this.prisma.group.findUnique({ where: { id: groupId }, select: { structure: { select: { path: true } } } })
    if (!g || !g.structure.path.startsWith(targetPath)) throw NotFound('Groupe')
  }
}
