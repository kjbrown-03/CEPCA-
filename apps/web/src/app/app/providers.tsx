'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { ToastProvider } from './_components/toast'

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            // Pas de nouvel essai sur une erreur métier (404, 403…) : seulement sur le réseau et les 5xx
            retry: (n, e) => n < 2 && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500),
          },
        },
      }),
  )

  // Service worker : installation, page hors ligne, notifications push
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/app/', updateViaCache: 'none' }).catch(() => undefined)
  }, [])

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
