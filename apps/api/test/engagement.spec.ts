import request from 'supertest'
import { bearer, bootApp, buildWorld, newPhone } from './helpers'

type Boot = Awaited<ReturnType<typeof bootApp>>
type World = Awaited<ReturnType<typeof buildWorld>>

/** Prochain jour donné (0 = dimanche) à 10:00 heure de Douala, au moins 1 h dans le futur. */
function nextWeekday(dow: number) {
  const d = new Date()
  d.setUTCHours(9, 0, 0, 0)
  while (d.getUTCDay() !== dow || d.getTime() < Date.now() + 3600_000) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

describe('Parcours 3 — compléments de l’app fidèle', () => {
  let t: Boot
  let w: World
  let pastor: { id: string }

  beforeAll(async () => {
    t = await bootApp()
    w = await buildWorld(t.prisma)
    await t.prisma.structure.update({ where: { id: w.parish.id }, data: { address: 'Rue du Temple', serviceSchedule: 'Dimanche 10:00' } })
    let role = await t.prisma.role.findFirst({ where: { key: 'pastor', confessionId: null } })
    role ??= await t.prisma.role.create({ data: { key: 'pastor', label: 'Pasteur', levelKey: 'paroisse', permissions: { create: [{ module: 'MEMBERS', canRead: true, canWrite: true, canValidate: true }] } } })
    pastor = await t.prisma.user.create({ data: { phone: newPhone(), fullName: 'Paul Ndoumbe', email: `pasteur.${Date.now()}@example.org` } })
    await t.prisma.roleAssignment.create({ data: { userId: pastor.id, roleId: role.id, structureId: w.parish.id, title: 'Pasteur' } })
  })
  afterAll(() => t.app.close())

  const as = (id: string) => bearer(t.tokens, id)

  it('« Ma chapelle » : hiérarchie, adresse, horaire et responsables', async () => {
    const r = await request(t.server).get('/api/me/church').set(as(w.member.id)).expect(200)
    expect(r.body.status).toBe('ACTIVE')
    expect(r.body.hierarchy.map((h: { name: string }) => h.name)).toEqual([w.confNode.name, 'Paroisse A'])
    expect(r.body.structure).toEqual(expect.objectContaining({ name: 'Paroisse A', address: 'Rue du Temple', serviceSchedule: 'Dimanche 10:00' }))
    expect(r.body.leaders).toEqual([{ name: 'Pasteur Paul Ndoumbe', title: 'Pasteur' }])
  })

  describe('groupes', () => {
    let choir: { id: string }
    let closed: { id: string }
    let foreign: { id: string }

    beforeAll(async () => {
      choir = await t.prisma.group.create({ data: { structureId: w.chapel.id, confessionId: w.confession.id, name: 'Chorale', kind: 'choir', description: 'Répétition mer. 18:00' } })
      closed = await t.prisma.group.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, name: 'Conseil', kind: 'committee', openToJoin: false } })
      foreign = await t.prisma.group.create({ data: { structureId: w.other.id, confessionId: w.confession.id, name: 'Jeunesse B', kind: 'youth' } })
    })

    it('liste les groupes de la paroisse et de ses chapelles, pas ceux d’une autre paroisse', async () => {
      const r = await request(t.server).get('/api/groups').set(as(w.member.id)).expect(200)
      const ids = r.body.map((g: { id: string }) => g.id)
      expect(ids).toEqual(expect.arrayContaining([choir.id, closed.id]))
      expect(ids).not.toContain(foreign.id)
      expect(r.body.find((g: { id: string }) => g.id === choir.id)).toEqual(expect.objectContaining({ memberCount: 0, myStatus: null, structure: 'Chapelle A1' }))
    })

    it('une demande reste en attente jusqu’à la validation du pasteur, qui la voit dans sa liste', async () => {
      const j = await request(t.server).post(`/api/groups/${choir.id}/join`).set(as(w.member.id)).expect(200)
      expect(j.body).toEqual({ myStatus: 'PENDING' })
      // Second appui : pas de doublon, toujours en attente
      await request(t.server).post(`/api/groups/${choir.id}/join`).set(as(w.member.id)).expect(200)

      const list = await request(t.server).get('/api/admin/group-requests').set(as(pastor.id)).expect(200)
      expect(list.body).toEqual([expect.objectContaining({ groupId: choir.id, userId: w.member.id, fullName: 'Fidèle Test' })])
      // Elle remonte aussi dans la file « À traiter » de son tableau de bord (espace responsable de l'app)
      const dash = await request(t.server).get('/api/admin/dashboard').set(as(pastor.id)).expect(200)
      expect(dash.body.queue).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'GROUP', id: `${choir.id}:${w.member.id}`, actions: ['approve', 'reject'] })]))

      // Un responsable d'une autre paroisse ne la voit pas et ne peut pas la valider
      await request(t.server).post(`/api/admin/group-requests/${choir.id}/${w.member.id}/approve`).set(as(w.outsider.id)).expect(403)

      await request(t.server).post(`/api/admin/group-requests/${choir.id}/${w.member.id}/approve`).set(as(pastor.id)).expect(200)
      await request(t.server).post(`/api/admin/group-requests/${choir.id}/${w.member.id}/approve`).set(as(pastor.id)).expect(409)
      const after = await request(t.server).get('/api/groups').set(as(w.member.id)).expect(200)
      expect(after.body.find((g: { id: string }) => g.id === choir.id)).toEqual(expect.objectContaining({ myStatus: 'ACTIVE', memberCount: 1 }))
      const notif = await t.prisma.notification.findFirst({ where: { userId: w.member.id, title: 'Bienvenue dans le groupe' } })
      expect(notif).not.toBeNull()
    })

    it('refuse un groupe fermé, un groupe hors de la paroisse et un rattachement en attente', async () => {
      await request(t.server).post(`/api/groups/${closed.id}/join`).set(as(w.member.id)).expect(403)
      await request(t.server).post(`/api/groups/${foreign.id}/join`).set(as(w.member.id)).expect(404)
      const newcomer = await t.prisma.user.create({ data: { phone: newPhone(), fullName: 'Nouveau Venu' } })
      await t.prisma.membership.create({ data: { userId: newcomer.id, structureId: w.parish.id, confessionId: w.confession.id, status: 'PENDING' } })
      const r = await request(t.server).post(`/api/groups/${choir.id}/join`).set(as(newcomer.id)).expect(403)
      expect(r.body.code).toBe('MEMBERSHIP_PENDING')
    })

    it('quitter un groupe retire l’adhésion', async () => {
      await request(t.server).delete(`/api/groups/${choir.id}/membership`).set(as(w.member.id)).expect(200)
      const r = await request(t.server).get('/api/groups').set(as(w.member.id)).expect(200)
      expect(r.body.find((g: { id: string }) => g.id === choir.id).myStatus).toBeNull()
    })
  })

  describe('« Je participe »', () => {
    it('enregistre compétences et jours, et compte les activités ouvertes ces jours-là', async () => {
      const wed = nextWeekday(3)
      const thu = nextWeekday(4)
      const ev = (title: string, startsAt: Date, registrationOpen = true) =>
        t.prisma.event.create({ data: { title, startsAt, place: 'Temple', structureId: w.parish.id, confessionId: w.confession.id, status: 'PUBLISHED', registrationOpen, createdById: w.member.id } })
      await ev('Nettoyage du temple', wed)
      await ev('Répétition', wed, false)
      await ev('Visite des malades', thu)

      const empty = await request(t.server).get('/api/me/volunteer').set(as(w.member.id)).expect(200)
      expect(empty.body).toEqual({ skills: [], days: [], updatedAt: null, openActivities: 0 })

      const r = await request(t.server).put('/api/me/volunteer').set(as(w.member.id)).send({ skills: ['chant', 'enseignement', 'chant'], days: ['mer', 'sam'] }).expect(200)
      expect(r.body).toEqual(expect.objectContaining({ skills: ['chant', 'enseignement'], days: ['mer', 'sam'], openActivities: 1 }))

      await request(t.server).put('/api/me/volunteer').set(as(w.member.id)).send({ skills: ['plongee'], days: [] }).expect(400)
      await request(t.server).put('/api/me/volunteer').set(as(w.member.id)).send({ skills: [], days: [], extra: 1 }).expect(400)
    })
  })

  describe('bénévolat et « Mon engagement »', () => {
    it('se proposer sur une action sociale, puis la retrouver avec ses dons de l’année', async () => {
      const social = await t.prisma.project.create({
        data: { code: `CEPCA-${w.confession.code}-PAR001-SOC0001`, kind: 'SOCIAL', confessionId: w.confession.id, structureId: w.parish.id, title: 'Familles déplacées', description: 'Soutien', goalAmount: 500_000, collectOpen: true, status: 'FUNDING' },
      })
      await request(t.server).post(`/api/projects/${social.id}/volunteer`).set(as(w.member.id)).expect(200)
      await request(t.server).post(`/api/projects/${social.id}/volunteer`).set(as(w.member.id)).expect(200)
      // Un projet d'une autre paroisse n'est pas visible
      const foreign = await t.prisma.project.create({ data: { code: `CEPCA-${w.confession.code}-PAR002-PROJ0009`, confessionId: w.confession.id, structureId: w.other.id, title: 'Ailleurs', description: '-', status: 'FUNDING' } })
      await request(t.server).post(`/api/projects/${foreign.id}/volunteer`).set(as(w.member.id)).expect(404)

      const mine = await request(t.server).get('/api/me/volunteering').set(as(w.member.id)).expect(200)
      expect(mine.body).toEqual([social.id])

      const type = await t.prisma.contributionType.findFirstOrThrow({ where: { confessionId: w.confession.id, key: 'projet' } })
      const give = (amount: number, status: 'SUCCEEDED' | 'FAILED', confirmedAt: Date | null) =>
        t.prisma.contribution.create({
          data: { idempotencyKey: `k${Math.random()}`, confessionId: w.confession.id, structureId: w.parish.id, projectId: w.project.id, typeId: type.id, userId: w.member.id, amount, net: amount, totalCharged: amount, channel: 'MTN_MOMO', status, confirmedAt },
        })
      await give(50_000, 'SUCCEEDED', new Date())
      await give(20_000, 'SUCCEEDED', new Date())
      await give(99_000, 'FAILED', null)
      await give(7_000, 'SUCCEEDED', new Date('2020-06-01T10:00:00Z'))

      const r = await request(t.server).get('/api/me/engagement').set(as(w.member.id)).expect(200)
      expect(r.body.givenThisYear).toBe(70_000)
      expect(r.body.projects.map((x: { project: { id: string }; given: number; volunteer: boolean }) => [x.project.id, x.given, x.volunteer])).toEqual([
        [w.project.id, 70_000, false],
        [social.id, 0, true],
      ])
      expect(r.body.projects[1].project.kind).toBe('SOCIAL')

      await request(t.server).delete(`/api/projects/${social.id}/volunteer`).set(as(w.member.id)).expect(200)
      const again = await request(t.server).get('/api/me/engagement').set(as(w.member.id)).expect(200)
      expect(again.body.projects.map((x: { project: { id: string } }) => x.project.id)).toEqual([w.project.id])
    })
  })

  describe('recherche', () => {
    beforeAll(async () => {
      await t.prisma.spiritualContent.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, mediaType: 'AUDIO', title: 'Zéphyr : demeurer dans la vigne', speaker: 'Pasteur Ndoumbe', durationSec: 2280, status: 'PUBLISHED', publishedAt: new Date(), createdById: w.member.id } })
      await t.prisma.spiritualContent.create({ data: { structureId: w.other.id, confessionId: w.confession.id, mediaType: 'AUDIO', title: 'Zéphyr : autre paroisse', status: 'PUBLISHED', publishedAt: new Date(), createdById: w.member.id } })
      await t.prisma.spiritualContent.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, mediaType: 'AUDIO', title: 'Zéphyr : brouillon', status: 'DRAFT', createdById: w.member.id } })
      await t.prisma.document.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, category: 'Méditations', title: 'Zéphyr du mois', fileKey: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1000, visibility: 'MEMBERS', createdById: w.member.id } })
    })

    it('cherche dans les contenus visibles du fidèle, sans tenir compte de la casse', async () => {
      const r = await request(t.server).get('/api/feed/search').query({ q: 'zéphyr' }).set(as(w.member.id)).expect(200)
      const titles = r.body.map((x: { title: string }) => x.title)
      expect(titles).toEqual(expect.arrayContaining(['Zéphyr : demeurer dans la vigne', 'Zéphyr du mois']))
      expect(titles).not.toContain('Zéphyr : autre paroisse')
      expect(titles).not.toContain('Zéphyr : brouillon')
      const sermon = r.body.find((x: { category: string }) => x.category === 'SERMON')
      expect(sermon.meta).toBe('Pasteur Ndoumbe · 38 min')
      expect(sermon.href).toMatch(/^\/app\/predications\//)
    })

    it('filtre par catégorie, et sans session ne montre pas les documents réservés', async () => {
      const r = await request(t.server).get('/api/feed/search').query({ q: 'Zéphyr', cat: 'DOCUMENT' }).set(as(w.member.id)).expect(200)
      expect(r.body.map((x: { category: string }) => x.category)).toEqual(['DOCUMENT'])
      const anon = await request(t.server).get('/api/feed/search').query({ q: 'Zéphyr', cat: 'DOCUMENT' }).expect(200)
      expect(anon.body).toEqual([])
      const paroisse = await request(t.server).get('/api/feed/search').query({ q: 'paroisse a', cat: 'STRUCTURE' }).set(as(w.member.id)).expect(200)
      expect(paroisse.body.map((x: { title: string }) => x.title)).toEqual(['Paroisse A'])
    })

    it('ignore les accents, et prend « % » et « _ » au pied de la lettre', async () => {
      const r = await request(t.server).get('/api/feed/search').query({ q: 'ZEPHYR du' }).set(as(w.member.id)).expect(200)
      expect(r.body.map((x: { title: string }) => x.title)).toEqual(['Zéphyr du mois'])
      const pct = await request(t.server).get('/api/feed/search').query({ q: '%%' }).set(as(w.member.id)).expect(200)
      expect(pct.body).toEqual([])
      const under = await request(t.server).get('/api/feed/search').query({ q: '__' }).set(as(w.member.id)).expect(200)
      expect(under.body).toEqual([])
    })

    it('refuse une recherche trop courte ou une catégorie inconnue', async () => {
      await request(t.server).get('/api/feed/search').query({ q: 'z' }).expect(400)
      await request(t.server).get('/api/feed/search').query({ q: 'zéphyr', cat: 'AUTRE' }).expect(400)
    })
  })

  it('un type de contenu spirituel inconnu ne renvoie rien au lieu d’une erreur', async () => {
    const r = await request(t.server).get('/api/feed/sermons').query({ kind: 'INCONNU' }).set(as(w.member.id)).expect(200)
    expect(r.body).toEqual([])
  })
})
