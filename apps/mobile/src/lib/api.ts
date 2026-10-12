import type { AuthTokens } from '@cepca/shared'
import { API_URL } from './config'
import { getSession, setSession } from './session'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface RequestOptions {
  method?: Method
  body?: unknown
  /** false : n'envoie pas le jeton (inscription, annuaire) */
  auth?: boolean
}

// Un seul renouvellement à la fois : plusieurs requêtes qui reçoivent 401 attendent le même
let refreshing: Promise<boolean> | null = null

async function refresh(): Promise<boolean> {
  const s = getSession()
  if (!s) return false
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    })
    if (!res.ok) {
      // Jeton refusé : la session est terminée. Erreur réseau : on garde la session pour réessayer.
      if (res.status === 401 || res.status === 400) await setSession(null)
      return false
    }
    await setSession((await res.json()) as AuthTokens)
    return true
  } catch {
    return false
  }
}

function renewOnce(): Promise<boolean> {
  refreshing ??= refresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

/** En-têtes d'authentification, pour les téléchargements et les lecteurs média. */
export function authHeaders(): Record<string, string> {
  const s = getSession()
  return s ? { Authorization: `Bearer ${s.accessToken}` } : {}
}

/** Renouvelle le jeton s'il expire bientôt (téléchargements et lecteurs média, qui ne passent pas par api()). */
export async function ensureFreshToken(): Promise<void> {
  const s = getSession()
  if (s && Date.now() > s.expiresAt - 30_000) await renewOnce()
}

export async function api<T>(path: string, o: RequestOptions = {}, retried = false): Promise<T> {
  if (o.auth !== false) await ensureFreshToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (o.auth !== false) Object.assign(headers, authHeaders())

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { method: o.method ?? 'GET', headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre accès à Internet.')
  }

  if (res.status === 401 && o.auth !== false && !retried && getSession()) {
    if (await renewOnce()) return api<T>(path, o, true)
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { code?: string; message?: string | string[]; fields?: Record<string, string> } | null
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message
    throw new ApiError(res.status, data?.code ?? 'HTTP_' + res.status, message || 'Une erreur est survenue. Réessayez.', data?.fields)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  return 'Une erreur est survenue. Réessayez.'
}
