
// Lecture côté serveur uniquement (composants serveur du portail) : l'API est appelée directement, sans passer par le navigateur.
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000'

export interface PublicNews {
  id: string
  kind: 'ACTUALITE' | 'COMMUNIQUE'
  kindLabel: string
  title: string
  excerpt: string
  source: string
  origin: string
  imageUrl: string | null
  publishedAt: string | null
  body?: string
}
export interface PublicConfession {
  code: string
  name: string
  website: string | null
}

/** Données publiques, rafraîchies toutes les minutes ; null si l'API est injoignable (la page s'affiche quand même). */
export async function publicGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api/public${path}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as T
  } catch {
    return null
  }
}
