import Link from 'next/link'
import { Cross } from '@phosphor-icons/react/dist/ssr'
import { ThemeToggle } from './theme-toggle'

export function PortalHeader({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <header className="p-header">
      <div className="wrap">
        <Link href="/" className="p-logo" aria-label="CEPCA, accueil">
          <span className="mark">
            <Cross size={18} weight="bold" />
          </span>
          <span className="name">CEPCA</span>
        </Link>
        <nav className="p-nav" aria-label="Sections">
          <Link href="/#eglises">Églises membres</Link>
          <Link href="/#actualites">Actualités</Link>
          <Link href="/#contact">Contact</Link>
        </nav>
        <div className="p-actions">
          <ThemeToggle initial={theme} />
          <Link href="/admin/connexion" className="p-signin">
            Espace responsables
          </Link>
          {/* Application des fidèles (PWA) : installable depuis le navigateur du téléphone */}
          <Link href="/app" className="p-cta">
            Application
          </Link>
        </div>
      </div>
    </header>
  )
}

export function PortalFooter() {
  return (
    <footer className="p-footer">
      <div className="wrap cols">
        <div className="col" style={{ gap: 14 }}>
          <span style={{ font: '34px/1 var(--font-serif), serif', color: '#f4efe6' }}>CEPCA</span>
          <span style={{ lineHeight: 1.6 }}>Conseil des Églises Protestantes du Cameroun</span>
        </div>
        <div className="col">
          <span className="h">Plateforme</span>
          <Link href="/#eglises">Églises membres</Link>
          <Link href="/actualites">Actualités</Link>
        </div>
        <div className="col">
          <span className="h">Informations</span>
          <Link href="/#contact">Contact</Link>
          <Link href="/admin/connexion">Espace responsables</Link>
        </div>
      </div>
      <div className="wrap legal">© {new Date().getFullYear()} CEPCA · Photos d’illustration Unsplash, à remplacer par les photos du CEPCA.</div>
    </footer>
  )
}

/** Photo d'un article ; à défaut, un aplat vert portant le sigle de la source. */
export function NewsPhoto({ src, source, eager }: { src: string | null; source: string; eager?: boolean }) {
  return (
    <div className="photo">
      {src ? (
        // Photos servies par l'API ou par Unsplash : pas d'optimisation d'image côté Next
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} />
      ) : (
        <div className="no-photo" aria-hidden="true">
          {source}
        </div>
      )}
    </div>
  )
}
