import request from 'supertest'
import { PushService, pushUrl } from '../src/admin/audience.service'
import { bearer, bootApp, buildWorld } from './helpers'

const sub = (n: number) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/test-${Date.now()}-${n}`,
  keys: { p256dh: 'BOr7nT1L2k1cP7yNq0d0pZxU1vYzZb8Yq8m0p1n2o3p4q5r6s7t8u9v0w', auth: 'k8JV6sjdbhAi-n3kPq9b2w' },
})

describe('Notifications push de l’application web', () => {
  let t: Awaited<ReturnType<typeof bootApp>>
  let w: Awaited<ReturnType<typeof buildWorld>>
  beforeAll(async () => {
    t = await bootApp()
    w = await buildWorld(t.prisma)
  })
  afterAll(() => t.app.close())

  it('donne la clé publique sans session', async () => {
    const r = await request(t.server).get('/api/push/key').expect(200)
    expect(r.body).toHaveProperty('key')
  })

  it('un fidèle abonne son navigateur, puis se désabonne', async () => {
    const s = sub(1)
    await request(t.server).post('/api/me/push-subscription').send(s).expect(401)
    await request(t.server).post('/api/me/push-subscription').set(bearer(t.tokens, w.member.id)).send(s).expect(200)
    const row = await t.prisma.pushToken.findUnique({ where: { token: s.endpoint } })
    expect(row).toMatchObject({ userId: w.member.id, platform: 'web', auth: s.keys.auth })
    // Envoi simulé (pas de clés VAPID en test) : le navigateur est compté
    expect(await t.app.get(PushService).send([w.member.id], 'Titre', 'Texte', { screen: 'newsD', id: 'x' })).toBeGreaterThanOrEqual(1)
    await request(t.server).delete('/api/me/push-subscription').set(bearer(t.tokens, w.member.id)).send({ endpoint: s.endpoint }).expect(200)
    expect(await t.prisma.pushToken.findUnique({ where: { token: s.endpoint } })).toBeNull()
  })

  it('refuse une adresse qui n’est pas celle d’un service push connu', async () => {
    const bad = { ...sub(2), endpoint: 'https://169.254.169.254/latest/meta-data' }
    const r = await request(t.server).post('/api/me/push-subscription').set(bearer(t.tokens, w.member.id)).send(bad).expect(400)
    expect(r.body.code).toBe('VALIDATION')
    await request(t.server).post('/api/me/push-subscription').set(bearer(t.tokens, w.member.id)).send({ ...sub(3), endpoint: 'http://fcm.googleapis.com/x' }).expect(400)
  })

  it('un abonnement ne se retire que par son propriétaire', async () => {
    const s = sub(4)
    await request(t.server).post('/api/me/push-subscription').set(bearer(t.tokens, w.member.id)).send(s).expect(200)
    await request(t.server).delete('/api/me/push-subscription').set(bearer(t.tokens, w.outsider.id)).send({ endpoint: s.endpoint }).expect(200)
    expect(await t.prisma.pushToken.findUnique({ where: { token: s.endpoint } })).not.toBeNull()
  })

  it('la notification ouvre le bon écran de l’application', () => {
    expect(pushUrl({ screen: 'newsD', id: 'abc' })).toBe('/app/actualites/abc')
    expect(pushUrl({ screen: 'receipt', id: 'r1' })).toBe('/app/contribuer/recu/r1')
    expect(pushUrl({ screen: 'notifs' })).toBe('/app/notifications')
  })
})
