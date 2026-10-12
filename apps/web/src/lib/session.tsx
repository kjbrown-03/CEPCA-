'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AdminMeDto, AdminSeat, ModuleKey, StructureNodeDto } from './types'
import { api } from './api'

type Action = 'read' | 'write' | 'validate'

interface Session {
  me: AdminMeDto
  seat: AdminSeat
  setSeat: (assignmentId: string) => void
  /** Droit du mandat actif (l'API reste seule juge : elle peut refuser ce que l'écran propose). */
  can: (module: ModuleKey, action?: Action, detailed?: boolean) => boolean
}

const Ctx = createContext<Session | null>(null)
const SEAT_KEY = 'cepca.admin.seat'

/** Mandat choisi à la connexion : il devient le mandat actif à l'ouverture du back-office. */
export function rememberSeat(assignmentId: string) {
  try {
    window.localStorage.setItem(SEAT_KEY, assignmentId)
  } catch {
    // stockage indisponible : le premier mandat s'affichera
  }
}

function storedSeat(): string | null {
  try {
    return window.localStorage.getItem(SEAT_KEY)
  } catch {
    return null
  }
}

export function SessionProvider({ me, children }: { me: AdminMeDto; children: ReactNode }) {
  const [seatId, setSeatId] = useState<string | null>(() => (typeof window === 'undefined' ? null : storedSeat()))
  const seat = me.seats.find((s) => s.assignmentId === seatId) ?? me.seats[0]
  const setSeat = useCallback((id: string) => {
    setSeatId(id)
    try {
      window.localStorage.setItem(SEAT_KEY, id)
    } catch {
      // stockage indisponible (navigation privée) : le choix vaut pour la page
    }
  }, [])
  const value = useMemo<Session>(
    () => ({
      me,
      seat,
      setSeat,
      can: (module, action = 'read', detailed = false) => {
        const p = seat.permissions[module]
        return !!p && p[action] && !(detailed && p.aggregateOnly)
      },
    }),
    [me, seat, setSeat],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): Session {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSession hors du back-office')
  return s
}

export const useMe = () => useQuery({ queryKey: ['me'], queryFn: () => api.get<AdminMeDto>('/admin/me'), staleTime: 5 * 60_000, retry: false })

/** Arbre du périmètre (liste à plat triée par chemin). */
export const useStructures = () => useQuery({ queryKey: ['structures'], queryFn: () => api.get<StructureNodeDto[]>('/admin/structures'), staleTime: 60_000 })

/** Le nœud du mandat actif et ses descendants, dans l'ordre de l'arbre, avec la profondeur relative. */
export function useSeatSubtree() {
  const { seat } = useSession()
  const q = useStructures()
  const nodes = useMemo(() => {
    const all = q.data ?? []
    const root = all.find((n) => n.id === seat.structure.id)
    if (!root) return []
    const kids = new Map<string, StructureNodeDto[]>()
    for (const n of all) if (n.parentId) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
    const out: Array<StructureNodeDto & { rel: number }> = []
    const walk = (n: StructureNodeDto, rel: number) => {
      out.push({ ...n, rel })
      for (const c of kids.get(n.id) ?? []) walk(c, rel + 1)
    }
    walk(root, 0)
    return out
  }, [q.data, seat.structure.id])
  return { ...q, nodes }
}
