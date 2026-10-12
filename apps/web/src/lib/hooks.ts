'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { errorMessage } from './api'
import { useToast } from '@/components/ui'

/**
 * Action du back-office : toast de réussite ou message de l'API, puis rafraîchissement des listes touchées.
 */
export function useAct<V, R = unknown>(fn: (v: V) => Promise<R>, opts: { ok?: string | ((r: R, v: V) => string); invalidate?: QueryKey[]; onDone?: (r: R, v: V) => void } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r, v) => {
      if (opts.ok) toast(typeof opts.ok === 'function' ? opts.ok(r, v) : opts.ok)
      opts.onDone?.(r, v)
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })))
    },
    onError: (e) => toast(errorMessage(e), true),
  })
}

/** Valeur stabilisée après une pause de frappe (recherche). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
