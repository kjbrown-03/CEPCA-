import type { Metadata } from 'next'
import { AdminProviders } from './providers'
import './admin.css'

export const metadata: Metadata = { title: { default: 'Back-office', template: '%s · Back-office CEPCA' }, robots: { index: false, follow: false } }

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminProviders>{children}</AdminProviders>
}
