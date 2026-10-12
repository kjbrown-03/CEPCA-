'use client'

import { use, useEffect, useRef, useState } from 'react'
import { ArrowSquareOut, CheckCircle, ClockClockwise, ClockCounterClockwise, DownloadSimple, Pause, Play } from '@phosphor-icons/react'
import { dayMonth, type SermonDto } from '@cepca/shared'
import { useSermon } from '../../../_lib/queries'
import { canKeepOffline, isOffline, playableUrl, removeOffline, saveOffline } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Btn, ErrorState, Loading, Photo, Progress, Screen, Txt, color } from '../../../_components/ui'

const SPEEDS = [1, 1.5, 2] as const
const speedLabel = (r: number) => String(r).replace('.', ',') + '×'
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export default function SermonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = useSermon(id)
  if (q.isPending || q.isError)
    return (
      <Screen>
        <BackHeader title="Prédication" fallback="/app/predications" />
        {q.isPending ? <Loading /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </Screen>
    )
  return <Sermon s={q.data} />
}

/** Lecteur commun audio et vidéo : la balise média du navigateur, avec les commandes de la maquette. */
function Sermon({ s }: { s: SermonDto }) {
  const isVideo = s.mediaType === 'VIDEO'
  const el = useRef<HTMLAudioElement & HTMLVideoElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(s.durationSec ?? 0)
  const [rate, setRate] = useState(1)
  const [started, setStarted] = useState(false)

  // Version gardée sur le téléphone si elle existe, sinon le flux en ligne (fixée à l'ouverture)
  useEffect(() => {
    if (!s.mediaUrl) return
    let blob: string | null = null
    void playableUrl(s.mediaUrl).then((u) => {
      if (u.startsWith('blob:')) blob = u
      setSrc(u)
    })
    return () => {
      if (blob) URL.revokeObjectURL(blob)
    }
  }, [s.mediaUrl])

  // Écran verrouillé et casque : titre et commandes dans le centre de contrôle du téléphone
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.speaker ?? 'CEPCA', album: 'Prédications' })
    navigator.mediaSession.setActionHandler('seekbackward', () => seekBy(-15))
    navigator.mediaSession.setActionHandler('seekforward', () => seekBy(15))
    return () => {
      navigator.mediaSession.metadata = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id])

  const off = !s.mediaUrl || !src
  const duration = dur || s.durationSec || 0

  function toggle() {
    const m = el.current
    if (!m) return
    setStarted(true)
    if (m.paused) {
      if (duration && m.currentTime >= duration - 0.5) m.currentTime = 0
      void m.play().catch(() => undefined)
    } else m.pause()
  }
  function seekBy(d: number) {
    const m = el.current
    if (!m) return
    m.currentTime = Math.max(0, Math.min(m.duration || duration, m.currentTime + d))
  }
  function nextRate() {
    const r = SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]
    if (el.current) el.current.playbackRate = r
    setRate(r)
  }

  const mediaProps = {
    ref: el,
    src: src ?? undefined,
    preload: 'metadata' as const,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime(e.currentTarget.currentTime),
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration),
  }
  const PlayI = playing ? Pause : Play

  return (
    <Screen gap={16}>
      <BackHeader title={isVideo ? 'Vidéo' : 'Audio'} fallback="/app/predications" />
      <div style={{ position: 'relative', height: isVideo ? 196 : 250, borderRadius: 22, overflow: 'hidden', background: color.deep }}>
        {isVideo ? (
          <video {...mediaProps} playsInline onClick={toggle} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: started ? 'block' : 'none' }} />
        ) : (
          <audio {...mediaProps} />
        )}
        {isVideo && started ? null : (
          <>
            <Photo uri={s.imageUrl} style={{ position: 'absolute', inset: 0 }} />
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `rgba(16,42,28,${isVideo ? 0.25 : 0.1})` }} />
          </>
        )}
        {isVideo && playing ? null : (
          <button
            type="button"
            onClick={toggle}
            disabled={off}
            aria-label={playing ? 'Pause' : 'Lecture'}
            style={{ position: 'absolute', left: '50%', top: '50%', margin: '-34px 0 0 -34px', width: 68, height: 68, borderRadius: 34, background: color.bg, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: off ? 0.6 : 1, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}
          >
            <PlayI size={28} weight="fill" aria-hidden />
          </button>
        )}
      </div>

      <div>
        {s.scriptureRef ? (
          <Txt size={12} weight={700} color={color.primary}>
            {s.scriptureRef}
          </Txt>
        ) : null}
        <Txt as="h2" serif size={30} lh={1.1} style={{ marginTop: 4 }}>
          {s.title}
        </Txt>
        <Txt size={13} color={color.textMuted} style={{ marginTop: 4 }}>
          {[s.speaker, dayMonth(s.publishedAt)].filter(Boolean).join(' · ')}
        </Txt>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Progress value={duration ? (time / duration) * 100 : 0} track={color.divider} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Txt as="span" size={12} color={color.textMuted} tabular>
            {mmss(time)}
          </Txt>
          <Txt as="span" size={12} color={color.textMuted} tabular>
            {mmss(duration)}
          </Txt>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: off ? 0.45 : 1, pointerEvents: off ? 'none' : 'auto' }}>
        <button type="button" onClick={nextRate} aria-label={`Vitesse ${speedLabel(rate)}`} className="pwa-round" style={{ width: 48, height: 36, borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
          {speedLabel(rate)}
        </button>
        <button type="button" onClick={() => seekBy(-15)} aria-label="Reculer de 15 s">
          <ClockCounterClockwise size={28} aria-hidden />
        </button>
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Lecture'} style={{ width: 64, height: 64, borderRadius: 32, background: color.primary, color: color.onPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <PlayI size={26} weight="fill" aria-hidden />
        </button>
        <button type="button" onClick={() => seekBy(15)} aria-label="Avancer de 15 s">
          <ClockClockwise size={28} aria-hidden />
        </button>
        <OfflineButton s={s} />
      </div>
      {!s.mediaUrl ? <NoMedia s={s} /> : <OfflineHint s={s} />}
    </Screen>
  )
}

