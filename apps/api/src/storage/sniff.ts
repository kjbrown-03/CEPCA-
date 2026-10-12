// Type réel d'un fichier déposé, lu dans ses premiers octets. Le type annoncé par le navigateur n'est jamais cru.

export type Kind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | 'audio/mpeg' | 'audio/mp4' | 'video/mp4'

export const EXT: Record<Kind, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
}

/** Formats acceptés par champ : un PDF ne passe pas là où l'on attend une image. */
export const ACCEPT = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  document: ['application/pdf'],
  audio: ['audio/mpeg', 'audio/mp4'],
  video: ['video/mp4'],
} as const satisfies Record<string, readonly Kind[]>

export function sniff(head: Buffer): Kind | null {
  const ascii = (from: number, to: number) => head.subarray(from, to).toString('latin1')
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (head.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf'
  if (head.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg'
  // Trame MPEG sans balise ID3 : 11 bits de synchronisation
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  if (head.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    return brand.startsWith('M4A') || brand.startsWith('M4B') ? 'audio/mp4' : 'video/mp4'
  }
  return null
}
