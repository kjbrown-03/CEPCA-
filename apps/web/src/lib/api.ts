// Client HTTP du back-office : même origine (/api relayé par Next), cookies httpOnly posés par l'API.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export function qs(q?: Query): string {
  if (!q) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

let refreshing: Promise<boolean> | null = null

/** Un seul renouvellement à la fois, même si plusieurs requêtes reçoivent 401 ensemble. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0))
  return refreshing
}

/** Session perdue : retour à l'écran de connexion, en gardant la page demandée. */
export function toLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith('/admin/connexion')) return
  const next = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.assign(`/admin/connexion?next=${next}`)
}

async function parseError(res: Response): Promise<ApiError> {
  let body: { code?: string; message?: string | string[]; fields?: Record<string, string> } = {}
  try {
    body = await res.json()
  } catch {
    // réponse sans JSON (proxy, coupure)
  }
  const msg = Array.isArray(body.message) ? body.message.join(' ') : body.message
  const fallback = res.status >= 500 ? 'Le service est momentanément indisponible. Réessayez dans un instant.' : 'La demande n’a pas abouti.'
  return new ApiError(res.status, body.code ?? `HTTP_${res.status}`, msg || fallback, body.fields)
}

async function send(method: string, path: string, body?: unknown, retried = false): Promise<Response> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Connexion impossible. Vérifiez votre réseau.')
  }
  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return send(method, path, body, true)
    toLogin()
  }
  if (!res.ok) throw await parseError(res)
  return res
}

async function json<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  get: <T>(path: string, q?: Query) => send('GET', path + qs(q)).then((r) => json<T>(r)),
  post: <T>(path: string, body: unknown = {}) => send('POST', path, body).then((r) => json<T>(r)),
  put: <T>(path: string, body: unknown) => send('PUT', path, body).then((r) => json<T>(r)),
  patch: <T>(path: string, body: unknown) => send('PATCH', path, body).then((r) => json<T>(r)),
  del: <T>(path: string) => send('DELETE', path).then((r) => json<T>(r)),
  upload: <T>(path: string, form: FormData) => send('POST', path, form).then((r) => json<T>(r)),
}

/** Dépôt d'un gros fichier (audio, vidéo) avec avancement de 0 à 1. */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (ratio: number) => void, retried = false): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Connexion interrompue pendant l’envoi du fichier.'))
    xhr.onload = async () => {
      if (xhr.status === 401 && !retried) {
        if (await refreshSession()) return uploadWithProgress<T>(path, form, onProgress, true).then(resolve, reject)
        toLogin()
      }
      let body: { code?: string; message?: string; fields?: Record<string, string> } = {}
      try {
        body = JSON.parse(xhr.responseText || '{}')
      } catch {
        // réponse sans JSON
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(new ApiError(xhr.status, body.code ?? `HTTP_${xhr.status}`, body.message ?? (xhr.status === 413 ? 'Fichier trop volumineux.' : 'L’envoi du fichier a échoué.'), body.fields))
    }
    xhr.send(form)
  })
}

/**
 * Téléchargement d'un fichier servi par l'API (export, PDF) : passe par fetch pour profiter du
 * renouvellement de session, puis enregistre le fichier sous le nom donné par l'API.
 */
export async function download(path: string, q?: Query): Promise<void> {
  const res = await send('GET', path + qs(q))
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? 'export'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Une erreur est survenue.'
}

/** Clé d'idempotence pour les créations sensibles (saisie manuelle). */
export function idempotencyKey(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
