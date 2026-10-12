'use client'

import { use } from 'react'
import { CheckCircle, Circle, HandHeart } from '@phosphor-icons/react'
import { fmtMillions, fmtPct, pct } from '@cepca/shared'
import { useProject } from '../../../_lib/queries'
import { BackHeader, Btn, Card, ErrorState, ListRow, Loading, Photo, Progress, Screen, Txt, color } from '../../../_components/ui'

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = useProject(id)
  const p = q.data
  return (
    <Screen gap={14}>
      <BackHeader title="Projet" fallback="/app/projets" />
      {q.isPending ? (
        <Loading />
      ) : q.isError || !p ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <Photo uri={p.imageUrl} radius={22} style={{ height: 200 }} />
          <Txt as="h2" serif size={30} lh={1.1}>
            {p.title}
          </Txt>
          <Txt size={15} lh={1.6} color={color.textMuted2} style={{ whiteSpace: 'pre-line' }}>
            {p.description}
          </Txt>
          <Card dark style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Txt serif size={34} color={color.onPrimary}>
                {p.goalAmount ? fmtPct(pct(p.raisedAmount, p.goalAmount)) : `${fmtMillions(p.raisedAmount)} FCFA`}
              </Txt>
              {p.endLabel ? (
                <Txt size={12} color={color.onPrimaryMuted} align="right">
                  Échéance : {p.endLabel}
                </Txt>
              ) : null}
            </div>
            {p.goalAmount ? <Progress value={pct(p.raisedAmount, p.goalAmount)} height={8} track={color.progressOnDark} fill={color.accent} /> : null}
            <Txt size={13} color={color.onPrimaryMuted2}>
              {p.goalAmount ? `${fmtMillions(p.raisedAmount)} sur ${fmtMillions(p.goalAmount)} FCFA · ` : ''}
              {p.contributorCount} contributeurs
            </Txt>
          </Card>

          {p.steps.length ? (
            <section style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Txt as="h3" serif size={22}>
                Étapes
              </Txt>
              {p.steps.map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  {s.done ? <CheckCircle size={18} weight="fill" color={color.primary} aria-label="Terminée" /> : <Circle size={18} color={color.textFaint} aria-label="À venir" />}
                  <Txt as="span" size={14} color={s.done ? color.text : color.textMuted}>
                    {s.label}
                  </Txt>
                </div>
              ))}
            </section>
          ) : null}

          {p.updates.length ? (
            <section>
              <Txt as="h3" serif size={22} style={{ marginBottom: 4 }}>
                Suivi du projet
              </Txt>
              {p.updates.map((u, i) => (
                <ListRow key={i} py={8} align="flex-start">
                  <Txt as="span" size={12} weight={700} color={color.textMuted} style={{ width: 62, flex: 'none' }}>
                    {u.date}
                  </Txt>
                  <Txt as="span" size={14} style={{ flex: 1 }}>
                    {u.title}
                  </Txt>
                </ListRow>
              ))}
            </section>
          ) : null}

          {p.collectOpen ? (
            <Btn label="Soutenir ce projet" icon={HandHeart} style={{ marginTop: 4 }} href={`/app/contribuer?projet=${encodeURIComponent(p.id)}`} />
          ) : (
            <Txt size={13} color={color.textMuted} align="center">
              La collecte de ce projet est fermée.
            </Txt>
          )}
        </>
      )}
    </Screen>
  )
}
