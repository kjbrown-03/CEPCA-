'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'

type Tone = 'ok' | 'error'
const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {})

export const useToast = () => useContext(Ctx)

/** Toast en bas au centre, vert très foncé, icône ocre, disparaît après 2,4 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: Tone; n: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string, tone: Tone = 'ok') => setMsg((m) => ({ text, tone, n: (m?.n ?? 0) + 1 })), [])

  useEffect(() => {
    if (!msg) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2400)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [msg])

  const I = msg?.tone === 'error' ? WarningCircle : CheckCircle
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">
        {msg ? (
          <div key={msg.n} className="pwa-toast">
            <I size={18} weight="fill" color="var(--c-accent)" aria-hidden />
            {msg.text}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  )
}
