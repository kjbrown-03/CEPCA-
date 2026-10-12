'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Buildings, Church, ClockCounterClockwise, Repeat } from '@phosphor-icons/react'
import { MAX_CONTRIBUTION, MIN_CONTRIBUTION, fcfaToEur, fmtInt, operatorFee } from '@cepca/shared'
import { useContributionTypes, useMe, useProjects } from '../../_lib/queries'
import { Btn, Card, Chip, ChipRow, ErrorState, Loading, Screen, SelectRow, Toggle, Txt, color } from '../../_components/ui'

const PRESETS = [5000, 10000, 25000, 50000]

export default function GivePage() {
  return (
    <Suspense>
      <Give />
    </Suspense>
  )
}

function Give() {
  const router = useRouter()
  const params = useSearchParams()
  const me = useMe()
  const member = !!me.data?.membership
  const types = useContributionTypes(member)
  const projects = useProjects()
  const [typeKey, setTypeKey] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [amount, setAmount] = useState(25000)
  const [recurring, setRecurring] = useState(false)

  const open = projects.data?.filter((p) => p.collectOpen) ?? []
  const type = types.data?.find((t) => t.key === typeKey) ?? null
  const wanted = params.get('projet')

  // Premier type par défaut (la maquette présélectionne la dîme si elle existe)
  useEffect(() => {
    if (!typeKey && types.data?.length) setTypeKey((types.data.find((t) => t.key === 'dime') ?? types.data[0]).key)
  }, [typeKey, types.data])

  // « Soutenir ce projet » : préremplit le type Projet et le projet
  useEffect(() => {
    if (!wanted || !types.data) return
    const t = types.data.find((x) => x.requiresProject)
    if (t) setTypeKey(t.key)
    setProjectId(wanted)
    router.replace('/app/contribuer', { scroll: false })
  }, [wanted, types.data, router])

  useEffect(() => {
    if (type?.requiresProject && !projectId && open.length) setProjectId(open[0].id)
  }, [type, projectId, open])

  if (me.isPending)
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  if (me.isError)
    return (
      <Screen>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </Screen>
    )

  const fee = operatorFee(amount)
  const project = type?.requiresProject ? (open.find((p) => p.id === projectId) ?? null) : null
  const canGo = !!type && amount >= MIN_CONTRIBUTION && (!type.requiresProject || !!project)
  const destination = project?.title ?? me.data.membership?.structure.name ?? ''

  function next() {
    if (!type || !canGo) return
    const q = new URLSearchParams({ type: type.key, montant: String(amount), ...(project ? { projet: project.id } : {}), ...(recurring ? { mensuel: '1' } : {}) })
    router.push(`/app/contribuer/payer?${q}`)
  }

  return (
    <Screen gap={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt as="h1" serif size={34} lh={1.05}>
          Je contribue
        </Txt>
        <Btn label="Historique" icon={ClockCounterClockwise} iconWeight="regular" variant="outline" height={38} size={13} style={{ padding: '0 14px', gap: 6 }} href="/app/contribuer/historique" />
      </div>

      {!member ? (
        <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Txt as="h2" serif size={24}>
            Choisissez d’abord votre Église
          </Txt>
          <Txt size={14} lh={1.5} color={color.textMuted}>
            Vos offrandes et vos dîmes vont à votre paroisse : rattachez-vous à elle pour pouvoir contribuer.
          </Txt>
          <Btn label="Choisir mon Église" height={50} size={15} href="/app/eglise" />
        </Card>
      ) : types.isPending ? (
        <Loading />
      ) : types.isError ? (
        <ErrorState error={types.error} onRetry={() => types.refetch()} />
      ) : (
        <>
          <ChipRow>
            {types.data.map((t) => (
              <Chip key={t.key} label={t.label} weight={700} height={40} active={t.key === typeKey} onClick={() => setTypeKey(t.key)} />
            ))}
          </ChipRow>

          {type?.requiresProject ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="radiogroup" aria-label="Projet">
              {open.length === 0 ? (
                <Txt size={13} color={color.textMuted}>
                  Aucune collecte ouverte pour le moment.
                </Txt>
              ) : (
                open.map((p) => <SelectRow key={p.id} icon={Buildings} label={p.title} height={50} selected={p.id === projectId} onClick={() => setProjectId(p.id)} />)
              )}
            </div>
          ) : (
            <div style={{ height: 52, borderRadius: 14, background: color.surface, boxShadow: `inset 0 0 0 1px ${color.fieldBorder}`, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px' }}>
              <Church size={18} weight="fill" color={color.primary} aria-hidden />
              <Txt as="span" size={14} weight={600} clamp={1} style={{ flex: 1 }}>
                {destination}
              </Txt>
              <Txt as="span" size={12} color={color.textMuted}>
                Ma paroisse
              </Txt>
            </div>
          )}

          <div style={{ padding: 18, borderRadius: 22, background: color.sidebar, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label htmlFor="amount" style={{ fontSize: 12, color: color.onPrimaryMuted }}>
              Montant
            </label>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <input
                id="amount"
                value={amount ? fmtInt(amount) : ''}
                onChange={(e) => setAmount(Math.min(MAX_CONTRIBUTION, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
                inputMode="numeric"
                aria-label="Montant en francs CFA"
                placeholder="0"
                style={{ flex: 1, minWidth: 0, padding: 0, border: 0, background: 'transparent', outline: 'none', fontFamily: 'var(--font-serif), Georgia, serif', fontSize: 54, lineHeight: 1.15, color: color.onPrimary }}
              />
              <Txt as="span" size={15} weight={700} color={color.onPrimary}>
                FCFA
              </Txt>
            </div>
            <Txt size={13} weight={600} color={color.accent}>
              ≈ {fcfaToEur(amount)} €
            </Txt>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRESETS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  aria-pressed={amount === a}
                  aria-label={`${fmtInt(a)} francs CFA`}
                  style={{ flex: 1, height: 36, borderRadius: 999, background: amount === a ? color.accent : color.sidebarHover, color: amount === a ? color.deep : color.onPrimary, fontSize: 12, fontWeight: 700, textAlign: 'center' }}
                >
                  {fmtInt(a)}
                </button>
              ))}
            </div>
          </div>

          <div className="pwa-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16 }}>
            <Repeat size={22} color={color.primary} aria-hidden />
            <div style={{ flex: 1 }}>
              <Txt size={14} weight={700}>
                Chaque mois
              </Txt>
              <Txt size={12} color={color.textMuted}>
                Prélevé le 1er du mois, annulable à tout moment
              </Txt>
            </div>
            <Toggle value={recurring} onChange={setRecurring} label="Contribution mensuelle" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Txt as="span" size={13} color={color.textMuted}>
              Frais opérateur (1,5 %)
            </Txt>
            <Txt as="span" size={13} color={color.textMuted} tabular>
              {fmtInt(fee)} FCFA
            </Txt>
          </div>

          <Btn label={`Continuer · ${fmtInt(amount + fee)} FCFA`} disabled={!canGo} onClick={next} />
        </>
      )}
    </Screen>
  )
}
