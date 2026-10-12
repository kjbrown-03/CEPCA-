import request from 'supertest'
import type { Module } from '@prisma/client'
import { fmtFcfa, fmtInt, type AdminLoginOptionsDto, type AdminLoginStructureDto, type DashboardDto } from '@cepca/shared'
import { bearer, bootApp, buildWorld, idemKey, newEmail, newPhone } from './helpers'

type Boot = Awaited<ReturnType<typeof bootApp>>
type World = Awaited<ReturnType<typeof buildWorld>>

/** C = consulter, R = créer/modifier, V = valider, A = agrégé seulement */
async function role(prisma: Boot['prisma'], confessionId: string, key: string, cells: Partial<Record<Module, string>>) {
  return prisma.role.create({
    data: {
      confessionId,
      key,
      label: key,
      isSystem: false,
      permissions: {
        createMany: {
          data: Object.entries(cells).map(([module, v]) => ({ module: module as Module, canRead: v!.includes('C'), canWrite: v!.includes('R'), canValidate: v!.includes('V'), aggregateOnly: v!.includes('A') })),
        },
      },
    },
  })
}

async function staff(prisma: Boot['prisma'], roleId: string, structureId: string, fullName: string) {
  const user = await prisma.user.create({ data: { phone: newPhone(), email: newEmail('staff'), fullName } })
  await prisma.roleAssignment.create({ data: { userId: user.id, roleId, structureId } })
  return user
}

