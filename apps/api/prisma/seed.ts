// Jeu de démonstration calqué sur les maquettes (design_handoff_cepca/designs).
// À lancer sur une base vide : npm run db:seed (après prisma migrate reset en dev).
import { PrismaClient, type Module, type Prisma } from '@prisma/client'
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import bcrypt from 'bcryptjs'
import PDFDocument from 'pdfkit'
import { resolve } from 'node:path'

for (const f of ['.env']) {
  try {
    process.loadEnvFile(resolve(__dirname, '..', f))
  } catch {
    /* variables fournies par l'environnement */
  }
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refus : le jeu de démonstration ne se charge jamais en production.')
  process.exit(1)
}

const prisma = new PrismaClient()
/** Mot de passe commun des comptes responsables de démonstration (back-office). */
const DEMO_PASSWORD = 'Cepca-Demo-2026!'

const U = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`
const IMG = {
  fam: U('photo-1604072424771-7300bc5de457'),
  pray: U('photo-1738744655193-706236bd4480'),
  praise: U('photo-1647957902647-0337913440fc'),
  vl: U('photo-1608560938854-96a63d9214a8'),
  school: U('photo-1594386479412-fa62932f4cdc'),
  fam2: U('photo-1604072366376-63d46248927e'),
  arch: U('photo-1708267062168-38fdffccde95'),
}
/** Heure de Douala (UTC+1 toute l'année) → Date UTC */
const dla = (local: string) => new Date(`${local}+01:00`)

// ── Rôles et matrice des droits (maquette back-office, tableau MX) ──
const MODS: Module[] = ['NEWS', 'EVENTS', 'SERMONS', 'DOCUMENTS', 'MEMBERS', 'CONTRIBUTIONS', 'PROJECTS', 'REPORTS', 'USERS_ROLES', 'SETTINGS']
// C = Consulter, R = Créer/modifier, V = Valider. Colonnes : MODS. Puis modules hors matrice : structures, notifications, audit.
const ROLES: Array<{ key: string; label: string; levelKey: string | null; mx: string[]; extra: Partial<Record<Module, string>>; aggregate?: Module[] }> = [
  { key: 'cepca_admin', label: 'Administrateur CEPCA', levelKey: 'conseil', mx: ['CRV', 'CRV', 'C', 'CR', 'C', 'C', 'CRV', 'CRV', 'CRV', 'CRV'], extra: { STRUCTURES: 'CRV', NOTIFICATIONS: 'CRV', AUDIT: 'C' }, aggregate: ['MEMBERS', 'CONTRIBUTIONS'] },
  { key: 'conf_admin', label: 'Administrateur confession', levelKey: 'confession', mx: ['CRV', 'CRV', 'CRV', 'CRV', 'CRV', 'CV', 'CRV', 'CRV', 'CRV', 'CRV'], extra: { STRUCTURES: 'CRV', NOTIFICATIONS: 'CRV', AUDIT: 'C' } },
  { key: 'synod_lead', label: 'Responsable synode', levelKey: 'synode', mx: ['CRV', 'CRV', 'CR', 'CR', 'CRV', 'C', 'CRV', 'CR', 'CR', ''], extra: { STRUCTURES: 'C', NOTIFICATIONS: 'CR' } },
  { key: 'consistory_lead', label: 'Responsable consistoire', levelKey: 'consistoire', mx: ['CRV', 'CRV', 'CR', 'CR', 'CRV', 'C', 'CRV', 'CR', 'CR', ''], extra: { STRUCTURES: 'C', NOTIFICATIONS: 'CR' } },
  { key: 'pastor', label: 'Pasteur de paroisse', levelKey: 'paroisse', mx: ['CRV', 'CRV', 'CRV', 'CRV', 'CRV', 'C', 'CRV', 'CR', 'CR', ''], extra: { STRUCTURES: 'C', NOTIFICATIONS: 'CRV' } },
  { key: 'chapel_lead', label: 'Responsable chapelle', levelKey: 'chapelle', mx: ['CR', 'CR', 'C', 'C', 'CR', 'C', 'C', 'C', '', ''], extra: {} },
  { key: 'finance', label: 'Responsable financier', levelKey: 'paroisse', mx: ['C', 'C', '', 'C', 'C', 'CRV', 'C', 'CR', '', ''], extra: { AUDIT: 'C' } },
  { key: 'project', label: 'Responsable projet', levelKey: 'paroisse', mx: ['CR', 'C', '', 'CR', 'C', 'C', 'CR', 'C', '', ''], extra: {} },
  { key: 'communication', label: 'Responsable communication', levelKey: 'paroisse', mx: ['CR', 'CR', 'CR', 'CR', 'C', '', 'C', 'C', '', ''], extra: { NOTIFICATIONS: 'CR' } },
  { key: 'youth', label: 'Responsable jeunesse', levelKey: 'paroisse', mx: ['CR', 'CR', 'C', 'C', 'C', '', 'C', '', '', ''], extra: {} },
]

function perms(r: (typeof ROLES)[number]): Prisma.RolePermissionCreateManyRoleInput[] {
  const cells = new Map<Module, string>()
  MODS.forEach((m, i) => r.mx[i] && cells.set(m, r.mx[i]))
  for (const [m, v] of Object.entries(r.extra)) if (v) cells.set(m as Module, v)
  return [...cells].map(([module, v]) => ({
    module,
    canRead: v.includes('C'),
    canWrite: v.includes('R'),
    canValidate: v.includes('V'),
    aggregateOnly: r.aggregate?.includes(module) ?? false,
  }))
}

// ── Stockage : quelques PDF de démonstration (ignorés si MinIO ne répond pas) ──
function demoPdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((ok, ko) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const parts: Buffer[] = []
    doc.on('data', (c: Buffer) => parts.push(c))
    doc.on('end', () => ok(Buffer.concat(parts)))
    doc.on('error', ko)
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1f5a36').text(title)
    doc.moveDown().font('Helvetica').fontSize(11).fillColor('#1c2a21')
    for (const l of lines) doc.text(l).moveDown(0.6)
    doc.end()
  })
}

async function upload(key: string, body: Buffer, type: string): Promise<boolean> {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9100',
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
  })
  const Bucket = process.env.S3_BUCKET ?? 'cepca-media'
  try {
    await s3.send(new HeadBucketCommand({ Bucket })).catch(() => s3.send(new CreateBucketCommand({ Bucket })))
    await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: type }))
    return true
  } catch (e) {
    console.warn(`  stockage indisponible (${(e as Error).message}) : ${key} non déposé`)
    return false
  }
}

async function main() {
  if (await prisma.structure.findFirst({ where: { path: '/cepca/' } })) {
    console.error('La base contient déjà des données. En dev : npx prisma migrate reset (relance le seed).')
    process.exit(1)
  }

  // ── Niveaux ──
  const conseil = await prisma.levelType.create({ data: { key: 'conseil', name: 'Conseil', rank: 0 } })
  const confession = await prisma.levelType.create({ data: { key: 'confession', name: 'Confession', rank: 1, parentId: conseil.id } })

  const root = await prisma.structure.create({
    data: { levelTypeId: conseil.id, slug: 'cepca', path: '/cepca/', depth: 0, name: 'CEPCA', code: 'CEPCA', city: 'Douala', email: 'contact@cepca.org' },
  })

  // ── Confessions membres ──
  const CONFS: Array<[string, string, string, 'ACTIVE' | 'CONFIGURATION']> = [
    ['EEC', 'Église Évangélique du Cameroun', 'eec', 'ACTIVE'],
    ['EPC', 'Église Presbytérienne Camerounaise', 'epc', 'ACTIVE'],
    ['PCC', 'Presbyterian Church in Cameroon', 'pcc', 'ACTIVE'],
    ['UEBC', 'Union des Églises Baptistes du Cameroun', 'uebc', 'ACTIVE'],
    ['EELC', 'Église Évangélique Luthérienne au Cameroun', 'eelc', 'CONFIGURATION'],
    ['CBC', 'Cameroon Baptist Convention', 'cbc', 'ACTIVE'],
  ]
  const conf: Record<string, { id: string; structureId: string; path: string; levels: Record<string, string> }> = {}
  for (const [i, [code, name, slug, status]] of CONFS.entries()) {
    const c = await prisma.confession.create({ data: { code, name, shortCode: `CONF${String(i + 1).padStart(2, '0')}`, status, description: `${name}, confession membre du CEPCA.` } })
    const s = await prisma.structure.create({
      data: { confessionId: c.id, levelTypeId: confession.id, parentId: root.id, slug, path: `/cepca/${slug}/`, depth: 1, name: `${name} (${code})`, code, status },
    })
    // Hiérarchie propre à chaque confession (§7) : l'EEC à 4 niveaux, les autres à 2 pour la démonstration
    const defs = code === 'EEC'
      ? [['synode', 'Synode', false], ['consistoire', 'Consistoire', false], ['paroisse', 'Paroisse', true], ['chapelle', 'Chapelle', true]]
      : [['region', code === 'PCC' ? 'Presbytery' : 'Région', false], ['paroisse', code === 'PCC' ? 'Congregation' : 'Paroisse', true]]
    const levels: Record<string, string> = {}
    let parentId = confession.id
    for (const [r, [key, label, isMembership]] of defs.entries()) {
      const lt = await prisma.levelType.create({ data: { confessionId: c.id, key: key as string, name: label as string, rank: r + 2, parentId, isMembership: isMembership as boolean } })
      levels[key as string] = lt.id
      parentId = lt.id
    }
    conf[code] = { id: c.id, structureId: s.id, path: s.path, levels }
    for (const [pos, [key, label, requiresProject]] of ([['offrande', 'Offrande', false], ['dime', 'Dîme', false], ['projet', 'Projet', true], ['oeuvre_sociale', 'Œuvre sociale', false]] as const).entries()) {
      await prisma.contributionType.create({ data: { confessionId: c.id, key, label, requiresProject, position: pos } })
    }
  }

  // ── Arbre de l'EEC (maquette back-office, TREE) ──
  const eec = conf.EEC
  const nodes: Record<string, { id: string; path: string }> = { cepca: { id: root.id, path: root.path }, eec: { id: eec.structureId, path: eec.path } }
  let parCode = 10
  async function node(slug: string, parent: string, level: string, name: string, extra: Partial<Prisma.StructureUncheckedCreateInput> = {}) {
    const p = nodes[parent]
    const depth = p.path.split('/').filter(Boolean).length
    const code = level === 'paroisse' ? `PAR${String(++parCode).padStart(3, '0')}` : level === 'chapelle' ? `CHA${String(++parCode).padStart(3, '0')}` : slug.toUpperCase()
    const s = await prisma.structure.create({
      data: { confessionId: eec.id, levelTypeId: eec.levels[level], parentId: p.id, slug, path: `${p.path}${slug}/`, depth, name, code, city: 'Douala', ...extra },
    })
    nodes[slug] = { id: s.id, path: s.path }
    return s
  }
  await node('lit', 'eec', 'synode', 'Synode du Littoral')
  await node('cen', 'eec', 'synode', 'Synode du Centre', { city: 'Yaoundé' })
  await node('dia', 'eec', 'synode', 'Synode Diaspora', { city: 'Paris', timezone: 'Europe/Paris' })
  await node('dc', 'lit', 'consistoire', 'Consistoire Douala-Centre')
  await node('dn', 'lit', 'consistoire', 'Consistoire Douala-Nord')
  await node('ede', 'lit', 'consistoire', "Consistoire d'Édéa", { city: 'Édéa' })
  parCode = 14 // Deïdo = PAR015, comme l'identifiant de projet de la maquette
  await node('dei', 'dc', 'paroisse', 'Paroisse de Deïdo', { address: 'Temple de Deïdo', serviceSchedule: 'Dimanche 10:00', phone: '+237233421100' })
  await node('akw', 'dc', 'paroisse', "Paroisse d'Akwa", { address: "Temple d'Akwa", serviceSchedule: 'Dimanche 9:30' })
  await node('bep', 'dc', 'paroisse', 'Paroisse de Bépanda', { serviceSchedule: 'Dimanche 10:00' })
  await node('nbl', 'dc', 'paroisse', 'Paroisse de New-Bell', { serviceSchedule: 'Dimanche 9:00' })
  await node('bal', 'dc', 'paroisse', 'Paroisse de Bali', { status: 'VACANT' })
  await node('bon', 'dei', 'chapelle', 'Chapelle de Bonamoussadi', { serviceSchedule: 'Dimanche 8:30' })
  await node('ndo', 'dei', 'chapelle', 'Chapelle de Ndogbong', { serviceSchedule: 'Dimanche 8:30' })
  await node('kot', 'dei', 'chapelle', 'Chapelle de Kotto', { status: 'VACANT' })

  // Une paroisse par autre confession, pour que l'inscription propose un choix
  const OTHER: Record<string, [string, string, string]> = {
    EPC: ['ctr', 'Région du Centre', 'Paroisse de Djoungolo'],
    PCC: ['fak', 'Fako Presbytery', 'Buea Station Congregation'],
    UEBC: ['lit', 'Région du Littoral', 'Église baptiste de Bonabéri'],
    EELC: ['ada', "Région de l'Adamaoua", 'Paroisse de Ngaoundéré'],
    CBC: ['nw', 'North West Field', 'Bamenda Baptist Church'],
  }
  for (const [code, [slug, rName, pName]] of Object.entries(OTHER)) {
    const c = conf[code]
    const levelIds = Object.values(c.levels)
    const r = await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: levelIds[0], parentId: c.structureId, slug, path: `${c.path}${slug}/`, depth: 2, name: rName, code: slug.toUpperCase() } })
    await prisma.structure.create({ data: { confessionId: c.id, levelTypeId: levelIds[1], parentId: r.id, slug: 'p1', path: `${r.path}p1/`, depth: 3, name: pName, code: 'PAR001', serviceSchedule: 'Dimanche 9:00' } })
  }

  // ── Rôles système ──
  const role: Record<string, string> = {}
  for (const r of ROLES) {
    const created = await prisma.role.create({ data: { key: r.key, label: r.label, levelKey: r.levelKey, permissions: { createMany: { data: perms(r) } } } })
    role[r.key] = created.id
  }

  // ── Utilisateurs (maquette back-office, USERS) ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12)
  const users: Record<string, string> = {}
  type Seat = { role: string; at: string; title?: string }
  const PEOPLE: Array<{ key: string; name: string; phone: string; member?: [string, 'ACTIVE' | 'PENDING']; seats?: Seat[]; diaspora?: boolean; email?: string }> = [
    { key: 'ngo', name: 'Samuel Ngo', phone: '+237699000001', seats: [{ role: 'cepca_admin', at: 'cepca', title: 'Pasteur, administrateur CEPCA' }] },
    { key: 'ekwalla', name: 'Joseph Ekwalla', phone: '+237699001122', seats: [{ role: 'conf_admin', at: 'eec', title: 'Rév., administrateur EEC' }] },
    { key: 'din', name: 'Alain Din', phone: '+237699314802', seats: [{ role: 'synod_lead', at: 'lit', title: 'Président du synode' }] },
    { key: 'mbappe', name: 'François Mbappe', phone: '+237677901266', seats: [{ role: 'consistory_lead', at: 'dc', title: 'Responsable consistoire' }] },
    { key: 'elise', name: 'Élise Moukoko', phone: '+237677123442', email: 'elise.moukoko@example.org', member: ['dei', 'ACTIVE'], seats: [{ role: 'pastor', at: 'dei', title: 'Pasteur' }] },
    { key: 'grace', name: 'Grâce Ndjock', phone: '+237699451021', member: ['dei', 'ACTIVE'], seats: [{ role: 'finance', at: 'dei', title: 'Trésorière' }] },
    { key: 'sandrine', name: 'Sandrine Njanga', phone: '+237655873209', member: ['dei', 'ACTIVE'], seats: [{ role: 'communication', at: 'dei' }] },
    { key: 'joel', name: 'Joël Mbida', phone: '+237694582037', member: ['bon', 'ACTIVE'], seats: [{ role: 'youth', at: 'dei' }] },
    { key: 'luc', name: 'Luc Njoh', phone: '+237670228134', member: ['bep', 'ACTIVE'], seats: [{ role: 'pastor', at: 'bep', title: 'Pasteur' }, { role: 'project', at: 'dei', title: 'Responsable projet' }] },
    { key: 'thomas', name: 'Thomas Ekambi', phone: '+237691045570', member: ['bon', 'ACTIVE'], seats: [{ role: 'chapel_lead', at: 'bon', title: 'Ancien' }] },
    { key: 'rose', name: 'Rose Mbella', phone: '+237678661345', member: ['ndo', 'ACTIVE'], seats: [{ role: 'chapel_lead', at: 'ndo', title: 'Ancien' }] },
    { key: 'paul', name: 'Paul Ndoumbe', phone: '+33612457890', member: ['dei', 'ACTIVE'], diaspora: true },
    { key: 'marie', name: 'Marie-Claire Essomba', phone: '+237650772118', member: ['bon', 'PENDING'] },
    { key: 'kingue', name: 'Famille Kingue', phone: '+237677540981', member: ['nbl', 'PENDING'] },
  ]
  for (const u of PEOPLE) {
    const created = await prisma.user.create({
      data: {
        phone: u.phone,
        email: u.email,
        fullName: u.name,
        passwordHash: u.seats ? hash : null,
        residence: u.diaspora ? 'DIASPORA' : 'CAMEROON',
        countryCode: u.diaspora ? 'FR' : 'CM',
        city: u.diaspora ? 'Lyon' : 'Douala',
        timezone: u.diaspora ? 'Europe/Paris' : 'Africa/Douala',
        consentAt: u.member ? new Date('2026-08-01T09:00:00Z') : null,
      },
    })
    users[u.key] = created.id
    if (u.member) {
      const [at, status] = u.member
      await prisma.membership.create({
        data: { userId: created.id, structureId: nodes[at].id, confessionId: eec.id, status, validatedAt: status === 'ACTIVE' ? new Date('2026-08-02T09:00:00Z') : null },
      })
    }
    for (const s of u.seats ?? []) {
      await prisma.roleAssignment.create({ data: { userId: created.id, roleId: role[s.role], structureId: nodes[s.at]?.id ?? conf.EEC.structureId, title: s.title, startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2029-12-31T23:00:00Z') } })
    }
  }
  // Rattachement de l'EPC pour l'administrateur de cette confession
  const abessolo = await prisma.user.create({ data: { phone: '+237677312210', fullName: 'Martin Abessolo', passwordHash: hash } })
  await prisma.roleAssignment.create({ data: { userId: abessolo.id, roleId: role.conf_admin, structureId: conf.EPC.structureId, title: 'Rév., administrateur EPC' } })

  // ── Groupes de la paroisse ──
  const groups: Record<string, string> = {}
  for (const [k, name, kind] of [['jeunesse', 'Jeunesse', 'youth'], ['chorale', 'Chorale', 'choir'], ['femmes', 'Femmes', 'women']] as const) {
    groups[k] = (await prisma.group.create({ data: { structureId: nodes.dei.id, confessionId: eec.id, name, kind } })).id
  }
  await prisma.groupMember.createMany({
    data: [
      { groupId: groups.chorale, userId: users.elise, status: 'ACTIVE' },
      { groupId: groups.jeunesse, userId: users.joel, status: 'ACTIVE' },
      { groupId: groups.femmes, userId: users.grace, status: 'ACTIVE' },
    ],
  })

  // ── Actualités (maquette MVP, NEWS) ──
  const pub = (target: string, authorKey: string, d: Omit<Prisma.PublicationUncheckedCreateInput, 'targetStructureId' | 'authorId' | 'confessionId'>) =>
    prisma.publication.create({
      data: { ...d, targetStructureId: nodes[target].id, authorId: users[authorKey], confessionId: target === 'cepca' ? null : eec.id },
    })
  await pub('dei', 'sandrine', {
    kind: 'ANNONCE',
    title: 'Semaine de prière du 5 au 9 octobre',
    imageKey: IMG.pray,
    body: 'Du lundi 5 au vendredi 9 octobre, la paroisse se réunit chaque soir à 18:30 au temple de Deïdo autour du thème « Veillez et priez ».\n\nLes veillées sont retransmises en direct dans l\'application pour les fidèles de la diaspora. Les intentions de prière peuvent être déposées auprès du conseil paroissial.',
    status: 'PUBLISHED', validatedById: users.elise, publishedAt: dla('2026-09-30T08:00:00'), readCount: 1204, notify: true,
  })
  await pub('cepca', 'ngo', {
    kind: 'COMMUNIQUE',
    title: 'Rentrée scolaire dans les écoles protestantes',
    imageKey: IMG.school,
    body: "Le Conseil rappelle que les inscriptions dans les établissements scolaires protestants restent ouvertes jusqu'au 16 octobre.\n\nLes familles en difficulté sont invitées à se rapprocher de leur paroisse.",
    status: 'PUBLISHED', validatedById: users.ngo, publishedAt: dla('2026-09-28T10:00:00'),
  })
  await pub('eec', 'ekwalla', {
    kind: 'ACTUALITE',
    title: 'Convention synodale du Littoral : inscriptions ouvertes',
    imageKey: IMG.praise,
    body: 'La convention se tiendra du 12 au 14 novembre à Douala.\n\nChaque paroisse désigne ses délégués avant le 20 octobre.',
    status: 'PUBLISHED', validatedById: users.ekwalla, publishedAt: dla('2026-09-22T09:00:00'),
  })
  await pub('dei', 'sandrine', {
    kind: 'ANNONCE',
    title: "Collecte de fournitures pour l'école de Bonamoussadi",
    imageKey: IMG.fam2,
    body: "Cahiers, stylos et sacs peuvent être déposés à la chapelle de Bonamoussadi jusqu'au 11 octobre.\n\nLes dons en argent passent par la rubrique Contribuer, type « Œuvre sociale ».",
    status: 'PUBLISHED', validatedById: users.elise, publishedAt: dla('2026-09-19T09:00:00'), readCount: 942,
  })
  await pub('dei', 'sandrine', {
    kind: 'ANNONCE',
    title: 'Répétition chorale déplacée',
    body: 'La répétition de mercredi se tiendra exceptionnellement dans la salle paroissiale.',
    groupId: groups.chorale, isPublic: false,
    status: 'PUBLISHED', validatedById: users.elise, publishedAt: dla('2026-09-24T09:00:00'), readCount: 86,
  })
  // File « À valider » du pasteur
  await pub('dei', 'sandrine', {
    kind: 'ANNONCE',
    title: "Culte d'union du 18 octobre",
    body: "Les paroisses du consistoire Douala-Centre célèbrent ensemble au temple d'Akwa. Départ groupé depuis Deïdo à 8:45.",
    status: 'SUBMITTED',
  })

  // ── Agenda d'octobre (maquette MVP, EV) ──
  const ev = (at: string, d: Omit<Prisma.EventUncheckedCreateInput, 'structureId' | 'createdById' | 'confessionId'>) =>
    prisma.event.create({ data: { ...d, structureId: nodes[at].id, confessionId: at === 'cepca' ? null : eec.id, createdById: users.sandrine, status: d.status ?? 'PUBLISHED' } })
  const culte = await ev('dei', {
    kind: 'CULTE', title: 'Culte dominical', place: 'Temple de Deïdo', isLive: true, liveUrl: 'https://www.youtube.com/@cepca', imageKey: IMG.fam,
    description: "Culte présidé par le Pasteur Élise Moukoko, avec sainte cène. Retransmis en direct dans l'application.",
    startsAt: dla('2026-10-04T10:00:00'), endsAt: dla('2026-10-04T12:00:00'), registrationOpen: true, responsible: 'Pasteur É. Moukoko',
  })
  await ev('dei', {
    kind: 'CULTE', title: "Semaine de prière (jusqu'au 9)", place: 'Temple de Deïdo', isLive: true, imageKey: IMG.pray,
    description: 'Cinq soirées de prière et de méditation autour du thème « Veillez et priez ».',
    startsAt: dla('2026-10-05T18:30:00'), endsAt: dla('2026-10-09T20:00:00'), responsible: 'Conseil paroissial',
  })
  await ev('dei', {
    kind: 'REUNION', title: 'Répétition chorale', place: 'Salle paroissiale', imageKey: IMG.praise,
    description: "Préparation du culte d'union du 18 octobre. Ouverte aux nouveaux choristes.",
    startsAt: dla('2026-10-07T18:00:00'), endsAt: dla('2026-10-07T20:00:00'), responsible: 'M. Ebelle',
  })
  await ev('cepca', {
    kind: 'JEUNESSE', title: 'Forum jeunesse inter-confessionnel', place: 'Centre CEPCA, Douala', imageKey: IMG.vl,
    description: "Ateliers d'orientation, louange et échanges entre jeunes des Églises membres.",
    startsAt: dla('2026-10-10T09:00:00'), endsAt: dla('2026-10-10T16:00:00'), registrationOpen: true, capacity: 300,
  })
  await ev('dc', {
    kind: 'CULTE', title: "Culte d'union du consistoire", place: "Temple d'Akwa", isLive: true, imageKey: IMG.arch,
    description: 'Les paroisses du consistoire Douala-Centre célèbrent ensemble.',
    startsAt: dla('2026-10-18T10:00:00'), endsAt: dla('2026-10-18T12:30:00'),
  })
  await ev('dei', { kind: 'JEUNESSE', title: 'Assemblée des jeunes', place: 'Salle paroissiale', startsAt: dla('2026-10-10T15:00:00'), status: 'DRAFT', responsible: 'S. Njanga' })
  await prisma.eventRegistration.create({ data: { eventId: culte.id, userId: users.elise } })

  // ── Prédications (maquette MVP, SE) et méditation ──
  const SE: Array<[string, string, string, number, 'VIDEO' | 'AUDIO', string, string]> = [
    ['Demeurer dans la vigne', 'Pasteur Élise Moukoko', 'Jean 15, 1-8', 38, 'VIDEO', '2026-09-27', IMG.fam],
    ['La foi qui agit', 'Rév. Alain Din', 'Jacques 2, 14-26', 41, 'AUDIO', '2026-09-20', IMG.arch],
    ['Veillez et priez', 'Pasteur Élise Moukoko', 'Matthieu 26, 36-46', 29, 'AUDIO', '2026-09-13', IMG.pray],
    ['Le bon berger', 'Rév. Joseph Ekwalla', 'Jean 10, 11-18', 35, 'VIDEO', '2026-09-06', IMG.praise],
  ]
  for (const [title, speaker, scriptureRef, min, mediaType, date, img] of SE) {
    await prisma.spiritualContent.create({
      data: {
        confessionId: eec.id, structureId: speaker.includes('Din') ? nodes.lit.id : speaker.includes('Ekwalla') ? eec.structureId : nodes.dei.id,
        kind: 'PREDICATION', mediaType, title, speaker, scriptureRef, durationSec: min * 60, imageKey: img,
        summary: `Prédication du culte du ${new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`,
        status: 'PUBLISHED', recordedAt: dla(`${date}T10:00:00`), publishedAt: dla(`${date}T15:00:00`), createdById: users.sandrine,
      },
    })
  }
  await prisma.spiritualContent.create({
    data: {
      confessionId: eec.id, structureId: nodes.dei.id, kind: 'MEDITATION', mediaType: 'TEXT', title: 'Méditation du jour : Jean 15, 1-8', scriptureRef: 'Jean 15, 1-8',
      body: 'Je suis le vrai cep, et mon Père est le vigneron. Demeurez en moi, et je demeurerai en vous.\n\nPrenons un instant aujourd’hui pour nous demander ce qui nous relie à la source.',
      durationSec: 120, status: 'PUBLISHED', publishedAt: dla('2026-10-02T06:00:00'), createdById: users.elise,
    },
  })

  // ── Documents (maquette MVP, DO) ──
  const DOCS: Array<[string, string, string, 'PUBLIC' | 'MEMBERS', string]> = [
    ["Méditations d'octobre", 'Méditations', 'doc/dei/meditations-octobre.pdf', 'MEMBERS', '2026-09-29'],
    ["Étude biblique : l'Évangile de Marc (1/6)", 'Études bibliques', 'doc/dei/etude-marc-1.pdf', 'MEMBERS', '2026-09-24'],
    ['Lettre pastorale de rentrée', 'Lettres pastorales', 'doc/dei/lettre-rentree.pdf', 'PUBLIC', '2026-09-15'],
    ["Bulletin paroissial d'octobre", 'Bulletins', 'doc/dei/bulletin-octobre.pdf', 'MEMBERS', '2026-10-01'],
  ]
  for (const [title, category, key, visibility, date] of DOCS) {
    const pdf = await demoPdf(title, ['Paroisse de Deïdo — document de démonstration.', 'Ce fichier remplace le document réel de la paroisse.'])
    await upload(key, pdf, 'application/pdf')
    await prisma.document.create({
      data: { confessionId: eec.id, structureId: nodes.dei.id, category, title, fileKey: key, mimeType: 'application/pdf', sizeBytes: pdf.length, visibility, createdById: users.sandrine, createdAt: dla(`${date}T09:00:00`) },
    })
  }

  // ── Projets (maquette MVP, PR) ──
  // Les montants mobilisés sont posés directement : ils représentent la collecte antérieure à la plateforme.
  const proj = async (code: string, d: Omit<Prisma.ProjectUncheckedCreateInput, 'code' | 'structureId' | 'confessionId'>, steps: Array<[string, boolean]>, ups: Array<[string, string]>) => {
    const p = await prisma.project.create({ data: { ...d, code, structureId: nodes.dei.id, confessionId: eec.id, responsibleId: users.luc, validatedById: users.elise, validatedAt: dla('2026-03-01T09:00:00') } })
    await prisma.projectStep.createMany({ data: steps.map(([label, done], position) => ({ projectId: p.id, position, label, done })) })
    for (const [date, title] of ups) await prisma.projectUpdate.create({ data: { projectId: p.id, title, createdById: users.luc, createdAt: dla(`${date}T09:00:00`) } })
    return p
  }
  const bepanda = await proj(
    'CEPCA-CONF01-PAR015-PROJ0007',
    { title: 'Chapelle de Bépanda', description: "Construction d'une chapelle de 400 places pour les fidèles de Bépanda, qui se réunissent aujourd'hui sous un abri provisoire.", location: 'Bépanda, Douala', beneficiaries: '400 fidèles', budget: 40e6, goalAmount: 40e6, raisedAmount: 25e6, contributorCount: 318, endsAt: dla('2027-06-30T12:00:00'), imageKey: IMG.arch, collectOpen: true, status: 'FUNDING', startsAt: dla('2026-03-01T09:00:00') },
    [['Étude et permis', true], ['Fondations', true], ['Élévation des murs', false], ['Toiture', false], ['Aménagement intérieur', false]],
    [['2026-07-12', 'Fondations achevées'], ['2026-09-28', 'Élévation des murs : 70 %']],
  )
  await proj(
    'CEPCA-CONF01-PAR015-PROJ0008',
    { title: 'Forage de Bonamoussadi', description: "Un forage d'eau potable ouvert à tout le quartier, géré par la chapelle de Bonamoussadi.", location: 'Bonamoussadi, Douala', goalAmount: 6e6, budget: 6e6, raisedAmount: 5_280_000, contributorCount: 142, endsAt: dla('2026-12-31T12:00:00'), imageKey: IMG.vl, collectOpen: true, status: 'FUNDING' },
    [['Étude du sol', true], ["Choix de l'entreprise", true], ['Forage', false], ['Mise en service', false]],
    [['2026-09-03', 'Étude du sol validée'], ['2026-09-21', "Choix de l'entreprise de forage"]],
  )
  await proj(
    'CEPCA-CONF01-PAR015-PROJ0009',
    { kind: 'SOCIAL', title: 'Soutien aux familles déplacées', description: 'Vivres, fournitures scolaires et loyers pour les familles accueillies par la paroisse.', goalAmount: 3e6, raisedAmount: 2_160_000, contributorCount: 205, endLabel: 'campagne permanente', imageKey: IMG.fam2, collectOpen: true, status: 'FUNDING' },
    [],
    [['2026-09-25', '48 familles aidées ce trimestre']],
  )
  await proj(
    'CEPCA-CONF01-PAR015-PROJ0006',
    { title: 'Bibliothèque des jeunes', description: 'Aménagement et dotation en livres de la bibliothèque de la jeunesse paroissiale.', goalAmount: 2e6, raisedAmount: 2e6, contributorCount: 96, endsAt: dla('2026-03-31T12:00:00'), status: 'COMPLETED' },
    [['Aménagement', true], ['Achat des livres', true], ['Inauguration', true]],
    [['2026-03-28', 'Bibliothèque inaugurée']],
  )

  // ── Historique de contributions d'Élise (maquette MVP, H0) ──
  const types = Object.fromEntries((await prisma.contributionType.findMany({ where: { confessionId: eec.id } })).map((t) => [t.key, t.id]))
  const plan = await prisma.recurringPlan.create({
    data: { userId: users.elise, structureId: nodes.dei.id, typeId: types.dime, amount: 25000, channel: 'MTN_MOMO', payerPhone: '+237677123442', nextRunAt: new Date('2026-11-01T05:00:00Z') },
  })
  const H0: Array<[string, string, number, string, 'MTN_MOMO' | 'ORANGE_MONEY', boolean, string | null]> = [
    ['MP2708-5519', 'dime', 25000, '2026-08-27T09:12:00', 'MTN_MOMO', true, null],
    ['MP0609-1102', 'offrande', 2000, '2026-09-06T11:40:00', 'MTN_MOMO', false, null],
    ['OM1209-0874', 'projet', 50000, '2026-09-12T18:05:00', 'ORANGE_MONEY', false, bepanda.id],
    ['MP2709-2231', 'dime', 25000, '2026-09-27T08:31:00', 'MTN_MOMO', true, null],
  ]
  for (const [i, [ref, type, amount, at, channel, rec, projectId]] of H0.entries()) {
    const fee = Math.round(amount * 0.015)
    const when = dla(at)
    await prisma.contribution.create({
      data: {
        idempotencyKey: `seed-${ref}`, confessionId: eec.id, structureId: nodes.dei.id, projectId, typeId: types[type], userId: users.elise,
        amount, fee, net: amount, totalCharged: amount + fee, channel, payerPhone: '+237677123442', status: 'SUCCEEDED',
        receiptNumber: `EEC-2026-${String(i + 1).padStart(6, '0')}`, recurringPlanId: rec ? plan.id : null, createdAt: when, confirmedAt: new Date(when.getTime() + 40_000),
        transactions: { create: { provider: channel, providerRef: ref, status: 'SUCCEEDED', providerStatus: 'SUCCESSFUL', amount: amount + fee, fee, requestedAt: when, resolvedAt: new Date(when.getTime() + 40_000) } },
      },
    })
  }
  await prisma.receiptSequence.create({ data: { confessionId: eec.id, year: 2026, last: H0.length } })

  // ── Notifications d'Élise (maquette MVP, NO) ──
  const sermon = await prisma.spiritualContent.findFirstOrThrow({ where: { title: 'Demeurer dans la vigne' } })
  const news = await prisma.publication.findFirstOrThrow({ where: { title: { startsWith: 'Semaine de prière' } } })
  await prisma.notification.createMany({
    data: [
      { userId: users.elise, kind: 'PROJECT', title: 'Le projet avance', body: 'Chapelle de Bépanda : murs à 70 %', link: { screen: 'projD', id: bepanda.id }, createdAt: dla('2026-09-26T16:00:00') },
      { userId: users.elise, kind: 'SERMON', title: 'Nouvelle prédication', body: 'Demeurer dans la vigne · 38 min', link: { screen: 'sermD', id: sermon.id }, createdAt: dla('2026-09-27T15:00:00') },
      { userId: users.elise, kind: 'RECEIPT', title: 'Reçu disponible', body: 'Dîme · 25 000 FCFA · 27 sept.', link: { screen: 'hist' }, createdAt: dla('2026-09-27T08:32:00') },
      { userId: users.elise, kind: 'ANNOUNCEMENT', title: 'Nouvelle annonce de votre paroisse', body: 'Semaine de prière du 5 au 9 octobre', link: { screen: 'newsD', id: news.id }, createdAt: dla('2026-10-01T08:00:00') },
      { userId: users.elise, kind: 'LIVE', title: 'Le culte commence dans 1 h', body: 'Culte dominical · Temple de Deïdo', link: { screen: 'evt', id: culte.id }, createdAt: dla('2026-10-02T09:00:00') },
    ],
  })

  console.log('Jeu de démonstration chargé.')
  console.log(`  Fidèle (app)      : +237 677 12 34 42 (Élise Moukoko) — code SMS affiché dans le terminal de l'API`)
  console.log(`  Back-office       : même numéro, mot de passe ${DEMO_PASSWORD} (tous les comptes responsables)`)
  console.log(`  Paiements         : bac à sable — un montant terminé par 13 échoue, par 14 expire`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
