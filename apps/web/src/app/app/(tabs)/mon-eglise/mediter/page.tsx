'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BookOpen, Check, DownloadSimple, EnvelopeOpen, FilePdf, Headphones, VideoCamera } from '@phosphor-icons/react'
import { dayMonth, type DocumentDto, type SermonDto } from '@cepca/shared'
import { useDocuments, useReadings } from '../../../_lib/queries'
import { saveFile } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Card, Empty, ErrorState, ListRow, Loading, Overline, Screen, Txt, color } from '../../../_components/ui'

type Tab = 'med' | 'etu' | 'msg'
// Chaque onglet réunit les textes publiés dans l'app et les documents de la catégorie correspondante
const TABS: Record<Tab, { label: string; kind: 'MEDITATION' | 'ETUDE_BIBLIQUE' | 'MESSAGE_PASTORAL'; category: string; empty: string }> = {
  med: { label: 'Méditations', kind: 'MEDITATION', category: 'Méditations', empty: 'Aucune méditation pour le moment.' },
  etu: { label: 'Études', kind: 'ETUDE_BIBLIQUE', category: 'Études bibliques', empty: 'Aucune étude biblique pour le moment.' },
  msg: { label: 'Messages', kind: 'MESSAGE_PASTORAL', category: 'Lettres pastorales', empty: 'Aucun message pastoral pour le moment.' },
}

const minutes = (s: SermonDto) => (s.durationSec ? `${Math.max(1, Math.round(s.durationSec / 60))} min${s.mediaType === 'TEXT' ? ' de lecture' : ''}` : null)

/** Maquette 3 · « Lire et méditer » : documents et messages pastoraux. */
export default function Read() {
  const [tab, setTab] = useState<Tab>('med')
  const t = TABS[tab]
  const texts = useReadings(t.kind)
  const docs = useDocuments()
  const files = (docs.data ?? []).filter((d) => d.category === t.category)
  // Le dernier message du pasteur est mis en avant, comme dans la maquette
  const featured = tab === 'msg' ? texts.data?.[0] : undefined
  const list = (texts.data ?? []).filter((s) => s !== featured)

  return (
    <Screen gap={14}>
      <BackHeader title="Lire et méditer" fallback="/app/mon-eglise" />
      <div role="tablist" aria-label="Rubriques" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: color.primarySoft }}>
        {(Object.keys(TABS) as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ flex: '1 1 0', minWidth: 0, height: 38, borderRadius: 999, textAlign: 'center', fontSize: 13, fontWeight: 700, background: tab === k ? color.primary : 'transparent', color: tab === k ? color.onPrimary : color.text }}>
            {TABS[k].label}
          </button>
        ))}
      </div>

      {texts.isPending || docs.isPending ? (
        <Loading />
      ) : texts.isError ? (
        <ErrorState error={texts.error} onRetry={() => texts.refetch()} />
      ) : (
        <div role="tabpanel">
          {featured ? <Featured s={featured} /> : null}
          {list.map((s) => (
            <TextRow key={s.id} s={s} />
          ))}
          {files.map((d) => (
            <FileRow key={d.id} d={d} />
          ))}
          {!featured && list.length === 0 && files.length === 0 ? <Empty>{t.empty}</Empty> : null}
        </div>
      )}
    </Screen>
  )
}

function Featured({ s }: { s: SermonDto }) {
  return (
    <Link href={`/app/predications/${encodeURIComponent(s.id)}`} className="pwa-press" style={{ display: 'block', marginBottom: 8 }}>
      <Card dark style={{ padding: 18, borderRadius: 22 }}>
        <Overline color={color.accentLight}>Message du pasteur · {dayMonth(s.publishedAt)}</Overline>
        <Txt serif size={24} lh={1.12} color={color.onPrimary} style={{ marginTop: 8 }}>
          {s.title}
        </Txt>
        {s.body ? (
          <Txt size={13} lh={1.5} color={color.onPrimaryMuted} clamp={2} style={{ marginTop: 8 }}>
            {s.body.split(/\n\s*\n/)[0]}
          </Txt>
        ) : null}
        {s.speaker ? (
          <Txt size={12} weight={700} color={color.accentLight} style={{ marginTop: 10 }}>
            {s.speaker}
          </Txt>
        ) : null}
      </Card>
    </Link>
  )
}

function TextRow({ s }: { s: SermonDto }) {
  const I = s.kind === 'MESSAGE_PASTORAL' ? EnvelopeOpen : s.mediaType === 'AUDIO' ? Headphones : s.mediaType === 'VIDEO' ? VideoCamera : BookOpen
  const meta = s.kind === 'MESSAGE_PASTORAL' ? [dayMonth(s.publishedAt), s.speaker].filter(Boolean).join(' · ') : (minutes(s) ?? dayMonth(s.publishedAt))
  return (
    <ListRow href={`/app/predications/${encodeURIComponent(s.id)}`}>
      <I size={22} color={color.primary} aria-hidden style={{ flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={600} lh={1.3}>
          {s.title}
        </Txt>
        <Txt size={12} color={color.textMuted}>
          {meta}
        </Txt>
      </div>
    </ListRow>
  )
}

/** « 1,2 Mo », « 840 Ko » */
function size(bytes: number): string {
  if (bytes >= 1e6) return String(Math.round(bytes / 1e5) / 10).replace('.', ',') + ' Mo'
  return Math.max(1, Math.round(bytes / 1e3)) + ' Ko'
}

function FileRow({ d }: { d: DocumentDto }) {
  const toast = useToast()
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  async function open() {
    setState('busy')
    try {
      await saveFile(d.url)
      setState('done')
    } catch {
      toast('Le téléchargement a échoué. Réessayez.', 'error')
      setState('idle')
    }
  }
  return (
    <ListRow>
      <FilePdf size={22} color={color.primary} aria-hidden style={{ flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={600} lh={1.3}>
          {d.title}
        </Txt>
        <Txt size={12} color={color.textMuted}>
          {d.mimeType === 'application/pdf' ? 'PDF' : d.category} · {size(d.sizeBytes)}
        </Txt>
      </div>
      <button type="button" onClick={state === 'busy' ? undefined : open} aria-label={`Télécharger ${d.title}`} aria-busy={state === 'busy' || undefined} style={{ flex: 'none', width: 40, height: 40, borderRadius: 20, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {state === 'busy' ? <span className="pwa-spinner" style={{ width: 18, height: 18 }} /> : state === 'done' ? <Check size={18} weight="bold" aria-hidden /> : <DownloadSimple size={18} aria-hidden />}
      </button>
    </ListRow>
  )
}
