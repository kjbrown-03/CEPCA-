import request from 'supertest'
import bcrypt from 'bcryptjs'
import { bearer, bootApp, buildWorld, newEmail, newPhone } from './helpers'

type Boot = Awaited<ReturnType<typeof bootApp>>

/** Cookie « nom=valeur » posé par une réponse. */
function cookie(res: request.Response, name: string): string {
  const all = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return all.find((c) => c.startsWith(name + '='))!.split(';')[0]
}

describe('Double authentification des responsables', () => {
  let t: Boot
  let w: Awaited<ReturnType<typeof buildWorld>>
  let pastor: { id: string; email: string }
  const PASSWORD = 'Paroisse-Test-2026'

  beforeAll(async () => {
    t = await bootApp()
    w = await buildWorld(t.prisma)
    const role = await t.prisma.role.create({
      data: { confessionId: w.confession.id, key: 'pastor', label: 'Pasteur', isSystem: false, permissions: { createMany: { data: [{ module: 'MEMBERS', canRead: true, canWrite: true, canValidate: true }] } } },
    })
    const email = newEmail('pasteur')
    const u = await t.prisma.user.create({ data: { phone: newPhone(), email, fullName: 'Pasteur MFA', passwordHash: await bcrypt.hash(PASSWORD, 4) } })
    await t.prisma.roleAssignment.create({ data: { userId: u.id, roleId: role.id, structureId: w.parish.id } })
    pastor = { id: u.id, email }
  })
  afterAll(() => t.app.close())

  it('une session ouverte par le seul code du fidèle n’ouvre pas les fonctions des responsables', async () => {
    const r = await request(t.server).get('/api/admin/dashboard').set(bearer(t.tokens, pastor.id, false)).expect(403)
    expect(r.body.code).toBe('MFA_REQUIRED')
    // Les écrans du fidèle restent ouverts
    await request(t.server).get('/api/me').set(bearer(t.tokens, pastor.id, false)).expect(200)
  })

  it('l’application élève la session : mot de passe, puis code à 6 chiffres', async () => {
    // Connexion du fidèle par code e-mail (cookies, comme la PWA)
    await request(t.server).post('/api/auth/otp/request').send({ email: pastor.email, purpose: 'LOGIN' }).expect(200)
    const login = await request(t.server).post('/api/auth/otp/verify').send({ email: pastor.email, code: t.mail.codes.get(pastor.email), cookie: true }).expect(200)
    let at = cookie(login, 'cepca_at')
    const rt = cookie(login, 'cepca_rt')
    await request(t.server).get('/api/admin/dashboard').set('Cookie', at).expect(403)

    const bad = await request(t.server).post('/api/auth/staff/request').set('Cookie', at).send({ password: 'Pas-le-bon-2026' }).expect(401)
    expect(bad.body.code).toBe('BAD_CREDENTIALS')
    t.mail.codes.delete(pastor.email)
    const ch = await request(t.server).post('/api/auth/staff/request').set('Cookie', at).send({ password: PASSWORD }).expect(200)
    const code = t.mail.codes.get(pastor.email)!
    expect(code).toMatch(/^\d{6}$/)
    const v = await request(t.server).post('/api/auth/staff/verify').set('Cookie', `${at}; ${rt}`).send({ challengeId: ch.body.challengeId, code }).expect(200)
    at = cookie(v, 'cepca_at')
    await request(t.server).get('/api/admin/dashboard').set('Cookie', at).expect(200)
    // L'ancienne session (sans double authentification) est révoquée
    await request(t.server).post('/api/auth/refresh').set('Cookie', rt).send({}).expect(401)
    // La rotation garde la double authentification
    const r = await request(t.server).post('/api/auth/refresh').set('Cookie', cookie(v, 'cepca_rt')).send({}).expect(200)
    await request(t.server).get('/api/admin/dashboard').set('Cookie', cookie(r, 'cepca_at')).expect(200)
  })

  it('un simple fidèle ne peut pas demander d’ouvrir un espace responsable', async () => {
    const r = await request(t.server).post('/api/auth/staff/request').set(bearer(t.tokens, w.member.id, false)).send({ password: PASSWORD }).expect(403)
    expect(r.body.code).toBe('NOT_STAFF')
  })

  it('le code d’un autre compte est refusé', async () => {
    await request(t.server).post('/api/auth/otp/request').send({ email: w.member.email, purpose: 'LOGIN' }).expect(200)
    const other = await t.prisma.otpChallenge.findFirst({ where: { email: w.member.email! }, orderBy: { createdAt: 'desc' } })
    const r = await request(t.server).post('/api/auth/staff/verify').set(bearer(t.tokens, pastor.id, false)).send({ challengeId: other!.id, code: '123456' }).expect(400)
    expect(r.body.code).toBe('OTP_EXPIRED')
  })
})
