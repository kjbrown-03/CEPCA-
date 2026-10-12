import type { NotificationDto } from '@cepca/shared'

/** Écran lié à une notification (link.screen reprend les noms d'écrans de la maquette). */
export function notificationTarget(link: NotificationDto['link']): string | null {
  if (!link) return null
  const id = link.id ? encodeURIComponent(link.id) : ''
  switch (link.screen) {
    case 'evt':
      return id ? `/app/agenda/${id}` : '/app/agenda'
    case 'newsD':
      return id ? `/app/actualites/${id}` : '/app/actualites'
    case 'sermD':
      return id ? `/app/predications/${id}` : '/app/predications'
    case 'projD':
      return id ? `/app/projets/${id}` : '/app/projets'
    case 'receipt':
      return id ? `/app/contribuer/recu/${id}` : '/app/contribuer/historique'
    case 'hist':
      return '/app/contribuer/historique'
    case 'docs':
      return '/app/documents'
    case 'prof':
      return '/app/moi'
    default:
      return null
  }
}
