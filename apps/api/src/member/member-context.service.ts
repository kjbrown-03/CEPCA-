import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ancestorPaths, type Principal } from '../access/access.service'

/**
 * Ce qu'un fidèle peut voir. Règle de diffusion (§14) : un contenu ciblant un nœud est visible
 * de tous les fidèles rattachés à ce nœud ou à l'un de ses descendants.
 */
export interface MemberContext {
  userId: string | null
  status: 'NONE' | 'PENDING' | 'ACTIVE'
  confessionId: string | null
  membershipPath: string | null
  /** Paroisse de rattachement (la paroisse parente si le fidèle est rattaché à une chapelle) */
  communityPath: string | null
  /** Chemins des nœuds dont le fidèle reçoit les contenus : CEPCA → … → sa structure */
  visiblePaths: string[]
  groupIds: string[]
}

@Injectable()
export class MemberContextService {
  constructor(private readonly prisma: PrismaService) {}

  async forPrincipal(p: Principal | null): Promise<MemberContext> {
    const root = '/cepca/'
    if (!p || !p.membership) {
      return { userId: p?.userId ?? null, status: 'NONE', confessionId: null, membershipPath: null, communityPath: null, visiblePaths: [root], groupIds: [] }
    }
    const m = p.membership
    const s = await this.prisma.structure.findUnique({
      where: { id: m.structureId },
      select: { path: true, parent: { select: { path: true, levelType: { select: { isMembership: true } } } }, levelType: { select: { key: true } } },
    })
    const path = s?.path ?? m.path
    const communityPath = s?.levelType.key === 'chapelle' && s.parent ? s.parent.path : path
    const groups =
      m.status === 'ACTIVE'
        ? await this.prisma.groupMember.findMany({ where: { userId: p.userId, status: 'ACTIVE' }, select: { groupId: true } })
        : []
    return {
      userId: p.userId,
      status: m.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING',
      confessionId: m.confessionId,
      membershipPath: path,
      communityPath,
      visiblePaths: ancestorPaths(path),
      groupIds: groups.map((g) => g.groupId),
    }
  }

  /**
   * Filtre Prisma des contenus diffusés au fidèle.
   * En attente de validation : seulement ce qui est public. Ciblage de groupe : membres actifs du groupe.
   */
  audienceWhere(ctx: MemberContext, targetField: 'target' | 'structure') {
    return {
      [targetField]: { path: { in: ctx.visiblePaths } },
      ...(ctx.status !== 'ACTIVE' ? { isPublic: true } : {}),
    }
  }

  /** Projets visibles : ceux des ancêtres (CEPCA, confession…) et ceux de la communauté et de ses chapelles. */
  projectWhere(ctx: MemberContext) {
    const ors: object[] = [{ structure: { path: { in: ctx.visiblePaths } } }]
    if (ctx.communityPath) ors.push({ structure: { path: { startsWith: ctx.communityPath } } })
    return { OR: ors }
  }
}
