import type { MetadataRoute } from 'next'

/** Application des fidèles installable (PWA) : « Ajouter à l'écran d'accueil » ouvre /app comme une application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'CEPCA — Votre Église, où que vous soyez',
    short_name: 'CEPCA',
    description: 'Cultes en direct, annonces de votre paroisse et contributions par Mobile Money.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/app',
    scope: '/app/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4efe6',
    theme_color: '#f4efe6',
    categories: ['lifestyle', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Contribuer', url: '/app/contribuer', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Agenda', url: '/app/agenda', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
