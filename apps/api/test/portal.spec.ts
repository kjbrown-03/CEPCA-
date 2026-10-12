import request from 'supertest'
import { bootApp, buildWorld } from './helpers'

type Boot = Awaited<ReturnType<typeof bootApp>>
type World = Awaited<ReturnType<typeof buildWorld>>

describe('Portail public', () => {
  let t: Boot
  let w: World
  const titles = (body: { items: Array<{ title: string }> }) => body.items.map((x) => x.title)

  beforeAll(async () => {
    t = await bootApp()
    w = await buildWorld(t.prisma)
    const group = await t.prisma.group.create({ data: { structureId: w.parish.id, confessionId: w.confession.id, name: 'Jeunesse', kind: 'youth' } })
    const pub = (title: string, extra: Record<string, unknown>) =>
      t.prisma.publication.create({
        data: { title, body: `${title}. `.repeat(30), kind: 'ACTUALITE', status: 'PUBLISHED', publishedAt: new Date(), isPublic: true, targetStructureId: w.parish.id, confessionId: w.confession.id, authorId: w.member.id, ...extra },
      })
    await pub('Portail : actualité de paroisse', {})
    await pub('Portail : communiqué de la confession', { kind: 'COMMUNIQUE', targetStructureId: w.confNode.id })
    await pub('Portail : réservé aux fidèles', { isPublic: false })
    await pub('Portail : pour le groupe jeunesse', { groupId: group.id })
    await pub('Portail : annonce locale', { kind: 'ANNONCE' })
    await pub('Portail : brouillon', { status: 'DRAFT', publishedAt: null })
  })
  afterAll(() => t.app.close())

  it('liste les confessions membres, sans compte', async () => {
    const r = await request(t.server).get('/api/public/confessions').expect(200)
    expect(r.body).toEqual(expect.arrayContaining([expect.objectContaining({ code: w.confession.code, name: w.confession.name })]))
  })

  it('ne montre que les actualités et communiqués publics, publiés, sans groupe ciblé', async () => {
    const r = await request(t.server).get('/api/public/news').query({ confession: w.confession.code, take: 24 }).expect(200)
    const got = titles(r.body).filter((x) => x.startsWith('Portail'))
    expect(got.sort()).toEqual(['Portail : actualité de paroisse', 'Portail : communiqué de la confession'])
    const item = r.body.items.find((x: { title: string }) => x.title === 'Portail : actualité de paroisse')
    expect(item).toEqual(expect.objectContaining({ source: w.confession.code, kindLabel: 'Actualité' }))
    expect(item.excerpt.length).toBeLessThanOrEqual(221)
    expect(item).not.toHaveProperty('body')
  })

  it('filtre par type ; un sigle inconnu ne renvoie que le CEPCA', async () => {
    const com = await request(t.server).get('/api/public/news').query({ confession: w.confession.code, kind: 'COMMUNIQUE' }).expect(200)
    expect(titles(com.body).filter((x) => x.startsWith('Portail'))).toEqual(['Portail : communiqué de la confession'])
    const other = await request(t.server).get('/api/public/news').query({ confession: 'ZZZ' }).expect(200)
    expect(titles(other.body).filter((x) => x.startsWith('Portail'))).toEqual([])
    await request(t.server).get('/api/public/news').query({ kind: 'ANNONCE' }).expect(400)
  })

  it('article : texte complet si public, sinon 404', async () => {
    const ok = await t.prisma.publication.findFirstOrThrow({ where: { title: 'Portail : actualité de paroisse' } })
    const hidden = await t.prisma.publication.findFirstOrThrow({ where: { title: 'Portail : réservé aux fidèles' } })
    const r = await request(t.server).get(`/api/public/news/${ok.id}`).expect(200)
    expect(r.body.body).toContain('Portail : actualité de paroisse.')
    await request(t.server).get(`/api/public/news/${hidden.id}`).expect(404)
  })
})
