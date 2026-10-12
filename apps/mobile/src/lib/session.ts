import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { AuthTokens } from '@cepca/shared'

// Jetons gardés dans le trousseau du téléphone (Keychain / Keystore), jamais en clair.
// Sur le web (aperçu de développement seulement), SecureStore n'existe pas : sessionStorage le remplace.
const KEY = 'cepca.session'
const store =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k: string) => globalThis.sessionStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.sessionStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.sessionStorage?.removeItem(k),
      }
    : SecureStore

export type Session = AuthTokens & { /** ms epoch */ expiresAt: number }

let current: Session | null = null
let loaded = false
const listeners = new Set<(t: Session | null) => void>()

export async function loadSession(): Promise<Session | null> {
  if (loaded) return current
  try {
    const raw = await store.getItemAsync(KEY)
    current = raw ? (JSON.parse(raw) as Session) : null
  } catch {
    current = null
  }
  loaded = true
  return current
}

export function getSession(): Session | null {
  return current
}

export async function setSession(t: AuthTokens | null): Promise<void> {
  const next: Session | null = t ? { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, expiresAt: Date.now() + t.expiresIn * 1000 } : null
  current = next
  loaded = true
  if (next) await store.setItemAsync(KEY, JSON.stringify(next))
  else await store.deleteItemAsync(KEY)
  listeners.forEach((l) => l(next))
}

export function onSessionChange(l: (t: Session | null) => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
