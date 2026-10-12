import { useEffect, useState, type ReactNode } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useEvent } from 'expo'
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'
import { ArrowSquareOutIcon, CheckCircleIcon, ClockClockwiseIcon, ClockCounterClockwiseIcon, DownloadSimpleIcon, PauseIcon, PlayIcon } from 'phosphor-react-native'
import { dayMonth, type SermonDto } from '@cepca/shared'
import { useSermon } from '@/lib/queries'
import { authHeaders } from '@/lib/api'
import { media } from '@/lib/config'
import { download, localFile, safeName } from '@/lib/files'
import { BackHeader, Btn, ErrorState, Loading, Photo, Progress, RoundButton, Screen } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

const SPEEDS = [1, 1.5, 2] as const
const speedLabel = (r: number) => String(r).replace('.', ',') + '×'
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

interface Ctl {
  playing: boolean
  time: number
  duration: number
  rate: number
  ready: boolean
  toggle: () => void
  seekBy: (d: number) => void
  setRate: (r: number) => void
}

type Source = { uri: string; headers?: Record<string, string> } | null

export default function SermonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useSermon(id)
  if (q.isPending || q.isError) {
    return (
      <Screen>
        <BackHeader title="Prédication" fallback="/home/sermons" />
        {q.isPending ? <Loading /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      </Screen>
    )
  }
  return <Sermon s={q.data} />
}

function fileFor(s: SermonDto) {
  return localFile('sermons', safeName(s.id, s.mediaType === 'VIDEO' ? 'mp4' : 'mp3'))
}

function Sermon({ s }: { s: SermonDto }) {
  // Source fixée à l'ouverture : un téléchargement en cours de lecture ne coupe pas le son
  const [source] = useState<Source>(() => {
    const f = fileFor(s)
    if (f.exists) return { uri: f.uri }
    const url = media(s.mediaUrl)
    return url ? { uri: url, headers: authHeaders() } : null
  })
  if (!source) return <Layout s={s} ctl={null} />
  return s.mediaType === 'VIDEO' ? <VideoSermon s={s} source={source} /> : <AudioSermon s={s} source={source} />
}

function AudioSermon({ s, source }: { s: SermonDto; source: NonNullable<Source> }) {
  const player = useAudioPlayer(source, { updateInterval: 500 })
  const st = useAudioPlayerStatus(player)
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })
  }, [])
  const duration = st.duration || s.durationSec || 0
  const ctl: Ctl = {
    playing: st.playing,
    time: st.currentTime,
    duration,
    rate: st.playbackRate || 1,
    ready: st.isLoaded,
    toggle: () => {
      if (st.playing) player.pause()
      else {
        if (duration && st.currentTime >= duration - 0.5) void player.seekTo(0)
        player.play()
      }
    },
    seekBy: (d) => void player.seekTo(Math.max(0, Math.min(duration, st.currentTime + d))),
    setRate: (r) => player.setPlaybackRate(r),
  }
  return <Layout s={s} ctl={ctl} />
}

function VideoSermon({ s, source }: { s: SermonDto; source: NonNullable<Source> }) {
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.5
  })
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing })
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: player.currentTime, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 })
  const { status } = useEvent(player, 'statusChange', { status: player.status })
  const [rate, setRateState] = useState(1)
  const [started, setStarted] = useState(false)
  const duration = player.duration || s.durationSec || 0
  const ctl: Ctl = {
    playing: isPlaying,
    time: currentTime,
    duration,
    rate,
    ready: status === 'readyToPlay',
    toggle: () => {
      setStarted(true)
      if (player.playing) player.pause()
      else player.play()
    },
    seekBy: (d) => player.seekBy(d),
    setRate: (r) => {
      player.playbackRate = r
      setRateState(r)
    },
  }
  return <Layout s={s} ctl={ctl} video={started ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} fullscreenOptions={{ enable: true }} /> : null} />
}

