import { Directory, File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { authHeaders, ensureFreshToken } from './api'
import { media } from './config'

// Fichiers gardés sur le téléphone : prédications hors ligne et documents téléchargés
const dir = (name: string) => new Directory(Paths.document, name)

export function localFile(folder: 'sermons' | 'documents' | 'receipts', name: string): File {
  return new File(dir(folder), name)
}

/** Téléchargement authentifié (les fichiers passent par l'API, qui contrôle les droits). */
export async function download(url: string, folder: 'sermons' | 'documents' | 'receipts', name: string): Promise<File> {
  const src = media(url)
  if (!src) throw new Error('Fichier indisponible')
  await ensureFreshToken()
  const d = dir(folder)
  if (!d.exists) d.create({ intermediates: true })
  const target = new File(d, name)
  return File.downloadFileAsync(src, target, { headers: authHeaders(), idempotent: true })
}

/** Ouvre la feuille de partage du système (lecteur PDF, Fichiers, WhatsApp…). */
export async function openFile(file: File, mimeType: string, title?: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage n’est pas disponible sur cet appareil.')
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title, UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined })
}

/** Nom de fichier sûr à partir d'un identifiant. */
export const safeName = (id: string, ext: string) => id.replace(/[^\w-]/g, '_') + '.' + ext
