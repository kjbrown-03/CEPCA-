import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect } from 'expo-router'

/** Heure courante, rafraîchie à intervalle (compte à rebours du prochain culte). */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

/** Relit une requête quand l'écran revient au premier plan (retour depuis un détail). */
export function useRefetchOnFocus(refetch: () => unknown) {
  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )
}
