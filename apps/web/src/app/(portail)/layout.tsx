import { cookies } from 'next/headers'
import { PortalFooter, PortalHeader } from './_components/chrome'
import './portal.css'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Thème choisi lors d'une visite précédente, rendu côté serveur (pas d'éclair au chargement)
  const theme = (await cookies()).get('cepca_theme')?.value === 'dark' ? 'dark' : 'light'
  return (
    <div className="portal" data-theme={theme}>
      <PortalHeader theme={theme} />
      {children}
      <PortalFooter />
    </div>
  )
}
