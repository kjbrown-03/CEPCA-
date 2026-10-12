'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { CalendarBlank, HandHeart, House, Newspaper, User, type Icon } from '@phosphor-icons/react'
import { ApiError } from '@/lib/api'
import { useMe } from '../_lib/queries'
import { ErrorState, Loading, Screen } from '../_components/ui'

const TABS: Array<{ href: string; label: string; icon: Icon; match: (p: string) => boolean }> = [
  { href: '/app', label: 'Accueil', icon: House, match: (p) => p === '/app' || /^\/app\/(notifications|documents|projets|predications)/.test(p) },
  { href: '/app/actualites', label: 'Actualités', icon: Newspaper, match: (p) => p.startsWith('/app/actualites') },
  { href: '/app/contribuer', label: 'Contribuer', icon: HandHeart, match: (p) => p.startsWith('/app/contribuer') },
  { href: '/app/agenda', label: 'Agenda', icon: CalendarBlank, match: (p) => p.startsWith('/app/agenda') },
  { href: '/app/moi', label: 'Moi', icon: User, match: (p) => p.startsWith('/app/moi') },
]

/** Écrans à onglets : réservés aux fidèles connectés (sans session, le client d'API renvoie vers l'accueil). */
export default function TabsLayout({ children }: { children: ReactNode }) {
  const me = useMe()
  // 401 : la redirection vers /app/bienvenue est en cours
  const redirecting = me.isError && me.error instanceof ApiError && me.error.status === 401
  return (
    <div className="pwa-tabs">
      {me.isPending || redirecting ? (
        <Screen>
          <Loading minHeight={420} />
        </Screen>
      ) : me.isError ? (
        <Screen>
          <ErrorState error={me.error} onRetry={() => me.refetch()} />
        </Screen>
      ) : (
        children
      )}
      <TabBar />
    </div>
  )
}

/** Barre d'onglets : 5 onglets, actif vert + icône pleine. */
function TabBar() {
  const path = usePathname()
  return (
    <nav className="pwa-tabbar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const on = t.match(path)
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}>
            <t.icon size={24} weight={on ? 'fill' : 'regular'} aria-hidden />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
