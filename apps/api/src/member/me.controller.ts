import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import { attachSchema, updateProfileSchema, type AttachInput, type MeDto, type MembershipOptionDto, type ConfessionDto } from '@cepca/shared'
import { AppError, NotFound, Public, ZodPipe } from '../common/http'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { CurrentUser } from '../auth/auth.guard'
import { ancestorPaths, type Principal } from '../access/access.service'
import { mediaUrl } from '../storage/storage.service'

@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  async me(@CurrentUser() p: Principal): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: p.userId } })
    const unread = await this.prisma.notification.count({ where: { userId: p.userId, readAt: null, deletedAt: null } })
    let membership: MeDto['membership'] = null
    if (p.membership) {
      const chain = await this.prisma.structure.findMany({
        where: { path: { in: ancestorPaths(p.membership.path) } },
        select: { id: true, name: true, depth: true, levelType: { select: { key: true, name: true, rank: true } }, confession: { select: { id: true, code: true, name: true } } },
        orderBy: { depth: 'asc' },
      })
      const own = chain[chain.length - 1]
      const conf = chain.find((s) => s.levelType.rank === 1)
      membership = {
        status: p.membership.status as NonNullable<MeDto['membership']>['status'],
        structure: { id: own.id, name: own.name, level: own.levelType.name, levelKey: own.levelType.key },
        hierarchy: chain.filter((s) => s.levelType.rank >= 1).map((s) => ({ id: s.id, name: s.name, level: s.levelType.name, levelKey: s.levelType.key })),
        confession: { id: conf?.confession?.id ?? '', code: conf?.confession?.code ?? '', name: conf?.confession?.name ?? '' },
      }
    }
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      residence: user.residence,
      countryCode: user.countryCode,
      locale: user.locale,
      timezone: user.timezone,
      membership,
      roles: p.assignments.map((a) => ({
        assignmentId: a.id,
        roleKey: a.roleKey,
        label: a.title ?? a.roleLabel,
        structure: { id: a.structureId, name: a.structureName, level: a.levelName, levelKey: a.levelKey },
      })),
      unreadNotifications: unread,
    }
  }

  @Patch('me')
  async update(@CurrentUser() p: Principal, @Body(new ZodPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>) {
    await this.prisma.user.update({ where: { id: p.userId }, data: body })
    return this.me(p)
  }

  /** Rattachement à une paroisse ou une chapelle : en attente jusqu'à la validation du pasteur. */
  @Post('me/membership')
  async attach(@CurrentUser() p: Principal, @Body(new ZodPipe(attachSchema)) body: AttachInput) {
    const s = await this.prisma.structure.findUnique({ where: { id: body.structureId }, include: { levelType: true } })
    if (!s || !s.confessionId || !s.levelType.isMembership || s.status === 'SUSPENDED') throw NotFound('Paroisse')
    if (p.membership?.status === 'ACTIVE') {
      throw new AppError(409, 'ALREADY_MEMBER', 'Vous êtes déjà rattaché à une paroisse. Demandez un transfert à votre pasteur.')
    }
    await this.prisma.$transaction(async (tx) => {
      // Une demande en attente peut être corrigée : l'ancienne est remplacée
      await tx.membership.updateMany({ where: { userId: p.userId, status: 'PENDING' }, data: { status: 'REJECTED', endedAt: new Date(), note: 'Remplacée par une nouvelle demande' } })
      await tx.membership.create({ data: { userId: p.userId, structureId: s.id, confessionId: s.confessionId!, status: 'PENDING' } })
      await tx.user.update({ where: { id: p.userId }, data: { residence: body.residence, countryCode: body.countryCode ?? null, consentAt: new Date() } })
      await tx.notification.create({
        data: { userId: p.userId, kind: 'MEMBERSHIP', title: 'Demande de rattachement envoyée', body: `${s.name} · en attente de validation par le pasteur`, link: { screen: 'prof' } },
      })
    })
    return { status: 'PENDING', structure: s.name }
  }
}

@Controller('directory')
@Public()
export class DirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  /** Confessions membres (inscription, portail). */
  @Get('confessions')
  async confessions(): Promise<ConfessionDto[]> {
    const rows = await this.prisma.confession.findMany({ where: { status: { in: ['ACTIVE', 'CONFIGURATION'] } }, orderBy: { code: 'asc' } })
    return rows.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      logoUrl: mediaUrl('img', c.logoKey),
      website: c.website,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      status: c.status,
    }))
  }

  /** Structures auxquelles un fidèle peut se rattacher (paroisses, chapelles), avec recherche. */
  @Get('confessions/:id/membership-options')
  async options(@Param('id') id: string, @Query('q') q?: string, @Query('level') level?: string): Promise<MembershipOptionDto[]> {
    const conf = await this.prisma.confession.findUnique({ where: { id }, select: { id: true } })
    if (!conf) throw NotFound('Confession')
    const rows = await this.prisma.structure.findMany({
      where: {
        confessionId: id,
        status: { in: ['ACTIVE', 'VACANT'] },
        levelType: { isMembership: true, ...(level ? { key: level } : {}) },
        ...(q ? { name: { contains: String(q).slice(0, 60), mode: 'insensitive' } } : {}),
      },
      select: { id: true, name: true, levelType: { select: { name: true, rank: true } }, parent: { select: { name: true } } },
      orderBy: [{ levelType: { rank: 'asc' } }, { name: 'asc' }],
      take: 50,
    })
    return rows.map((r) => ({ id: r.id, name: r.name, level: r.levelType.name, parentName: r.parent?.name ?? null }))
  }
}
