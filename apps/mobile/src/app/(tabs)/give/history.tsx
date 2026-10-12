import { View } from 'react-native'
import { router } from 'expo-router'
import { BuildingsIcon, HandCoinsIcon, HandHeartIcon, HeartIcon, type Icon } from 'phosphor-react-native'
import { dayMonthYear, fmtInt, monthTitle, type ContributionDto } from '@cepca/shared'
import { useHistory } from '@/lib/queries'
import { BackHeader, Btn, Empty, ErrorState, IconTile, ListRow, Loading, Screen } from '@/components/ui'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

const TYPE_ICON: Record<string, Icon> = { dime: HandCoinsIcon, offrande: HandHeartIcon, projet: BuildingsIcon, oeuvre_sociale: HeartIcon }

const STATUS_FG: Record<ContributionDto['status'], string> = {
  SUCCEEDED: color.primary,
  PENDING: color.warnFg,
  FAILED: color.errorFg,
  CANCELLED: color.errorFg,
  REFUNDED: color.infoFg,
}

export default function History() {
  const q = useHistory()
  const summary = q.data?.pages[0]?.summary
  const items = q.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <Screen gap={12} refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()}>
      <BackHeader title="Mes contributions" fallback="/give" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <View style={{ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 20, backgroundColor: color.sidebar, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt size={12} color={color.onPrimaryMuted}>
                {summary?.since ? `Total depuis ${monthTitle(summary.since).toLowerCase()}` : 'Total'}
              </Txt>
              <Txt serif size={36} lh={1.05} color={color.onPrimary}>
                {fmtInt(summary?.total ?? 0)} FCFA
              </Txt>
            </View>
            <Txt size={12} weight={700} color={color.accent}>
              {summary?.count ?? 0} paiement{(summary?.count ?? 0) > 1 ? 's' : ''}
            </Txt>
          </View>
          {items.length === 0 ? (
            <Empty>Vos contributions apparaîtront ici.</Empty>
          ) : (
            <View>
              {items.map((c) => (
                <ListRow key={c.id} onPress={() => router.push(`/give/receipt/${c.id}`)} label={`${c.type}, ${fmtInt(c.amount)} francs CFA, ${c.statusLabel}`}>
                  <IconTile icon={TYPE_ICON[c.typeKey] ?? HandCoinsIcon} iconSize={19} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt size={14} weight={700}>
                      {c.type}
                    </Txt>
                    <Txt size={12} color={color.textMuted} numberOfLines={1}>
                      {c.destination} · {dayMonthYear(c.confirmedAt ?? c.createdAt)}
                    </Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt size={14} weight={700} tabular>
                      {fmtInt(c.amount)}
                    </Txt>
                    <Txt size={11} weight={700} color={STATUS_FG[c.status]}>
                      {c.status === 'SUCCEEDED' ? 'Reçu' : c.statusLabel}
                    </Txt>
                  </View>
                </ListRow>
              ))}
            </View>
          )}
          {q.hasNextPage ? <Btn label="Afficher plus" variant="outline" height={44} size={14} loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} /> : null}
        </>
      )}
    </Screen>
  )
}