describe('Back-office', () => {
  let t: Boot
  let w: World
  let pastor: { id: string; email: string | null }
  let finance: { id: string; email: string | null }
  let comms: { id: string; email: string | null }
  let confAdmin: { id: string; email: string | null }
  let otherPastor: { id: string; email: string | null }
  let pastorRoleId: string
  const as = (u: { id: string }) => bearer(t.tokens, u.id)

  beforeAll(async () => {
    t = await bootApp()
    w = await buildWorld(t.prisma)
    const c = w.confession.id
    const pastorRole = await role(t.prisma, c, 'pastor', { NEWS: 'CRV', EVENTS: 'CRV', SERMONS: 'CRV', MEMBERS: 'CRV', CONTRIBUTIONS: 'C', PROJECTS: 'CRV', REPORTS: 'CR', USERS_ROLES: 'CR' })
    const financeRole = await role(t.prisma, c, 'finance', { CONTRIBUTIONS: 'CRV', PROJECTS: 'C', REPORTS: 'CR', AUDIT: 'C' })
    const commsRole = await role(t.prisma, c, 'communication', { NEWS: 'CR', EVENTS: 'CR', SERMONS: 'CR', REPORTS: 'C' })
    const confRole = await role(t.prisma, c, 'conf_admin', { NEWS: 'CRV', MEMBERS: 'CRV', CONTRIBUTIONS: 'CV', PROJECTS: 'CRV', REPORTS: 'CRV', SETTINGS: 'CRV', AUDIT: 'C', STRUCTURES: 'CRV' })
    pastorRoleId = pastorRole.id
    pastor = await staff(t.prisma, pastorRole.id, w.parish.id, 'Pasteur Test')
    finance = await staff(t.prisma, financeRole.id, w.parish.id, 'Trésorier Test')
    comms = await staff(t.prisma, commsRole.id, w.parish.id, 'Communication Test')
    confAdmin = await staff(t.prisma, confRole.id, w.confNode.id, 'Admin Confession')
    otherPastor = await staff(t.prisma, pastorRole.id, w.other.id, 'Pasteur Voisin')
  })
  afterAll(() => t.app.close())

  describe('connexion des responsables', () => {
    it('un responsable nommé définit son mot de passe par code e-mail, puis se connecte avec son rôle et sa structure', async () => {
      const email = pastor.email!
      const r1 = await request(t.server).post('/api/auth/admin/password/request').send({ email }).expect(200)
      const code = t.mail.codes.get(email)!
      expect(code).toMatch(/^\d{6}$/)
      await request(t.server).post('/api/auth/admin/password/reset').send({ challengeId: r1.body.challengeId, code, password: 'courtmdp' }).expect(400)
      await request(t.server).post('/api/auth/admin/password/reset').send({ challengeId: r1.body.challengeId, code, password: 'Paroisse-Deido-2026' }).expect(200)
      // Le code est consommé
      await request(t.server).post('/api/auth/admin/password/reset').send({ challengeId: r1.body.challengeId, code, password: 'Paroisse-Deido-2027' }).expect(400)

      // Bon mot de passe, mauvais mandat : refusé, sans code envoyé
      t.mail.codes.delete(email)
      const wrong = await request(t.server).post('/api/auth/admin/login').send({ email, password: 'Paroisse-Deido-2026', roleId: pastorRoleId, structureId: w.other.id }).expect(403)
      expect(wrong.body.code).toBe('NO_SEAT')
      expect(t.mail.codes.has(email)).toBe(false)

      // L'adresse est insensible à la casse
      const login = await request(t.server).post('/api/auth/admin/login').send({ email: email.toUpperCase(), password: 'Paroisse-Deido-2026', roleId: pastorRoleId, structureId: w.parish.id }).expect(200)
      const seat = await t.prisma.roleAssignment.findFirst({ where: { userId: pastor.id, roleId: pastorRoleId } })
      expect(login.body.assignmentId).toBe(seat!.id)
      const v = await request(t.server).post('/api/auth/admin/verify').send({ challengeId: login.body.challengeId, code: t.mail.codes.get(email) }).expect(200)
      expect(String(v.headers['set-cookie'])).toMatch(/httpOnly/i)
      const audit = await t.prisma.auditLog.findFirst({ where: { actorId: pastor.id, action: 'A défini son mot de passe' } })
      expect(audit).not.toBeNull()
    })

    it('un mauvais mot de passe ne dit rien du mandat', async () => {
      const r = await request(t.server).post('/api/auth/admin/login').send({ email: otherPastor.email, password: 'Pas-le-bon-2026', roleId: pastorRoleId, structureId: w.other.id }).expect(401)
      expect(r.body.code).toBe('BAD_CREDENTIALS')
    })

    it('une adresse inconnue ou sans mandat reçoit la même réponse, sans e-mail', async () => {
      const email = newEmail('inconnu')
      const r = await request(t.server).post('/api/auth/admin/password/request').send({ email }).expect(200)
      expect(r.body).toEqual({ challengeId: expect.any(String), sentTo: expect.any(String), expiresInSec: 600 })
      expect(t.mail.codes.has(email)).toBe(false)
      await request(t.server).post('/api/auth/admin/password/reset').send({ challengeId: r.body.challengeId, code: '123456', password: 'Paroisse-Deido-2026' }).expect(400)
      // Un simple fidèle n'a pas de mot de passe back-office
      await request(t.server).post('/api/auth/admin/password/request').send({ email: w.member.email }).expect(200)
      expect(t.mail.codes.has(w.member.email!)).toBe(false)
    })

    it('le formulaire liste les rôles, les confessions avec leurs niveaux, puis les structures en cascade', async () => {
      const o = (await request(t.server).get('/api/auth/admin/options').expect(200)).body as AdminLoginOptionsDto
      expect(o.roles.map((r) => r.id)).toContain(pastorRoleId)
      const conf = o.confessions.find((c) => c.id === w.confNode.id)!
      expect(conf.levels.map((l) => l.key)).toEqual(['paroisse', 'chapelle'])
      const kids = (await request(t.server).get('/api/auth/admin/structures').query({ parentId: w.confNode.id }).expect(200)).body as AdminLoginStructureDto[]
      expect(kids.map((k) => k.name)).toEqual(['Paroisse A', 'Paroisse B'])
      expect(kids[0].levelKey).toBe('paroisse')
      // Aucune donnée personnelle
      expect(JSON.stringify(o)).not.toContain('@')
    })
  })

  describe('nomination', () => {
    it('une personne sans compte est invitée par e-mail : nom et téléphone requis', async () => {
      const email = newEmail('nomme')
      const base = { email, roleId: pastorRoleId, structureId: w.parish.id }
      const noPhone = await request(t.server).post('/api/admin/assignments').set(as(pastor)).send({ ...base, fullName: 'Nouveau Pasteur' }).expect(400)
      expect(noPhone.body.code).toBe('PHONE_REQUIRED')
      const r = await request(t.server).post('/api/admin/assignments').set(as(pastor)).send({ ...base, fullName: 'Nouveau Pasteur', phone: newPhone() }).expect(201)
      expect(r.body.invited).toBe(true)
      const mail = t.mail.sent.findLast((m) => m.to === email)!
      expect(mail.text).toContain('/admin/mot-de-passe')
    })
  })

  describe('tableau de bord', () => {
    it('réservé aux responsables', async () => {
      await request(t.server).get('/api/admin/dashboard').set(as(w.member)).expect(403)
    })

    it('pasteur : inscription en attente dans la file, validée en un geste', async () => {
      const newcomer = await t.prisma.user.create({ data: { phone: newPhone(), fullName: 'Nouvelle Fidèle' } })
      const m = await t.prisma.membership.create({ data: { userId: newcomer.id, structureId: w.chapel.id, confessionId: w.confession.id, status: 'PENDING' } })
      const d = (await request(t.server).get('/api/admin/dashboard').set(as(pastor)).expect(200)).body as DashboardDto
      expect(d.seat.roleKey).toBe('pastor')
      expect(d.kpis.map((k) => k.label)).toEqual(['Fidèles inscrits', 'Diaspora', expect.stringMatching(/^Contributions \(/), 'Activités ce mois'])
      expect(d.chart.values).toHaveLength(6)
      expect(d.crumbs.at(-1)).toBe('Paroisse A')
      expect(d.queue).toContainEqual(expect.objectContaining({ kind: 'MEMBERSHIP', id: m.id, actions: ['approve', 'reject'] }))

      await request(t.server).post(`/api/admin/memberships/${m.id}/approve`).set(as(pastor)).send({}).expect(200)
      const after = (await request(t.server).get('/api/admin/dashboard').set(as(pastor)).expect(200)).body as DashboardDto
      expect(after.queue.find((q) => q.id === m.id)).toBeUndefined()
      // Le pasteur voisin ne voit pas les inscriptions de cette paroisse
      const voisin = (await request(t.server).get('/api/admin/dashboard').set(as(otherPastor)).expect(200)).body as DashboardDto
      expect(voisin.queue.some((q) => q.kind === 'MEMBERSHIP')).toBe(false)
    })

    it('publication soumise par la communication → file du pasteur → publiée', async () => {
      const pub = await request(t.server)
        .post('/api/admin/publications')
        .set(as(comms))
        .send({ title: 'Culte d’union', kind: 'ANNONCE', body: 'Tous au temple dimanche.', targetStructureId: w.parish.id })
        .expect(201)
      await request(t.server).post(`/api/admin/publications/${pub.body.id}/submit`).set(as(comms)).expect(200)
      // La communication ne valide pas
      await request(t.server).post(`/api/admin/publications/${pub.body.id}/publish`).set(as(comms)).expect(403)
      const d = (await request(t.server).get('/api/admin/dashboard').set(as(pastor)).expect(200)).body as DashboardDto
      expect(d.queue).toContainEqual(expect.objectContaining({ kind: 'PUBLICATION', id: pub.body.id }))
      await request(t.server).post(`/api/admin/publications/${pub.body.id}/publish`).set(as(pastor)).expect(200)

      const c = (await request(t.server).get('/api/admin/dashboard').set(as(comms)).expect(200)).body as DashboardDto
      expect(c.kpis[0]).toEqual(expect.objectContaining({ label: expect.stringMatching(/^Publications \(/), value: '1' }))
      expect(c.table.rows[0]).toEqual(expect.objectContaining({ id: pub.body.id, status: 'Publié' }))
    })

    it('financier : la saisie manuelle compte dans la collecte du mois', async () => {
      await request(t.server)
        .post('/api/admin/contributions/manual')
        .set(as(finance))
        .send({ idempotencyKey: idemKey() + idemKey(), structureId: w.parish.id, typeKey: 'dime', amount: 25_000, channel: 'CASH', payerLabel: 'Famille Kingue' })
        .expect(201)
      const d = (await request(t.server).get('/api/admin/dashboard').set(as(finance)).expect(200)).body as DashboardDto
      expect(d.kpis[0].value).toBe(fmtFcfa(25_000))
      expect(d.chart.values[5]).toBe(25)
      expect(d.chart.unit).toBe('milliers FCFA')
      expect(d.table.rows[0].status).toBe('Saisie manuelle')
    })

    it('un mandat qui n’est pas le sien → 404', async () => {
      await request(t.server).get('/api/admin/dashboard').query({ assignmentId: 'cxxxxxxxxxxxxxxxxxxxxxxx' }).set(as(pastor)).expect(404)
    })
  })

  describe('rapports', () => {
    const period = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(new Date())

    it('rapport des contributions : une ligne par sous-structure, total du mois', async () => {
      const r = await request(t.server).get('/api/admin/reports').query({ type: 'contributions', period: period() }).set(as(confAdmin)).expect(200)
      expect(r.body.scope).toBe(w.confNode.name)
      expect(r.body.rows.map((x: string[]) => x[0])).toEqual(['Paroisse A', 'Paroisse B'])
      expect(r.body.rows[0][1]).toBe(fmtInt(25_000))
    })

    it('exports CSV, Excel et PDF, chacun journalisé', async () => {
      const csv = await request(t.server).get('/api/admin/reports').query({ type: 'contributions', period: period(), format: 'csv' }).set(as(finance)).buffer(true).expect(200)
      expect(csv.headers['content-type']).toMatch(/text\/csv/)
      expect(csv.text.charCodeAt(0)).toBe(0xfeff)
      expect(csv.text).toContain('Structure;Montant (FCFA)')
      const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => cb(null, Buffer.concat(chunks)))
      }
      const xlsx = await request(t.server).get('/api/admin/reports').query({ type: 'contributions', period: period(), format: 'xlsx' }).set(as(finance)).buffer(true).parse(binary).expect(200)
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK')
      const pdf = await request(t.server).get('/api/admin/reports').query({ type: 'members', period: period().slice(0, 4), format: 'pdf' }).set(as(pastor)).buffer(true).parse(binary).expect(200)
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF')
      const exports = await t.prisma.auditLog.count({ where: { category: 'EXPORT', actorId: { in: [finance.id, pastor.id] } } })
      expect(exports).toBe(3)
    })

    it('la communication n’a pas le rapport des contributions ; hors périmètre → 404', async () => {
      await request(t.server).get('/api/admin/reports').query({ type: 'contributions', period: period() }).set(as(comms)).expect(403)
      await request(t.server).get('/api/admin/reports').query({ type: 'communication', period: period() }).set(as(comms)).expect(200)
      await request(t.server).get('/api/admin/reports').query({ type: 'members', period: period(), structureId: w.other.id }).set(as(pastor)).expect(404)
      await request(t.server).get('/api/admin/reports').query({ type: 'members', period: '2026-13' }).set(as(pastor)).expect(400)
    })
  })

  describe('journal d’audit', () => {
    it('le financier lit le journal de sa paroisse, pas celui de la voisine', async () => {
      await t.prisma.auditLog.create({ data: { actorLabel: 'Pasteur Voisin', category: 'VALIDATION', action: 'Action chez le voisin', structurePath: w.other.path } })
      const r = await request(t.server).get('/api/admin/audit').set(as(finance)).expect(200)
      const actions = r.body.items.map((x: { action: string }) => x.action)
      expect(actions.some((a: string) => a.startsWith('Saisie manuelle'))).toBe(true)
      expect(actions).not.toContain('Action chez le voisin')
      const byCat = await request(t.server).get('/api/admin/audit').query({ category: 'EXPORT' }).set(as(finance)).expect(200)
      expect(byCat.body.items.every((x: { category: string }) => x.category === 'EXPORT')).toBe(true)
    })

    it('sans droit « Journal d’audit » → 403 ; export CSV journalisé', async () => {
      await request(t.server).get('/api/admin/audit').set(as(pastor)).expect(403)
      const csv = await request(t.server).get('/api/admin/audit').query({ format: 'csv' }).set(as(confAdmin)).buffer(true).expect(200)
      expect(csv.text).toContain('Date (Douala);Auteur;Catégorie;Action')
      expect(csv.text).toContain('Action chez le voisin')
      expect(await t.prisma.auditLog.findFirst({ where: { actorId: confAdmin.id, category: 'EXPORT' } })).not.toBeNull()
    })
  })

  describe('paramètres', () => {
    it('mention des reçus fixée à la confession et héritée par la paroisse', async () => {
      await request(t.server).get('/api/admin/settings').set(as(pastor)).expect(403)
      const saved = await request(t.server).put('/api/admin/settings').set(as(confAdmin)).send({ receiptNote: 'Merci pour votre fidélité.', locales: ['fr', 'en'] }).expect(200)
      expect(saved.body).toEqual(expect.objectContaining({ receiptNote: 'Merci pour votre fidélité.', locales: ['fr', 'en'], editable: true }))
      const parish = await request(t.server).get('/api/admin/settings').query({ structureId: w.parish.id }).set(as(confAdmin)).expect(200)
      expect(parish.body.receiptNote).toBe('Merci pour votre fidélité.')
      expect(parish.body.definedAt.receiptNote).toBe(w.confNode.name)
      expect(await t.prisma.auditLog.findFirst({ where: { actorId: confAdmin.id, category: 'PARAMETRAGE' } })).not.toBeNull()
    })

    it('types de contribution : création, doublon refusé, désactivation', async () => {
      const r = await request(t.server).post('/api/admin/settings/contribution-types').set(as(confAdmin)).send({ key: 'jubile_2027', label: 'Jubilé 2027' }).expect(201)
      const jub = r.body.find((x: { key: string }) => x.key === 'jubile_2027')
      expect(jub).toEqual(expect.objectContaining({ active: true, position: 3 }))
      await request(t.server).post('/api/admin/settings/contribution-types').set(as(confAdmin)).send({ key: 'jubile_2027', label: 'Encore' }).expect(409)
      const off = await request(t.server).patch(`/api/admin/settings/contribution-types/${jub.id}`).set(as(confAdmin)).send({ active: false }).expect(200)
      expect(off.body.find((x: { id: string }) => x.id === jub.id).active).toBe(false)
      await request(t.server).patch(`/api/admin/settings/contribution-types/${jub.id}`).set(as(finance)).send({ active: true }).expect(404)
    })
  })

  describe('écrans du back-office web', () => {
    it('audiences d’une structure : toute la communauté et ses groupes, avec le nombre de destinataires', async () => {
      const group = await t.prisma.group.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, name: 'Chorale', kind: 'choir' } })
      await t.prisma.groupMember.create({ data: { groupId: group.id, userId: w.member.id, status: 'ACTIVE' } })
      const r = await request(t.server).get('/api/admin/campaigns/audiences').query({ structureId: w.parish.id }).set(as(comms)).expect(200)
      expect(r.body.all).toBeGreaterThanOrEqual(1)
      expect(r.body.groups).toEqual([expect.objectContaining({ id: group.id, name: 'Chorale', recipients: 1 })])
      // Hors périmètre, ou sans droit d'écrire une publication ou une notification
      await request(t.server).get('/api/admin/campaigns/audiences').query({ structureId: w.other.id }).set(as(comms)).expect(404)
      await request(t.server).get('/api/admin/campaigns/audiences').query({ structureId: w.parish.id }).set(as(finance)).expect(404)
    })

    it('types de contribution pour la saisie manuelle : actifs seulement, réservés à qui saisit', async () => {
      const r = await request(t.server).get('/api/admin/contribution-types').query({ structureId: w.parish.id }).set(as(finance)).expect(200)
      expect(r.body.length).toBeGreaterThan(0)
      expect(r.body.map((x: { key: string }) => x.key)).not.toContain('jubile_2027')
      await request(t.server).get('/api/admin/contribution-types').query({ structureId: w.parish.id }).set(as(pastor)).expect(403)
      await request(t.server).get('/api/admin/contribution-types').query({ structureId: w.other.id }).set(as(finance)).expect(404)
    })

    it('rapports récents : les exports de la personne, avec de quoi les régénérer', async () => {
      const r = await request(t.server).get('/api/admin/reports/recent').set(as(finance)).expect(200)
      expect(r.body.map((x: { format: string }) => x.format).sort()).toEqual(['csv', 'xlsx'])
      expect(r.body[0]).toEqual(expect.objectContaining({ type: 'contributions', period: expect.stringMatching(/^\d{4}-\d{2}$/), structureId: w.parish.id }))
      // Ceux des autres n'y figurent pas
      const mine = await request(t.server).get('/api/admin/reports/recent').set(as(pastor)).expect(200)
      expect(mine.body.map((x: { type: string }) => x.type)).toEqual(['members'])
    })

    it('une prédication proposée (file « À valider ») se publie', async () => {
      const s = await t.prisma.spiritualContent.create({
        data: { confessionId: w.confession.id, structureId: w.parish.id, title: 'Demeurer dans la vigne', mediaType: 'TEXT', body: 'Texte de la prédication.', status: 'SUBMITTED', createdById: comms.id },
      })
      const r = await request(t.server).post(`/api/admin/sermons/${s.id}/publish`).set(as(pastor)).expect(200)
      expect(r.body.status).toBe('PUBLISHED')
      await request(t.server).post(`/api/admin/sermons/${s.id}/publish`).set(as(pastor)).expect(409)
    })
  })
})
