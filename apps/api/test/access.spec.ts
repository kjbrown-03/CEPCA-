import { AccessService, ancestorPaths, type Assignment, type Principal } from '../src/access/access.service'
import { nextMonthlyRun } from '../src/payments/contributions.service'

const seat = (path: string, perms: Record<string, Partial<{ read: boolean; write: boolean; validate: boolean; aggregateOnly: boolean }>>): Assignment => ({
  id: path,
  roleKey: 'r',
  roleLabel: 'r',
  title: null,
  structureId: path,
  structureName: path,
  structurePath: path,
  levelKey: 'paroisse',
  levelName: 'Paroisse',
  confessionId: 'c',
  perms: new Map(Object.entries(perms).map(([m, p]) => [m as never, { read: false, write: false, validate: false, aggregateOnly: false, ...p }])),
})

const principal = (...assignments: Assignment[]): Principal => ({ userId: 'u', fullName: 'U', phone: '+237', assignments, membership: null })

describe('Périmètre des droits', () => {
  const access = new AccessService(null as never)

  it('liste les ancêtres d’un chemin, de la racine au nœud', () => {
    expect(ancestorPaths('/cepca/eec/lit/')).toEqual(['/cepca/', '/cepca/eec/', '/cepca/eec/lit/'])
  })

  it('un droit sur une paroisse couvre ses chapelles, pas la paroisse voisine', () => {
    const p = principal(seat('/cepca/eec/dei/', { NEWS: { read: true, write: true } }))
    expect(access.can(p, 'NEWS', 'write', '/cepca/eec/dei/bon/')).toBe(true)
    expect(access.can(p, 'NEWS', 'write', '/cepca/eec/akw/')).toBe(false)
    // préfixe textuel trompeur : /dei/ ne couvre pas /deido/
    expect(access.can(p, 'NEWS', 'read', '/cepca/eec/deido/')).toBe(false)
  })

  it('hors périmètre en lecture → 404 ; lisible mais non modifiable → 403', () => {
    const p = principal(seat('/cepca/eec/dei/', { NEWS: { read: true } }))
    expect(() => access.assert(p, 'NEWS', 'read', '/cepca/eec/akw/')).toThrow(expect.objectContaining({ status: 404 }))
    expect(() => access.assert(p, 'NEWS', 'write', '/cepca/eec/dei/')).toThrow(expect.objectContaining({ status: 403 }))
  })

  it('un droit agrégé ne donne pas accès aux lignes nominatives', () => {
    const p = principal(seat('/cepca/', { CONTRIBUTIONS: { read: true, aggregateOnly: true } }))
    expect(access.can(p, 'CONTRIBUTIONS', 'read', '/cepca/eec/dei/')).toBe(false)
    expect(access.can(p, 'CONTRIBUTIONS', 'read', '/cepca/eec/dei/', { allowAggregate: true })).toBe(true)
  })

  it('les périmètres imbriqués se réduisent au plus large', () => {
    const p = principal(seat('/cepca/eec/', { NEWS: { read: true } }), seat('/cepca/eec/dei/', { NEWS: { read: true } }), seat('/cepca/epc/', { NEWS: { read: true } }))
    expect(access.scopePaths(p, 'NEWS', 'read').sort()).toEqual(['/cepca/eec/', '/cepca/epc/'])
  })
})

describe('Contribution mensuelle', () => {
  it('prochaine échéance : le 1er du mois suivant à 06:00 Douala', () => {
    expect(nextMonthlyRun(new Date('2026-10-02T12:00:00Z')).toISOString()).toBe('2026-11-01T05:00:00.000Z')
    // 31 décembre 23:30 UTC = 1er janvier 00:30 à Douala : l'échéance suivante est février
    expect(nextMonthlyRun(new Date('2026-12-31T23:30:00Z')).toISOString()).toBe('2027-02-01T05:00:00.000Z')
    expect(nextMonthlyRun(new Date('2026-12-15T10:00:00Z')).toISOString()).toBe('2027-01-01T05:00:00.000Z')
  })
})
