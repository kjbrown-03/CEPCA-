import { FapshiProvider, fapshiPhone } from '../src/payments/providers'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('Adaptateur Fapshi', () => {
  const fapshi = new FapshiProvider()
  let fetchSpy: jest.SpyInstance
  afterEach(() => fetchSpy?.mockRestore())

  it('convertit un numéro camerounais au format Fapshi, refuse les autres', () => {
    expect(fapshiPhone('+237677123442')).toBe('677123442')
    expect(fapshiPhone('+237233421100')).toBeNull() // fixe
    expect(fapshiPhone('+33612457890')).toBeNull() // diaspora
  })

  it('envoie direct-pay avec le bon moyen de paiement et les en-têtes apiuser / apikey', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { message: 'Accepted', transId: 'T1' }))
    const r = await fapshi.initiate({ amount: 5075, fee: 75, phone: '+237690000000', medium: 'ORANGE_MONEY', reference: 'c1', userId: 'u1', label: 'CEPCA · Offrande' })
    expect(r.providerRef).toBe('T1')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toMatch(/\/direct-pay$/)
    expect(init.headers).toEqual(expect.objectContaining({ apiuser: expect.any(String), apikey: expect.any(String) }))
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining({ amount: 5075, phone: '690000000', medium: 'orange money', externalId: 'c1' }))
  })

  it('traduit un refus de Fapshi en message lisible', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(400, { message: 'Phone number must be a valid MTN or Orange' }))
    await expect(fapshi.initiate({ amount: 500, fee: 0, phone: '+237677000000', medium: 'MTN_MOMO', reference: 'c', userId: null, label: 'x' })).rejects.toMatchObject({
      userMessage: 'Ce numéro n’est pas un compte MTN MoMo ou Orange Money valide.',
    })
  })

  it.each([
    ['CREATED', 'PENDING'],
    ['PENDING', 'PENDING'],
    ['SUCCESSFUL', 'SUCCEEDED'],
    ['FAILED', 'FAILED'],
    ['EXPIRED', 'EXPIRED'],
  ])('statut Fapshi %s → %s', async (raw, expected) => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(200, { status: raw, revenue: 485 }))
    const st = await fapshi.fetchStatus('T1')
    expect(st.status).toBe(expected)
    if (raw === 'SUCCESSFUL') expect(st.received).toBe(485)
  })
})
