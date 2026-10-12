'use client'

import { useState } from 'react'
import { Headphones, VideoCamera } from '@phosphor-icons/react'
import { dayMonth } from '@cepca/shared'
import { useSermons } from '../../_lib/queries'
import { BackHeader, Chip, ChipRow, Empty, ErrorState, ListRow, Loading, Photo, Screen, Txt, color } from '../../_components/ui'

const FILTERS = [
  { label: 'Tout', type: undefined },
  { label: 'Audio', type: 'AUDIO' as const },
  { label: 'Vidéo', type: 'VIDEO' as const },
]

export default function Sermons() {
  const [f, setF] = useState(0)
  const q = useSermons(FILTERS[f].type)
  return (
    <Screen gap={12}>
      <BackHeader title="Prédications" fallback="/app" />
      <ChipRow wrap={false}>
        {FILTERS.map((x, i) => (
          <Chip key={x.label} label={x.label} active={f === i} onClick={() => setF(i)} />
        ))}
      </ChipRow>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune prédication pour ce filtre.</Empty>
      ) : (
        <div>
          {q.data.map((s) => {
            const video = s.mediaType === 'VIDEO'
            const I = video ? VideoCamera : Headphones
            return (
              <ListRow key={s.id} py={8} href={`/app/predications/${encodeURIComponent(s.id)}`}>
                <span style={{ position: 'relative', flex: 'none', width: 96, height: 72 }}>
                  <Photo uri={s.imageUrl} radius={14} style={{ position: 'absolute', inset: 0 }} />
                  <span style={{ position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, background: color.bg, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I size={12} weight="fill" aria-hidden />
                  </span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Txt as="span" size={11} weight={700} color={color.primary} style={{ display: 'block' }}>
                    {video ? 'Vidéo' : 'Audio'}
                    {s.durationSec ? ` · ${Math.round(s.durationSec / 60)} min` : ''}
                  </Txt>
                  <Txt as="span" serif size={20} lh={1.15} style={{ display: 'block' }}>
                    {s.title}
                  </Txt>
                  <Txt as="span" size={12} color={color.textMuted} clamp={1}>
                    {[s.speaker, dayMonth(s.publishedAt)].filter(Boolean).join(' · ')}
                  </Txt>
                </span>
              </ListRow>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
