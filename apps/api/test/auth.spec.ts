import request from 'supertest'
import { bootApp, bearer, buildWorld, newEmail, newPhone } from './helpers'

describe('Authentification', () => {
  let ctx: Awaited<ReturnType<typeof bootApp>>
  beforeAll(async () => {
    ctx = await bootApp()
  })
  afterAll(() => ctx.app.close())

  it('inscription par code e-mail : le compte est créé à la première vérification, avec nom et téléphone', async () => {
    const email = newEmail('inscription')
    const phone = newPhone()
    const a = await request(ctx.server).post('/api/auth/otp/request').send({ email, purpose: 'SIGNUP' })
    expect(a.status).toBe(200)
    expect(a.body.sentTo).not.toContain(email.split('@')[0]) // adresse masquée
    const code = ctx.mail.codes.get(email)!
    expect(code).toMatch(/^\d{4}$/)
    // Sans téléphone : refusé avant de consommer un essai
    const noPhone = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code, fullName: 'Nouvelle Fidèle' })
    expect(noPhone.body.code).toBe('PHONE_REQUIRED')
    const v = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code, fullName: 'Nouvelle Fidèle', phone })
    expect(v.status).toBe(200)
    expect(v.body.created).toBe(true)
    const me = await request(ctx.server).get('/api/me').set({ Authorization: `Bearer ${v.body.accessToken}` })
    expect(me.body.fullName).toBe('Nouvelle Fidèle')
    expect(me.body.phone).toBe(phone)
    expect(me.body.membership).toBeNull()
  })

  it('un numéro déjà pris par un autre compte est refusé à l’inscription', async () => {
    const w = await buildWorld(ctx.prisma)
    const email = newEmail('doublon')
    await request(ctx.server).post('/api/auth/otp/request').send({ email, purpose: 'SIGNUP' })
    const r = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code: ctx.mail.codes.get(email), fullName: 'Doublon', phone: w.member.phone })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('PHONE_TAKEN')
  })

  it('un code faux décompte les essais, puis bloque', async () => {
    const email = newEmail()
    const phone = newPhone()
    await request(ctx.server).post('/api/auth/otp/request').send({ email, purpose: 'SIGNUP' })
    const good = ctx.mail.codes.get(email)!
    const wrong = good === '0000' ? '1111' : '0000'
    const first = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code: wrong, fullName: 'X Y', phone })
    expect(first.body.code).toBe('OTP_INVALID')
    expect(first.body.message).toContain('4 essais')
    for (let i = 0; i < 4; i++) await request(ctx.server).post('/api/auth/otp/verify').send({ email, code: wrong, fullName: 'X Y', phone })
    const locked = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code: good, fullName: 'X Y', phone })
    expect(locked.body.code).toBe('OTP_LOCKED')
  })

  it('un code ne sert qu’une fois', async () => {
    const email = newEmail()
    await request(ctx.server).post('/api/auth/otp/request').send({ email, purpose: 'SIGNUP' })
    const code = ctx.mail.codes.get(email)!
    const w = await buildWorld(ctx.prisma)
    // Compte existant : connexion simple, deux vérifications simultanées
    await ctx.prisma.user.update({ where: { id: w.member.id }, data: { email } })
    const [a, b] = await Promise.all([
      request(ctx.server).post('/api/auth/otp/verify').send({ email, code }),
      request(ctx.server).post('/api/auth/otp/verify').send({ email, code }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 400])
  })

  it('connexion sur une adresse inconnue : invitation à créer un compte', async () => {
    const r = await request(ctx.server).post('/api/auth/otp/request').send({ email: newEmail('inconnu'), purpose: 'LOGIN' })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('NO_ACCOUNT')
  })

  it('connexion d’un fidèle existant par e-mail', async () => {
    const w = await buildWorld(ctx.prisma)
    const email = w.member.email!
    await request(ctx.server).post('/api/auth/otp/request').send({ email, purpose: 'LOGIN' }).expect(200)
    const v = await request(ctx.server).post('/api/auth/otp/verify').send({ email, code: ctx.mail.codes.get(email) })
    expect(v.status).toBe(200)
    expect(v.body.created).toBe(false)
  })

  it('un compte suspendu perd l’accès immédiatement, sans attendre l’expiration du jeton', async () => {
    const w = await buildWorld(ctx.prisma)
    const h = bearer(ctx.tokens, w.member.id)
    expect((await request(ctx.server).get('/api/me').set(h)).status).toBe(200)
    await ctx.prisma.user.update({ where: { id: w.member.id }, data: { status: 'SUSPENDED' } })
    const r = await request(ctx.server).get('/api/me').set(h)
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('ACCOUNT_DISABLED')
  })

  it('rotation du jeton de rafraîchissement : réutiliser un ancien jeton révoque toute la famille', async () => {
    const w = await buildWorld(ctx.prisma)
    const t0 = await ctx.tokens.issue(w.member.id, {})
    const r1 = await request(ctx.server).post('/api/auth/refresh').send({ refreshToken: t0.refreshToken })
    expect(r1.status).toBe(200)
    const replay = await request(ctx.server).post('/api/auth/refresh').send({ refreshToken: t0.refreshToken })
    expect(replay.status).toBe(401)
    const r2 = await request(ctx.server).post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken })
    expect(r2.status).toBe(401) // le jeton légitime est aussi révoqué : vol présumé
  })

  it('refuse un jeton signé avec un autre algorithme', async () => {
    const forged = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: 'x', typ: 'access', iss: 'cepca-api' })).toString('base64url') + '.'
    const r = await request(ctx.server).get('/api/me').set({ Authorization: `Bearer ${forged}` })
    expect(r.status).toBe(401)
  })
})