/** Mise en page commune : visuel, titre, progression, commandes, hors ligne. */
function Layout({ s, ctl, video }: { s: SermonDto; ctl: Ctl | null; video?: ReactNode }) {
  const isVideo = s.mediaType === 'VIDEO'
  const duration = ctl?.duration || s.durationSec || 0
  const time = ctl?.time ?? 0
  const PlayI = ctl?.playing ? PauseIcon : PlayIcon
  const off = !ctl
  return (
    <Screen gap={16} bottom={28}>
      <BackHeader title={isVideo ? 'Vidéo' : 'Audio'} fallback="/home/sermons" />
      <View style={{ height: isVideo ? 196 : 250, borderRadius: 22, overflow: 'hidden', backgroundColor: color.deep }}>
        {video ?? (
          <>
            <Photo uri={s.imageUrl} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(16,42,28,${isVideo ? 0.25 : 0.1})` }]} />
          </>
        )}
        {video && ctl?.playing ? null : (
          <Pressable
            onPress={ctl?.toggle}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={ctl?.playing ? 'Pause' : 'Lecture'}
            style={{ position: 'absolute', left: '50%', top: '50%', marginLeft: -34, marginTop: -34, width: 68, height: 68, borderRadius: 34, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.6 : 1, boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}
          >
            <PlayI size={28} weight="fill" color={color.primary} />
          </Pressable>
        )}
        {video && ctl?.playing ? <Pressable onPress={ctl.toggle} accessibilityLabel="Pause" style={StyleSheet.absoluteFill} /> : null}
      </View>

      <View>
        {s.scriptureRef ? (
          <Txt size={12} weight={700} color={color.primary}>
            {s.scriptureRef}
          </Txt>
        ) : null}
        <Txt serif size={30} lh={1.1} style={{ marginTop: 4 }} accessibilityRole="header">
          {s.title}
        </Txt>
        <Txt size={13} color={color.textMuted} style={{ marginTop: 4 }}>
          {[s.speaker, dayMonth(s.publishedAt)].filter(Boolean).join(' · ')}
        </Txt>
      </View>

      <View style={{ gap: 6 }}>
        <Progress value={duration ? (time / duration) * 100 : 0} track={extra.divider} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt size={12} color={color.textMuted} tabular>
            {mmss(time)}
          </Txt>
          <Txt size={12} color={color.textMuted} tabular>
            {mmss(duration)}
          </Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: off ? 0.45 : 1 }} pointerEvents={off ? 'none' : 'auto'}>
        <Pressable
          onPress={() => ctl?.setRate(SPEEDS[(SPEEDS.indexOf(ctl.rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length])}
          accessibilityRole="button"
          accessibilityLabel={`Vitesse ${speedLabel(ctl?.rate ?? 1)}`}
          style={{ width: 48, height: 36, borderRadius: 999, borderWidth: 1, borderColor: extra.fieldBorder, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt size={13} weight={700}>
            {speedLabel(ctl?.rate ?? 1)}
          </Txt>
        </Pressable>
        <Pressable onPress={() => ctl?.seekBy(-15)} accessibilityRole="button" accessibilityLabel="Reculer de 15 s" hitSlop={8}>
          <ClockCounterClockwiseIcon size={28} color={color.text} />
        </Pressable>
        <Pressable onPress={ctl?.toggle} accessibilityRole="button" accessibilityLabel={ctl?.playing ? 'Pause' : 'Lecture'} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <PlayI size={26} weight="fill" color={color.onPrimary} />
        </Pressable>
        <Pressable onPress={() => ctl?.seekBy(15)} accessibilityRole="button" accessibilityLabel="Avancer de 15 s" hitSlop={8}>
          <ClockClockwiseIcon size={28} color={color.text} />
        </Pressable>
        <OfflineButton s={s} />
      </View>
      {off ? <NoMedia s={s} /> : <OfflineHint s={s} />}
    </Screen>
  )
}

// L'état hors ligne est partagé entre le bouton et sa légende via un petit abonnement
const offlineListeners = new Set<() => void>()
function useOffline(s: SermonDto) {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    offlineListeners.add(l)
    return () => {
      offlineListeners.delete(l)
    }
  }, [])
  return fileFor(s).exists
}
const notifyOffline = () => offlineListeners.forEach((l) => l())

function OfflineButton({ s }: { s: SermonDto }) {
  const toast = useToast()
  const saved = useOffline(s)
  const [busy, setBusy] = useState(false)
  const allowed = s.offlineAllowed && !!s.mediaUrl

  async function toggle() {
    if (saved) {
      fileFor(s).delete()
      notifyOffline()
      toast('Retiré du téléphone')
      return
    }
    setBusy(true)
    try {
      await download(s.mediaUrl!, 'sermons', fileFor(s).name)
      notifyOffline()
      toast('Disponible hors ligne')
    } catch {
      toast('Le téléchargement a échoué. Réessayez.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const I = saved ? CheckCircleIcon : DownloadSimpleIcon
  return (
    <RoundButton
      label={saved ? 'Retirer la version hors ligne' : 'Télécharger pour écouter sans connexion'}
      onPress={allowed && !busy ? toggle : () => {}}
      style={{ width: 48, height: 36, borderRadius: 999, opacity: allowed ? (busy ? 0.5 : 1) : 0.4 }}
    >
      <I size={17} weight={saved ? 'fill' : 'regular'} color={saved ? color.primary : color.text} />
    </RoundButton>
  )
}

function OfflineHint({ s }: { s: SermonDto }) {
  const saved = useOffline(s)
  const text = !s.offlineAllowed ? 'Cette prédication s’écoute en ligne uniquement' : saved ? 'Disponible hors ligne' : 'Téléchargez pour écouter sans connexion'
  return (
    <Txt size={12} color={color.textMuted} align="center">
      {text}
    </Txt>
  )
}

function NoMedia({ s }: { s: SermonDto }) {
  if (s.externalUrl) {
    return <Btn label="Écouter sur la page de la paroisse" icon={ArrowSquareOutIcon} variant="outline" height={48} size={14} onPress={() => void Linking.openURL(s.externalUrl!)} />
  }
  return (
    <Txt size={12} color={color.textMuted} align="center" lh={1.5}>
      L’enregistrement de cette prédication n’est pas encore en ligne.
    </Txt>
  )
}
