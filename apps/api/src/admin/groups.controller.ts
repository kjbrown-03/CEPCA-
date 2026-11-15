import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ClientIp, Conflict, NotFound } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import type { Principal } from '../access/access.service'
import { AdminScope, StaffGuard, actor } from './admin-common'

export interface GroupRequestDto {
  groupId: string
  groupName: string
  structure: string
  userId: string
  fullName: string
  requestedAt: string
}

/**
 * Demandes d'adhésion aux groupes envoyées depuis l'app (parcours 3). Elles relèvent du droit « Fidèles » :
 * valider une adhésion, c'est ouvrir au fidèle les contenus ciblés sur le groupe.
 */
@Controller('admin')
@UseGuards(StaffGuard)
export class AdminGroupsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AdminScope,
    private readonly audit: AuditService,
  ) {}

  @Get('group-requests')
  async list(@CurrentUser() p: Principal): Promise<GroupRequestDto[]> {
    this.scope.requireAny(p, 'MEMBERS', 'validate')
    const rows = await this.prisma.groupMember.findMany({
      where: { status: 'PENDING', group: { structure: this.scope.where(p, 'MEMBERS', 'validate') } },
      include: { group: { select: { name: true, structure: { select: { name: true } } } }, user: { select: { fullName: true } } },
      orderBy: { joinedAt: 'asc' },
      take: 100,
    })
    return rows.map((r) => ({ groupId: r.groupId, groupName: r.group.name, structure: r.group.structure.name, userId: r.userId, fullName: r.user.fullName, requestedAt: r.joinedAt.toISOString() }))
  }

  private async request(p: Principal, groupId: string, userId: string) {
    const r = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: { select: { name: true, structure: { select: { id: true, path: true } } } }, user: { select: { fullName: true } } },
    })
    if (!r) throw NotFound('Demande')
    this.scope.access.assert(p, 'MEMBERS', 'validate', r.group.structure.path, 'Demande')
    return r
  }

  @Post('group-requests/:groupId/:userId/approve')
  @HttpCode(200)
  async approve(@CurrentUser() p: Principal, @Param('groupId') groupId: string, @Param('userId') userId: string, @ClientIp() ip: string | null) {
    const r = await this.request(p, groupId, userId)
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.groupMember.updateMany({ where: { groupId, userId, status: 'PENDING' }, data: { status: 'ACTIVE' } })
      if (moved.count !== 1) throw Conflict('ALREADY_DECIDED', 'Cette demande a déjà été traitée.')
      await tx.notification.create({ data: { userId, kind: 'MEMBERSHIP', title: 'Bienvenue dans le groupe', body: `Votre adhésion à « ${r.group.name} » est validée.`, link: { screen: 'groups' } } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A validé l'adhésion de ${r.user.fullName} au groupe « ${r.group.name} »`, entityType: 'GroupMember', entityId: `${groupId}:${userId}`, structureId: r.group.structure.id, structurePath: r.group.structure.path }, tx)
      return { status: 'ACTIVE' as const }
    })
  }

  /** Refus : la demande est effacée, le fidèle peut en refaire une plus tard. */
  @Post('group-requests/:groupId/:userId/reject')
  @HttpCode(200)
  async reject(@CurrentUser() p: Principal, @Param('groupId') groupId: string, @Param('userId') userId: string, @ClientIp() ip: string | null) {
    const r = await this.request(p, groupId, userId)
    return this.prisma.$transaction(async (tx) => {
      const gone = await tx.groupMember.deleteMany({ where: { groupId, userId, status: 'PENDING' } })
      if (gone.count !== 1) throw Conflict('ALREADY_DECIDED', 'Cette demande a déjà été traitée.')
      await tx.notification.create({ data: { userId, kind: 'MEMBERSHIP', title: 'Demande non retenue', body: `Votre demande pour « ${r.group.name} » n'a pas été retenue. Adressez-vous à son responsable.`, link: { screen: 'groups' } } })
      await this.audit.record({ ...actor(p, ip), category: 'VALIDATION', action: `A refusé l'adhésion de ${r.user.fullName} au groupe « ${r.group.name} »`, entityType: 'GroupMember', entityId: `${groupId}:${userId}`, structureId: r.group.structure.id, structurePath: r.group.structure.path }, tx)
      return { status: null }
    })
  }
}
