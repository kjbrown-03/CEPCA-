import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthTokens } from '@cepca/shared'
import { api } from './api'
import { getSession, loadSession, onSessionChange, setSession } from './session'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthValue {
  status: Status
  signIn: (t: AuthTokens) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const qc = useQueryClient()

  useEffect(() => {
    void loadSession().then((s) => setStatus(s ? 'signedIn' : 'signedOut'))
    // Session refusée par l'API (jeton révoqué) : retour à l'accueil
    return onSessionChange((s) => {
      setStatus(s ? 'signedIn' : 'signedOut')
      if (!s) qc.clear()
    })
  }, [qc])

  const value: AuthValue = {
    status,
    signIn: (t) => setSession(t),
    signOut: async () => {
      const s = getSession()
      if (s) await api('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken }, auth: false }).catch(() => undefined)
      await setSession(null)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth hors de AuthProvider')
  return v
}
