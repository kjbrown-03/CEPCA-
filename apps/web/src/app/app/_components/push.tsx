'use client'

import { useEffect, useState } from 'react'
import { BellRinging } from '@phosphor-icons/react'
import { api, errorMessage } from '@/lib/api'
import { useToast } from './toast'
import { Toggle, Txt, color } from './ui'

type State = 'loading' | 'unsupported' | 'install' | 'denied' | 'off' | 'on'

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Seuls l'adresse et les clés partent au serveur (son schéma refuse tout autre champ). */
function payload(sub: PushSubscription) {
  const j = sub.toJSON()
  return { endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/app/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
export async function forgetPush(): Promise<void> {
  if (!supported()) return
  try {
    const sub = await currentSubscription()
    if (!sub) return
    await api.del('/me/push-subscription', { endpoint: sub.endpoint }).catch(() => undefined)
    await sub.unsubscribe()
  } catch {
    // rien à défaire
  }
}

/** « Notifications sur ce téléphone » : abonnement Web Push du navigateur. */
export function PushToggle() {
  const toast = useToast()
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported()) {
      // iPhone : le push n'existe que pour l'application ajoutée à l'écran d'accueil (iOS 16.4 et plus)
      setState(isIos() && !standalone() ? 'install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    void currentSubscription().then((sub) => {
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
      // Resynchronise l'abonnement avec le compte connecté (téléphone partagé, base réinitialisée)
      if (sub) void api.post('/me/push-subscription', payload(sub)).catch(() => undefined)
    })
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const { key } = await api.get<{ key: string | null }>('/push/key')
      if (!key) {
        toast('Les notifications ne sont pas encore activées sur le serveur.', 'error')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
      await api.post('/me/push-subscription', payload(sub))
      setState('on')
      toast('Notifications activées')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    await forgetPush()
    setState('off')
    setBusy(false)
  }

  if (state === 'loading' || state === 'unsupported') return null
  const hint =
    state === 'install'
      ? 'Ajoutez d’abord CEPCA à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis ouvrez-la depuis son icône.'
      : state === 'denied'
        ? 'Les notifications sont bloquées pour CEPCA. Autorisez-les dans les réglages du navigateur.'
        : 'Annonces, cultes en direct et reçus, même application fermée.'
  return (
    <div className="pwa-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, margin: '4px 0 10px' }}>
      <BellRinging size={22} color={color.primary} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={700}>
          Notifications sur ce téléphone
        </Txt>
        <Txt size={12} color={color.textMuted} lh={1.45}>
          {hint}
        </Txt>
      </div>
      {state === 'on' || state === 'off' ? (
        <span style={{ opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
          <Toggle value={state === 'on'} onChange={(v) => void (v ? enable() : disable())} label="Recevoir les notifications sur ce téléphone" />
        </span>
      ) : null}
    </div>
  )
}
