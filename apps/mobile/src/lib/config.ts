import Constants from 'expo-constants'

/**
 * Adresse de l'API. En développement, sans EXPO_PUBLIC_API_URL, on prend l'IP de la machine
 * qui sert Metro (le téléphone la joint déjà) et le port de l'API.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return `http://${host || '127.0.0.1'}:4000/api`
}

export const API_URL = resolveApiUrl()
const API_ORIGIN = API_URL.replace(/\/api$/, '')

/**
 * Les URL de fichiers renvoyées par l'API sont construites sur son PUBLIC_URL. En dev il vaut
 * localhost, injoignable depuis un téléphone : on le remplace par l'adresse réellement utilisée.
 */
export function media(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, API_ORIGIN)
}
