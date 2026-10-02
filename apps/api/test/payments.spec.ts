import request from 'supertest'
import { bootApp, bearer, buildWorld, idemKey } from './helpers'
import { ContributionsService } from '../src/payments/contributions.service'

describe('Contributions et paiements (bac à sable)', () => {
  let ctx: Awaited<ReturnType<typeof bootApp>>
  let w: Awaited<ReturnType<typeof buildWorld>>
  let auth: Record<string, string>
  let service: ContributionsService

  beforeAll(async () => {
    ctx = await bootApp()
    w = await buildWorld(ctx.prisma)
    auth = bearer(ctx.tokens, w.member.id)
    service = ctx.app.get(ContributionsService)
  })
  afterAll(() => ctx.app.close())

  const give = (body: Record<string, unknown>, headers = auth) =>
    request(ctx.server)
      .post('/api/contributions')
      .set(headers)
      .send({ idempotencyKey: idemKey(), typeKey: 'dime', amount: 25000, channel: 'MTN_MOMO', payerPhone: '+237677000000', ...body })

  it('reste en attente à la création, puis est confirmée par l’opérateur avec un numéro de reçu', async () => {
    const r = await give({})
    expect(r.status).toBe(201)
    expect(r.body.contribution.status).toBe('PENDING')
    expect(r.body.contribution.fee).toBe(375) // 1,5 %
    expect(r.body.contribution.totalCharged).toBe(25375)
    expect(r.body.contribution.receiptNumber).toBeNull()

    const s = await request(ctx.server).get(`/api/contributions/${r.body.contribution.id}`).set(auth)
    expect(s.body.status).toBe('SUCCEEDED')
    expect(s.body.receiptNumber).toMatch(new RegExp(`^${w.confession.code}-\\d{4}-000001$`))

    const notif = await ctx.prisma.notification.findFirst({ where: { userId: w.member.id, kind: 'RECEIPT' } })
    expect(notif?.body).toContain('Dîme')
    const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: r.body.contribution.id, category: 'PAIEMENT' } })
    expect(audit?.success).toBe(true)
  })

  it('un double appui (même clé d’idempotence) ne crée qu’une contribution', async () => {
    const key = idemKey()
    const [a, b] = await Promise.all([give({ idempotencyKey: key, amount: 3000 }), give({ idempotencyKey: key, amount: 3000 })])
    const ids = new Set([a.body.contribution?.id, b.body.contribution?.id].filter(Boolean))
    expect(ids.size).toBe(1)
    expect(await ctx.prisma.contribution.count({ where: { idempotencyKey: key } })).toBe(1)
  })

  it('refuse de réutiliser une clé avec un autre montant', async () => {
    const key = idemKey()
    await give({ idempotencyKey: key, amount: 3000 })
    const r = await give({ idempotencyKey: key, amount: 9000 })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('un refus de l’opérateur passe en échec et ne compte rien dans le projet', async () => {
    const before = await ctx.prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })
    const r = await give({ typeKey: 'projet', projectId: w.project.id, amount: 5013 })
    const s = await request(ctx.server).get(`/api/contributions/${r.body.contribution.id}`).set(auth)
    expect(s.body.status).toBe('FAILED')
    expect(s.body.failureReason).toBe('Solde insuffisant')
    expect(s.body.receiptNumber).toBeNull()
    const after = await ctx.prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })
    expect(after.raisedAmount).toBe(before.raisedAmount)
  })

  it('un délai dépassé chez l’opérateur annule la contribution', async () => {
    const r = await give({ amount: 5014 })
    const s = await request(ctx.server).get(`/api/contributions/${r.body.contribution.id}`).set(auth)
    expect(s.body.status).toBe('CANCELLED')
  })

  it('un rappel et un sondage simultanés ne comptent le montant qu’une fois dans le projet', async () => {
    const before = await ctx.prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })
    const r = await give({ typeKey: 'projet', projectId: w.project.id, amount: 10000 })
    const tx = await ctx.prisma.paymentTransaction.findFirstOrThrow({ where: { contributionId: r.body.contribution.id } })
    const ok = { status: 'SUCCEEDED' as const, raw: 'SUCCESSFUL' }
    await Promise.all([service.resolve(tx.id, ok), service.resolve(tx.id, ok), service.resolve(tx.id, ok)])
    const after = await ctx.prisma.project.findUniqueOrThrow({ where: { id: w.project.id } })
    expect(after.raisedAmount - before.raisedAmount).toBe(10000)
    expect(after.contributorCount - before.contributorCount).toBe(1) // premier don réussi de ce fidèle au projet
    const c = await ctx.prisma.contribution.findUniqueOrThrow({ where: { id: r.body.contribution.id } })
    expect(c.status).toBe('SUCCEEDED')
  })

  it('exige un projet pour le type Projet et refuse un projet hors de portée', async () => {
    expect((await give({ typeKey: 'projet' })).body.code).toBe('PROJECT_REQUIRED')
    const foreign = await ctx.prisma.project.create({
      data: { code: `X-${idemKey()}`, confessionId: w.confession.id, structureId: w.other.id, title: 'Ailleurs', description: '-', collectOpen: true, status: 'FUNDING' },
    })
    expect((await give({ typeKey: 'projet', projectId: foreign.id })).status).toBe(404)
  })

  it('refuse les champs inconnus (statut, montant net…)', async () => {
    const r = await give({ status: 'SUCCEEDED' })
    expect(r.status).toBe(400)
    expect(r.body.fields.status ?? r.body.fields._).toBeDefined()
  })

  it('le reçu PDF n’est servi qu’à son titulaire, et seulement une fois le paiement confirmé', async () => {
    const r = await give({ amount: 2000 })
    const id = r.body.contribution.id
    const pending = await request(ctx.server).get(`/api/contributions/${id}/receipt.pdf`).set(auth)
    expect(pending.status).toBe(409)
    await request(ctx.server).get(`/api/contributions/${id}`).set(auth)
    const pdf = await request(ctx.server).get(`/api/contributions/${id}/receipt.pdf`).set(auth)
    expect(pdf.status).toBe(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    const other = await request(ctx.server).get(`/api/contributions/${id}/receipt.pdf`).set(bearer(ctx.tokens, w.outsider.id))
    expect(other.status).toBe(404)
    const lookup = await request(ctx.server).get(`/api/contributions/${id}`).set(bearer(ctx.tokens, w.outsider.id))
    expect(lookup.status).toBe(404)
  })

  it('un rappel opérateur sans le bon jeton est refusé', async () => {
    const r = await give({ amount: 2500 })
    const tx = await ctx.prisma.paymentTransaction.findFirstOrThrow({ where: { contributionId: r.body.contribution.id } })
    const bad = await request(ctx.server).post(`/api/payments/webhooks/sandbox/${tx.id}/${'x'.repeat(32)}`).send({ status: 'SUCCESSFUL' })
    expect(bad.status).toBe(404)
    const c = await ctx.prisma.contribution.findUniqueOrThrow({ where: { id: r.body.contribution.id } })
    expect(c.status).toBe('PENDING')
  })

  it('l’historique ne totalise que les paiements réussis', async () => {
    const h = await request(ctx.server).get('/api/contributions').set(auth)
    expect(h.status).toBe(200)
    const succeeded = await ctx.prisma.contribution.aggregate({ where: { userId: w.member.id, status: 'SUCCEEDED' }, _sum: { amount: true } })
    expect(h.body.summary.total).toBe(succeeded._sum.amount)
    expect(h.body.items.every((i: { status: string }) => i.status !== 'CANCELLED')).toBe(true)
  })

  it('la contribution mensuelle crée une demande par mois, même si le job passe deux fois', async () => {
    const r = await give({ amount: 4000, recurring: true })
    const c = await ctx.prisma.contribution.findUniqueOrThrow({ where: { id: r.body.contribution.id } })
    const plan = await ctx.prisma.recurringPlan.findUniqueOrThrow({ where: { id: c.recurringPlanId! } })
    expect(plan.nextRunAt.getUTCDate()).toBe(1)
    await ctx.prisma.recurringPlan.update({ where: { id: plan.id }, data: { nextRunAt: new Date(Date.now() - 1000) } })
    await service.runRecurring()
    await ctx.prisma.recurringPlan.update({ where: { id: plan.id }, data: { nextRunAt: new Date(Date.now() - 1000) } })
    await service.runRecurring()
    expect(await ctx.prisma.contribution.count({ where: { recurringPlanId: plan.id } })).toBe(2) // la première + celle du mois
    const del = await request(ctx.server).delete(`/api/me/recurring/${plan.id}`).set(auth)
    expect(del.status).toBe(200)
  })
})
