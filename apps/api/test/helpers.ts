import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { randomBytes } from 'node:crypto'
import { AppModule } from '../src/app.module'
import { configureApp } from '../src/app.factory'
import { ConsoleSmsGateway } from '../src/auth/otp.service'
import { PrismaService } from '../src/prisma/prisma.service'
import { TokensService } from '../src/auth/tokens.service'

/** Passerelle SMS de test : garde le dernier code envoyé à chaque numéro. */
export class CapturingSms {
  readonly codes = new Map<string, string>()
  async send(phone: string, text: string) {
    const m = /code est (\d+)/.exec(text)
    if (m) this.codes.set(phone, m[1])
  }
}

export async function bootApp() {
  const sms = new CapturingSms()
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConsoleSmsGateway).useValue(sms).compile()
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: ['error'] }))
  await app.init()
  return { app, sms, prisma: app.get(PrismaService), tokens: app.get(TokensService), server: app.getHttpServer() }
}

let phoneSeq = 0
/** Numéro unique par test (les plafonds OTP sont par numéro). */
export function newPhone() {
  phoneSeq++
  return `+2376${String(Date.now()).slice(-6)}${String(phoneSeq).padStart(2, '0')}`
}

export async function ensureRoot(prisma: PrismaService) {
  const lt = await prisma.levelType.findFirst({ where: { key: 'conseil', confessionId: null } }) ?? (await prisma.levelType.create({ data: { key: 'conseil', name: 'Conseil', rank: 0 } }))
  const conf = await prisma.levelType.findFirst({ where: { key: 'confession', confessionId: null } }) ?? (await prisma.levelType.create({ data: { key: 'confession', name: 'Confession', rank: 1, parentId: lt.id } }))
  const root = await prisma.structure.findUnique({ where: { path: '/cepca/' } }) ?? (await prisma.structure.create({ data: { levelTypeId: lt.id, slug: 'cepca', path: '/cepca/', depth: 0, name: 'CEPCA', code: 'CEPCA' } }))
  return { root, confessionLevel: conf }
}

/**
 * Une confession isolée avec une paroisse, une chapelle, un fidèle actif et un projet ouvert.
 * Chaque fichier de test a la sienne : aucune donnée partagée entre specs.
 */
export async function buildWorld(prisma: PrismaService) {
  const { root, confessionLevel } = await ensureRoot(prisma)
  const slug = 't' + randomBytes(3).toString('hex')
  const code = slug.toUpperCase()
  const c = await prisma.confession.create({ data: { code, name: `Confession ${code}`, shortCode: 'CONF99', status: 'ACTIVE' } })
  const par = await prisma.levelType.create({ data: { confessionId: c.id, key: 'paroisse', name: 'Paroisse', rank: 2, isMembership: true } })
  const cha = await prisma.levelType.create({ data: { confessionId: c.id, key: 'chapelle', name: 'Chapelle', rank: 3, isMembership: true, parentId: par.id } })
  const confNode = await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: confessionLevel.id, parentId: root.id, slug, path: `/cepca/${slug}/`, depth: 1, name: code, code } })
  const parish = await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: par.id, parentId: confNode.id, slug: 'p', path: `${confNode.path}p/`, depth: 2, name: 'Paroisse A', code: 'PAR001' } })
  const other = await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: par.id, parentId: confNode.id, slug: 'q', path: `${confNode.path}q/`, depth: 2, name: 'Paroisse B', code: 'PAR002' } })
  const chapel = await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: cha.id, parentId: parish.id, slug: 'c', path: `${parish.path}c/`, depth: 3, name: 'Chapelle A1', code: 'CHA001' } })
  for (const [position, [key, label, requiresProject]] of ([['offrande', 'Offrande', false], ['dime', 'Dîme', false], ['projet', 'Projet', true]] as const).entries()) {
    await prisma.contributionType.create({ data: { confessionId: c.id, key, label, requiresProject, position } })
  }
  const member = await prisma.user.create({ data: { phone: newPhone(), fullName: 'Fidèle Test', consentAt: new Date() } })
  await prisma.membership.create({ data: { userId: member.id, structureId: parish.id, confessionId: c.id, status: 'ACTIVE' } })
  const outsider = await prisma.user.create({ data: { phone: newPhone(), fullName: 'Autre Fidèle' } })
  await prisma.membership.create({ data: { userId: outsider.id, structureId: other.id, confessionId: c.id, status: 'ACTIVE' } })
  const project = await prisma.project.create({
    data: { code: `CEPCA-${code}-PAR001-PROJ0001`, confessionId: c.id, structureId: parish.id, title: 'Forage', description: 'Un forage', goalAmount: 1_000_000, collectOpen: true, status: 'FUNDING' },
  })
  return { confession: c, confNode, parish, other, chapel, member, outsider, project }
}

export function bearer(tokens: TokensService, userId: string) {
  return { Authorization: `Bearer ${tokens.signAccess(userId)}` }
}

export const idemKey = () => randomBytes(12).toString('hex')