describe('Diffusion et cloisonnement côté fidèle', () => {
  let ctx: Awaited<ReturnType<typeof bootApp>>
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    ctx = await bootApp()
    w = await buildWorld(ctx.prisma)
  })
  afterAll(() => ctx.app.close())

  it('un fidèle voit sa paroisse et ses ancêtres, pas la paroisse voisine', async () => {
    const mine = await ctx.prisma.publication.create({ data: { targetStructureId: w.parish.id, kind: 'ANNONCE', title: 'Chez nous', body: 'x', status: 'PUBLISHED', publishedAt: new Date(), authorId: w.member.id } })
    const conf = await ctx.prisma.publication.create({ data: { targetStructureId: w.confNode.id, kind: 'ACTUALITE', title: 'Confession', body: 'x', status: 'PUBLISHED', publishedAt: new Date(), authorId: w.member.id } })
    const theirs = await ctx.prisma.publication.create({ data: { targetStructureId: w.other.id, kind: 'ANNONCE', title: 'Chez eux', body: 'x', status: 'PUBLISHED', publishedAt: new Date(), authorId: w.member.id } })
    const draft = await ctx.prisma.publication.create({ data: { targetStructureId: w.parish.id, kind: 'ANNONCE', title: 'Brouillon', body: 'x', status: 'DRAFT', authorId: w.member.id } })
    const r = await request(ctx.server).get('/api/feed/publications').set(bearer(ctx.tokens, w.member.id))
    const ids = r.body.map((p: { id: string }) => p.id)
    expect(ids).toEqual(expect.arrayContaining([mine.id, conf.id]))
    expect(ids).not.toContain(theirs.id)
    expect(ids).not.toContain(draft.id)
    expect((await request(ctx.server).get(`/api/feed/publications/${theirs.id}`).set(bearer(ctx.tokens, w.member.id))).status).toBe(404)
  })

  it('un visiteur sans compte ne voit que le niveau CEPCA public', async () => {
    const r = await request(ctx.server).get('/api/feed/publications')
    expect(r.status).toBe(200)
    expect(r.body.every((p: { scope: string }) => p.scope === 'CEPCA')).toBe(true)
  })

  it('un jeton invalide sur une route publique vaut visiteur, pas 401', async () => {
    const r = await request(ctx.server).get('/api/feed/home').set({ Authorization: 'Bearer abc.def.ghi' })
    expect(r.status).toBe(200)
  })

  it('l’inscription à une activité respecte la capacité', async () => {
    const e = await ctx.prisma.event.create({
      data: { structureId: w.parish.id, title: 'Atelier', startsAt: new Date(Date.now() + 86400000), place: 'Salle', status: 'PUBLISHED', registrationOpen: true, capacity: 1, createdById: w.member.id },
    })
    const other = await ctx.prisma.user.create({ data: { phone: '+2376' + Date.now().toString().slice(-8), fullName: 'Second' } })
    await ctx.prisma.membership.create({ data: { userId: other.id, structureId: w.chapel.id, confessionId: w.confession.id, status: 'ACTIVE' } })
    const [a, b] = await Promise.all([
      request(ctx.server).post(`/api/events/${e.id}/registration`).set(bearer(ctx.tokens, w.member.id)),
      request(ctx.server).post(`/api/events/${e.id}/registration`).set(bearer(ctx.tokens, other.id)),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
  })
})
