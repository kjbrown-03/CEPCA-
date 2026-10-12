'use client'

import Link from 'next/link'
import { fmtMillions, fmtPct, pct } from '@cepca/shared'
import { useProjects } from '../../_lib/queries'
import { BackHeader, Empty, ErrorState, Loading, Photo, Progress, Screen, Txt, color } from '../../_components/ui'

export default function Projects() {
  const q = useProjects()
  return (
    <Screen gap={14}>
      <BackHeader title="Projets et campagnes" fallback="/app" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucun projet en cours.</Empty>
      ) : (
        q.data.map((p) => {
          const v = pct(p.raisedAmount, p.goalAmount)
          return (
            <Link key={p.id} href={`/app/projets/${encodeURIComponent(p.id)}`} className="pwa-press pwa-card" style={{ borderRadius: 22, overflow: 'hidden' }}>
              <Photo uri={p.imageUrl} style={{ height: 140 }} />
              <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Txt as="h2" size={15} weight={700} style={{ flex: 1 }}>
                    {p.title}
                  </Txt>
                  {p.goalAmount ? (
                    <Txt size={12} weight={700} color={color.primary}>
                      {fmtPct(v)}
                    </Txt>
                  ) : null}
                </div>
                {p.goalAmount ? <Progress value={v} /> : null}
                <Txt size={12} color={color.textMuted}>
                  {fmtMillions(p.raisedAmount)}
                  {p.goalAmount ? ` / ${fmtMillions(p.goalAmount)}` : ''} FCFA · {p.contributorCount} contributeurs
                </Txt>
              </div>
            </Link>
          )
        })
      )}
    </Screen>
  )
}
