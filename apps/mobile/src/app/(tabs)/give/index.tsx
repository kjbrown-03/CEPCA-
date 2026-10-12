import { useEffect, useState } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { BuildingsIcon, ChurchIcon, ClockCounterClockwiseIcon, RepeatIcon } from 'phosphor-react-native'
import { MAX_CONTRIBUTION, MIN_CONTRIBUTION, fcfaToEur, fmtInt, operatorFee } from '@cepca/shared'
import { useContributionTypes, useMe, useProjects } from '@/lib/queries'
import { Btn, Card, Chip, ChipRow, ErrorState, Loading, Screen, SelectRow, Toggle } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color, extra, family } from '@/theme'

const PRESETS = [5000, 10000, 25000, 50000]

export default function Give() {
  const params = useLocalSearchParams<{ project?: string }>()
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

  // Premier type par défaut (la maquette préselectionne la dîme si elle existe)
  useEffect(() => {
    if (!typeKey && types.data?.length) setTypeKey((types.data.find((t) => t.key === 'dime') ?? types.data[0]).key)
  }, [typeKey, types.data])

  // « Soutenir ce projet » : préremplit le type Projet et le projet
  useEffect(() => {
    if (!params.project || !types.data) return
    const t = types.data.find((x) => x.requiresProject)
    if (t) setTypeKey(t.key)
    setProjectId(params.project)
    router.setParams({ project: undefined })
  }, [params.project, types.data])

  useEffect(() => {
    if (type?.requiresProject && !projectId && open.length) setProjectId(open[0].id)
  }, [type, projectId, open])

  if (me.isPending) return <Screen><Loading /></Screen>
  if (me.isError) return <Screen><ErrorState error={me.error} onRetry={() => me.refetch()} /></Screen>

  const fee = operatorFee(amount)
  const project = type?.requiresProject ? open.find((p) => p.id === projectId) ?? null : null
  const canGo = !!type && amount >= MIN_CONTRIBUTION && (!type.requiresProject || !!project)
  const destination = project?.title ?? me.data.membership?.structure.name ?? ''

  return (
    <Screen gap={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt serif size={34} lh={1.05} accessibilityRole="header">
          Je contribue
        </Txt>
        <Btn label="Historique" icon={ClockCounterClockwiseIcon} iconWeight="regular" variant="outline" height={38} size={13} style={{ paddingHorizontal: 14, gap: 6 }} onPress={() => router.push('/give/history')} />
      </View>

      {!member ? (
        <Card style={{ padding: 18, gap: 12 }}>
          <Txt serif size={24}>
            Choisissez d’abord votre Église
          </Txt>
          <Txt size={14} lh={1.5} color={color.textMuted}>
            Vos offrandes et vos dîmes vont à votre paroisse : rattachez-vous à elle pour pouvoir contribuer.
          </Txt>
          <Btn label="Choisir mon Église" height={50} size={15} onPress={() => router.push('/church')} />
        </Card>
      ) : types.isPending ? (
        <Loading />
      ) : types.isError ? (
        <ErrorState error={types.error} onRetry={() => types.refetch()} />
      ) : (
        <>
          <ChipRow>
            {types.data.map((t) => (
              <Chip key={t.key} label={t.label} weight={700} height={40} active={t.key === typeKey} onPress={() => setTypeKey(t.key)} />
            ))}
          </ChipRow>

          {type?.requiresProject ? (
            <View style={{ gap: 6 }}>
              {open.length === 0 ? (
                <Txt size={13} color={color.textMuted}>
                  Aucune collecte ouverte pour le moment.
                </Txt>
              ) : (
                open.map((p) => <SelectRow key={p.id} icon={BuildingsIcon} label={p.title} height={50} selected={p.id === projectId} onPress={() => setProjectId(p.id)} />)
              )}
            </View>
          ) : (
            <View style={{ height: 52, borderRadius: 14, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.fieldBorder, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
              <ChurchIcon size={18} weight="fill" color={color.primary} />
              <Txt size={14} weight={600} style={{ flex: 1 }} numberOfLines={1}>
                {destination}
              </Txt>
              <Txt size={12} color={color.textMuted}>
                Ma paroisse
              </Txt>
            </View>
          )}

          <View style={{ padding: 18, borderRadius: 22, backgroundColor: color.sidebar, gap: 12 }}>
            <Txt size={12} color={color.onPrimaryMuted} nativeID="amount-label">
              Montant
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <TextInput
                value={amount ? fmtInt(amount) : ''}
                onChangeText={(v) => setAmount(Math.min(MAX_CONTRIBUTION, parseInt(v.replace(/\D/g, '') || '0', 10)))}
                keyboardType="number-pad"
                accessibilityLabelledBy="amount-label"
                accessibilityLabel="Montant en francs CFA"
                placeholder="0"
                placeholderTextColor={color.onPrimaryMuted}
                style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: family.serif, fontSize: 54, lineHeight: 62, color: color.onPrimary }}
              />
              <Txt size={15} weight={700} color={color.onPrimary}>
                FCFA
              </Txt>
            </View>
            <Txt size={13} weight={600} color={color.accent}>
              ≈ {fcfaToEur(amount)} €
            </Txt>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PRESETS.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setAmount(a)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: amount === a }}
                  accessibilityLabel={`${fmtInt(a)} francs CFA`}
                  style={{ flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: amount === a ? color.accent : color.sidebarHover }}
                >
                  <Txt size={12} weight={700} color={amount === a ? color.deep : color.onPrimary}>
                    {fmtInt(a)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.divider }}>
            <RepeatIcon size={22} color={color.primary} />
            <View style={{ flex: 1 }}>
              <Txt size={14} weight={700}>
                Chaque mois
              </Txt>
              <Txt size={12} color={color.textMuted}>
                Prélevé le 1er du mois, annulable à tout moment
              </Txt>
            </View>
            <Toggle value={recurring} onChange={setRecurring} label="Contribution mensuelle" />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt size={13} color={color.textMuted}>
              Frais opérateur (1,5 %)
            </Txt>
            <Txt size={13} color={color.textMuted} tabular>
              {fmtInt(fee)} FCFA
            </Txt>
          </View>

          <Btn
            label={`Continuer · ${fmtInt(amount + fee)} FCFA`}
            disabled={!canGo}
            onPress={() =>
              router.push({
                pathname: '/give/pay',
                params: { typeKey: type!.key, typeLabel: type!.label, projectId: project?.id ?? '', destination, amount: String(amount), recurring: recurring ? '1' : '0' },
              })
            }
          />
        </>
      )}
    </Screen>
  )
}
