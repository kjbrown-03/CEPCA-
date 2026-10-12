'use client'

import Link from 'next/link'
import { useState } from 'react'
import { dayMonth, type Scope } from '@cepca/shared'
import { usePublications } from '../../_lib/queries'
import { Chip, ChipRow, Empty, ErrorState, Loading, Overline, Photo, Screen, Txt } from '../../_components/ui'

const FILTERS: Array<{ label: string; scope?: Scope }> = [
  { label: 'Tout' },
  { label: 'Paroisse', scope: 'PAROISSE' },
  { label: 'Confession', scope: 'CONFESSION' },
  { label: 'CEPCA', scope: 'CEPCA' },
]

export default function News() {
  const [f, setF] = useState(0)
  const q = usePublications(FILTERS[f].scope)
  return (
    <Screen gap={14}>
      <Txt as="h1" serif size={34} lh={1.05}>
        Actualités
      </Txt>
      <ChipRow>
        {FILTERS.map((x, i) => (
          <Chip key={x.label} label={x.label} active={f === i} onClick={() => setF(i)} />
        ))}
      </ChipRow>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune publication pour ce filtre.</Empty>
      ) : (
        q.data.map((n) => (
          <Link key={n.id} href={`/app/actualites/${encodeURIComponent(n.id)}`} className="pwa-press" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
            <Photo uri={n.imageUrl} radius={20} style={{ height: 170 }} />
            <Overline>
              {n.kindLabel} · {n.source} · {dayMonth(n.publishedAt)}
            </Overline>
            <Txt as="h2" serif size={23} lh={1.15}>
              {n.title}
            </Txt>
          </Link>
        ))
      )}
    </Screen>
  )
}
