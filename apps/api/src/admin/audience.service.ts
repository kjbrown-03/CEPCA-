import { Injectable, Logger } from '@nestjs/common'
import type { NotificationKind, Prisma } from '@prisma/client'
import { env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { NotFound } from '../common/http'

const CHUNK = 1000

/** Expo Push en production (EXPO_PUSH=1), journal en développement. */
@Injectable()
export class PushService {
  private readonly log = new Logger('Push')

  /** Renvoie le nombre de messages remis à Expo. Un échec n'interrompt jamais l'action qui l'a déclenché. */
  async send(userIds: string[], title: string, body: string, data: Record<string, unknown>): Promise<number> {
    if (userIds.length === 0) return 0
    const tokens = await this.prisma.pushToken.findMany({ where: { userId: { in: userIds } }, select: { token: true } })
    if (tokens.length === 0) return 0
    if (env.EXPO_PUSH !== '1') {
      // Ne jamais écrire le contenu d'une notification dans les journaux.
      this.log.log(`Envoi Push simulé pour ${tokens.length} appareil(s)`)
      return tokens.length
    }
    let sent = 0
    // Expo accepte 100 messages par requête
    for (let i = 0; i < tokens.length; i += 100) {
      const batch = tokens.slice(i, i + 100).map((t) => ({ to: t.token, title, body, data, sound: 'default' }))
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

  constructor(private readonly prisma: PrismaService) {}
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
