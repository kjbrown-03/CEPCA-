import request from 'supertest'
import { bootApp, bearer, buildWorld, newPhone } from './helpers'

describe('Authentification', () => {
  let ctx: Awaited<ReturnType<typeof bootApp>>
  beforeAll(async () => {
    ctx = await bootApp()
  })
  afterAll(() => ctx.app.close())

  it('inscription par code SMS : le compte est créé à la première vérification', async () => {
    const phone = newPhone()
    const a = await request(ctx.server).post('/api/auth/otp/request').send({ phone, purpose: 'SIGNUP', fullName: 'Nouvelle Fidèle' })
    expect(a.status).toBe(200)
    expect(a.body.sentTo).not.toContain(phone.slice(-6, -2)) // numéro masqué
    const code = ctx.sms.codes.get(phone)!
    expect(code).toMatch(/^\d{4}$/)
    const v = await request(ctx.server).post('/api/auth/otp/verify').send({ phone, code, fullName: 'Nouvelle Fidèle' })
    expect(v.status).toBe(200)
    expect(v.body.created).toBe(true)
    const me = await request(ctx.server).get('/api/me').set({ Authorization: `Bearer ${v.body.accessToken}` })
    expect(me.body.fullName).toBe('Nouvelle Fidèle')
    expect(me.body.membership).toBeNull()
  })

  it('un code faux décompte les essais, puis bloque', async () => {
    const phone = newPhone()
    await request(ctx.server).post('/api/auth/otp/request').send({ phone, purpose: 'SIGNUP' })
    const good = ctx.sms.codes.get(phone)!
    const wrong = good === '0000' ? '1111' : '0000'
    const first = await request(ctx.server).post('/api/auth/otp/verify').send({ phone, code: wrong, fullName: 'X Y' })
    expect(first.body.code).toBe('OTP_INVALID')
    expect(first.body.message).toContain('4 essais')
    for (let i = 0; i < 4; i++) await request(ctx.server).post('/api/auth/otp/verify').send({ phone, code: wrong, fullName: 'X Y' })
    const locked = await request(ctx.server).post('/api/auth/otp/verify').send({ phone, code: good, fullName: 'X Y' })
    expect(locked.body.code).toBe('OTP_LOCKED')
  })

  it('un code ne sert qu’une fois', async () => {
    const phone = newPhone()
    await request(ctx.server).post('/api/auth/otp/request').send({ phone, purpose: 'SIGNUP' })
    const code = ctx.sms.codes.get(phone)!
    const [a, b] = await Promise.all([
      request(ctx.server).post('/api/auth/otp/verify').send({ phone, code, fullName: 'A B' }),
      request(ctx.server).post('/api/auth/otp/verify').send({ phone, code, fullName: 'A B' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 400])
  })

  it('connexion sur un numéro inconnu : invitation à créer un compte', async () => {
    const r = await request(ctx.server).post('/api/auth/otp/request').send({ phone: newPhone(), purpose: 'LOGIN' })
    expect(r.status).toBe(404)
    expect(r.body.code).toBe('NO_ACCOUNT')
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
