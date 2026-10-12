'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AirplaneTilt, Church, MagnifyingGlass, MapPin } from '@phosphor-icons/react'
import type { ConfessionDto, MembershipOptionDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { useMe } from '../../_lib/queries'
import { Btn, Chip, ChipRow, ErrorState, FormError, Loading, OnboardingHeader, SelectRow, Txt, color } from '../../_components/ui'

type Residence = 'CAMEROON' | 'DIASPORA'

/** Étape 3 : confession, paroisse, résidence. Le pasteur valide ensuite le rattachement. */
export default function ChurchStep() {
  const router = useRouter()
  const qc = useQueryClient()
  const me = useMe()
  const [confId, setConfId] = useState<string | null>(null)
  const [parish, setParish] = useState<MembershipOptionDto | null>(null)
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('') // recherche envoyée 300 ms après la dernière frappe
  const [residence, setResidence] = useState<Residence>('CAMEROON')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confessions = useQuery({ queryKey: ['app', 'confessions'], queryFn: () => api.get<ConfessionDto[]>('/directory/confessions') })
  const options = useQuery({
    queryKey: ['app', 'membership-options', confId, dq],
    queryFn: () => api.get<MembershipOptionDto[]>(`/directory/confessions/${encodeURIComponent(confId!)}/membership-options`, { q: dq }),
    enabled: !!confId,
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (!confId && confessions.data?.length) setConfId(confessions.data[0].id)
  }, [confId, confessions.data])
  useEffect(() => {
    if (me.data) setResidence(me.data.residence)
  }, [me.data])

  const conf = confessions.data?.find((c) => c.id === confId)

  async function finish() {
    if (!parish) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/me/membership', { structureId: parish.id, residence, consent: true })
      await qc.invalidateQueries()
      router.replace(`/app/pret?paroisse=${encodeURIComponent(parish.name)}`)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <main className="pwa-flow" style={{ gap: 18 }}>
      <OnboardingHeader step={3} fallback="/app" />
      <div style={{ paddingTop: 6 }}>
        <Txt as="h1" serif size={34} lh={1.05}>
          Mon Église
        </Txt>
        <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
          Choisissez votre confession puis votre paroisse. Le pasteur validera votre rattachement.
        </Txt>
      </div>

      {confessions.isPending ? (
        <Loading minHeight={160} />
      ) : confessions.isError ? (
        <ErrorState error={confessions.error} onRetry={() => confessions.refetch()} />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="pwa-label">Confession</span>
            <ChipRow>
              {confessions.data.map((c) => (
                <Chip
                  key={c.id}
                  label={c.code}
                  weight={700}
                  height={38}
                  active={c.id === confId}
                  onClick={() => {
                    setConfId(c.id)
                    setParish(null)
                    setQ('')
                  }}
                />
              ))}
            </ChipRow>
            {conf ? (
              <Txt size={12} color={color.textMuted}>
                {conf.name}
              </Txt>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="radiogroup" aria-label="Paroisse">
            <span className="pwa-label">Paroisse</span>
            <label className="pwa-phone" style={{ height: 46, alignItems: 'center', paddingLeft: 14 }}>
              <MagnifyingGlass size={18} color={color.textMuted} aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une paroisse ou une chapelle" aria-label="Rechercher une paroisse" style={{ fontSize: 15 }} />
            </label>
            {options.isPending ? (
              <Loading minHeight={120} />
            ) : options.isError ? (
              <ErrorState error={options.error} onRetry={() => options.refetch()} />
            ) : options.data.length === 0 ? (
              <Txt size={13} color={color.textMuted} style={{ padding: '12px 0' }}>
                Aucune paroisse trouvée.
              </Txt>
            ) : (
              options.data.map((o) => (
                <SelectRow
                  key={o.id}
                  icon={Church}
                  label={o.name}
                  sub={o.level !== 'Paroisse' && o.parentName ? `${o.level} · ${o.parentName}` : undefined}
                  selected={parish?.id === o.id}
                  onClick={() => setParish(o)}
                />
              ))
            )}
          </div>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="pwa-label">Je vis</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <Chip label="Au Cameroun" icon={MapPin} weight={700} height={44} style={{ flex: 1 }} active={residence === 'CAMEROON'} onClick={() => setResidence('CAMEROON')} />
          <Chip label="Dans la diaspora" icon={AirplaneTilt} weight={700} height={44} style={{ flex: 1 }} active={residence === 'DIASPORA'} onClick={() => setResidence('DIASPORA')} />
        </div>
      </div>

      <Txt size={12} lh={1.5} color={color.textMuted}>
        En terminant, vous acceptez que votre profil soit transmis à cette paroisse pour la gestion de votre rattachement.
      </Txt>
      <FormError text={error} />
      <Btn label="Terminer" onClick={finish} disabled={!parish} loading={busy} style={{ marginTop: 6 }} />
    </main>
  )
}