// L'état hors ligne est partagé entre le bouton et sa légende via un petit abonnement
const listeners = new Set<() => void>()
function useKept(s: SermonDto): boolean | null {
  const [kept, setKept] = useState<boolean | null>(null)
  useEffect(() => {
    const check = () => {
      if (s.mediaUrl && canKeepOffline()) void isOffline(s.mediaUrl).then(setKept)
      else setKept(false)
    }
    check()
    listeners.add(check)
    return () => {
      listeners.delete(check)
    }
  }, [s.mediaUrl])
  return kept
}
const notify = () => listeners.forEach((l) => l())

function OfflineButton({ s }: { s: SermonDto }) {
  const toast = useToast()
  const kept = useKept(s)
  const [busy, setBusy] = useState(false)
  const allowed = s.offlineAllowed && !!s.mediaUrl && canKeepOffline()

  async function toggle() {
    if (!allowed || busy || !s.mediaUrl) return
    setBusy(true)
    try {
      if (kept) {
        await removeOffline(s.mediaUrl)
        toast('Retiré du téléphone')
      } else {
        await saveOffline(s.mediaUrl)
        toast('Disponible hors ligne')
      }
      notify()
    } catch {
      toast('Le téléchargement a échoué. Réessayez.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const I = kept ? CheckCircle : DownloadSimple
  return (
    <button
      type="button"
      className="pwa-round"
      onClick={toggle}
      disabled={!allowed}
      aria-label={kept ? 'Retirer la version hors ligne' : 'Télécharger pour écouter sans connexion'}
      style={{ width: 48, height: 36, borderRadius: 999, opacity: allowed ? (busy ? 0.5 : 1) : 0.4, color: kept ? color.primary : color.text }}
    >
      {busy ? <span className="pwa-spinner" style={{ width: 16, height: 16 }} /> : <I size={17} weight={kept ? 'fill' : 'regular'} aria-hidden />}
    </button>
  )
}

function OfflineHint({ s }: { s: SermonDto }) {
  const kept = useKept(s)
  const text = !s.offlineAllowed ? 'Cette prédication s’écoute en ligne uniquement' : kept ? 'Disponible hors ligne' : 'Téléchargez pour écouter sans connexion'
  return (
    <Txt size={12} color={color.textMuted} align="center">
      {text}
    </Txt>
  )
}

function NoMedia({ s }: { s: SermonDto }) {
  if (s.externalUrl) return <Btn label="Écouter sur la page de la paroisse" icon={ArrowSquareOut} variant="outline" height={48} size={14} href={s.externalUrl} external />
  return (
    <Txt size={12} color={color.textMuted} align="center" lh={1.5}>
      L’enregistrement de cette prédication n’est pas encore en ligne.
    </Txt>
  )
}
