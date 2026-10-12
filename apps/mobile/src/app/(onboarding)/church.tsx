import { useEffect, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AirplaneTiltIcon, ChurchIcon, MagnifyingGlassIcon, MapPinIcon } from 'phosphor-react-native'
import type { ConfessionDto, MembershipOptionDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { qk, useMe } from '@/lib/queries'
import { OnboardingHeader } from '@/components/OnboardingHeader'
import { Btn, Chip, ChipRow, ErrorState, Loading, SelectRow, fieldStyle, goBack } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, family } from '@/theme'

type Residence = 'CAMEROON' | 'DIASPORA'

/** Étape 3 : confession, paroisse, résidence. Le pasteur valide ensuite le rattachement. */
export default function ChurchStep() {
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const me = useMe()
  const [confId, setConfId] = useState<string | null>(null)
  const [parish, setParish] = useState<MembershipOptionDto | null>(null)
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('') // recherche envoyée 300 ms après la dernière frappe
  const [residence, setResidence] = useState<Residence>('CAMEROON')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confessions = useQuery({ queryKey: ['confessions'], queryFn: () => api<ConfessionDto[]>('/directory/confessions', { auth: false }) })
  const options = useQuery({
    queryKey: ['membership-options', confId, dq],
    queryFn: () => api<MembershipOptionDto[]>(`/directory/confessions/${confId}/membership-options${dq ? `?q=${encodeURIComponent(dq)}` : ''}`, { auth: false }),
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
      await api('/me/membership', { method: 'POST', body: { structureId: parish.id, residence, consent: true } })
      await qc.invalidateQueries()
      router.replace({ pathname: '/done', params: { parish: parish.name } })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <OnboardingHeader step={3} onBack={() => goBack('/home')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 28, gap: 18 }} keyboardShouldPersistTaps="handled">
        <View>
          <Txt serif size={34} lh={1.05} accessibilityRole="header">
            Mon Église
          </Txt>
          <Txt size={14} lh={1.5} color={color.textMuted} style={{ marginTop: 8 }}>
            Choisissez votre confession puis votre paroisse. Le pasteur validera votre rattachement.
          </Txt>
        </View>

        {confessions.isPending ? (
          <Loading minHeight={160} />
        ) : confessions.isError ? (
          <ErrorState error={confessions.error} onRetry={() => confessions.refetch()} />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Txt size={13} weight={700}>
                Confession
              </Txt>
              <ChipRow>
                {confessions.data.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.code}
                    weight={700}
                    height={38}
                    active={c.id === confId}
                    onPress={() => {
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
            </View>

            <View style={{ gap: 6 }}>
              <Txt size={13} weight={700}>
                Paroisse
              </Txt>
              <View style={[fieldStyle, { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14 }]}>
                <MagnifyingGlassIcon size={18} color={color.textMuted} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Rechercher une paroisse ou une chapelle"
                  placeholderTextColor={color.textFaint}
                  accessibilityLabel="Rechercher une paroisse"
                  style={{ flex: 1, fontSize: 14, fontFamily: family[500], color: color.text }}
                />
              </View>
              {options.isPending ? (
                <Loading minHeight={120} />
              ) : options.isError ? (
                <ErrorState error={options.error} onRetry={() => options.refetch()} />
              ) : options.data.length === 0 ? (
                <Txt size={13} color={color.textMuted} style={{ paddingVertical: 12 }}>
                  Aucune paroisse trouvée.
                </Txt>
              ) : (
                options.data.map((o) => (
                  <SelectRow
                    key={o.id}
                    icon={ChurchIcon}
                    label={o.name}
                    sub={o.level !== 'Paroisse' && o.parentName ? `${o.level} · ${o.parentName}` : undefined}
                    selected={parish?.id === o.id}
                    onPress={() => setParish(o)}
                  />
                ))
              )}
            </View>
          </>
        )}

        <View style={{ gap: 8 }}>
          <Txt size={13} weight={700}>
            Je vis
          </Txt>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Au Cameroun" icon={MapPinIcon} weight={700} height={44} style={{ flex: 1 }} active={residence === 'CAMEROON'} onPress={() => setResidence('CAMEROON')} />
            <Chip label="Dans la diaspora" icon={AirplaneTiltIcon} weight={700} height={44} style={{ flex: 1 }} active={residence === 'DIASPORA'} onPress={() => setResidence('DIASPORA')} />
          </View>
        </View>

        <Txt size={12} lh={1.5} color={color.textMuted}>
          En terminant, vous acceptez que votre profil soit transmis à cette paroisse pour la gestion de votre rattachement.
        </Txt>
        {error ? (
          <Txt size={13} weight={600} color={color.errorFg} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        <Btn label="Terminer" onPress={finish} disabled={!parish} loading={busy} style={{ marginTop: 6 }} />
      </ScrollView>
    </View>
  )
}
