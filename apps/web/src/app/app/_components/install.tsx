'use client'

import { useEffect, useState } from 'react'
import { DeviceMobile, Export, X } from '@phosphor-icons/react'
import { Txt, color } from './ui'

const KEY = 'cepca.install.dismissed'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Invitation à installer l'application sur l'écran d'accueil.
 * Android (Chrome) : bouton qui ouvre la fenêtre d'installation. iPhone : Safari n'en a pas, on explique le geste.
 */
export function InstallBanner() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [ios, setIos] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(KEY) === '1'
    } catch {
      // stockage indisponible
    }
    if (standalone || dismissed) return
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIos(isIos)
    if (isIos) setHidden(false)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as InstallEvent)
      setHidden(false)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || (!ios && !evt)) return null

  const dismiss = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(KEY, '1')
    } catch {
      // le choix vaut pour la page
    }
  }

  return (
    <div className="pwa-install">
      <DeviceMobile size={26} color={color.primary} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={700}>
          Installer l’application
        </Txt>
        {ios ? (
          <Txt size={12} color={color.textMuted} lh={1.45}>
            Touchez <Export size={13} style={{ verticalAlign: '-2px' }} aria-label="Partager" /> puis « Sur l’écran d’accueil ».
          </Txt>
        ) : (
          <Txt size={12} color={color.textMuted} lh={1.45}>
            Ouvrez CEPCA comme une application, depuis votre écran d’accueil.
          </Txt>
        )}
      </div>
      {evt ? (
        <button
          type="button"
          className="pwa-btn primary"
          style={{ height: 36, fontSize: 13, padding: '0 14px' }}
          onClick={async () => {
            await evt.prompt()
            const r = await evt.userChoice
            if (r.outcome === 'accepted') setHidden(true)
            setEvt(null)
          }}
        >
          Installer
        </button>
      ) : null}
      <button type="button" aria-label="Fermer" onClick={dismiss} style={{ color: color.textMuted, padding: 4 }}>
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
