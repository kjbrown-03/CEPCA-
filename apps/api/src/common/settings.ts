import type { PrismaService } from '../prisma/prisma.service'
import { ancestorPaths } from '../access/access.service'

export const SETTING_DEFAULTS = { locales: ['fr'] as Array<'fr' | 'en'>, receiptNote: '' }
export type SettingKey = keyof typeof SETTING_DEFAULTS
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] }

/**
 * Paramètres effectifs d'une structure : la valeur fixée au plus près l'emporte
 * (paroisse, puis confession, puis CEPCA), à défaut la valeur par défaut.
 */
export async function effectiveSettings(prisma: PrismaService, path: string): Promise<Settings & { definedAt: Partial<Record<SettingKey, string>> }> {
  const chain = await prisma.structure.findMany({ where: { path: { in: ancestorPaths(path) } }, select: { id: true, name: true, depth: true } })
  const rows = await prisma.setting.findMany({ where: { structureId: { in: chain.map((s) => s.id) }, key: { in: Object.keys(SETTING_DEFAULTS) } } })
  const depth = new Map(chain.map((s) => [s.id, s]))
  const out = { ...SETTING_DEFAULTS, definedAt: {} as Partial<Record<SettingKey, string>> }
  for (const r of [...rows].sort((a, b) => depth.get(a.structureId)!.depth - depth.get(b.structureId)!.depth)) {
    ;(out as Record<string, unknown>)[r.key] = r.value
    out.definedAt[r.key as SettingKey] = depth.get(r.structureId)!.name
  }
  return out
}
