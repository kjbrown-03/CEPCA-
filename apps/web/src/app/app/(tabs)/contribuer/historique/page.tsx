'use client'

import { Buildings, HandCoins, HandHeart, Heart, type Icon } from '@phosphor-icons/react'
import { dayMonthYear, fmtInt, monthTitle, type ContributionDto } from '@cepca/shared'
import { useHistory } from '../../../_lib/queries'
import { BackHeader, Btn, Empty, ErrorState, IconTile, ListRow, Loading, Screen, Txt, color } from '../../../_components/ui'

const TYPE_ICON: Record<string, Icon> = { dime: HandCoins, offrande: HandHeart, projet: Buildings, oeuvre_sociale: Heart }

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
    <Screen gap={12}>
      <BackHeader title="Mes contributions" fallback="/app/contribuer" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div style={{ padding: '16px 18px', borderRadius: 20, background: color.sidebar, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Txt size={12} color={color.onPrimaryMuted}>
                {summary?.since ? `Total depuis ${monthTitle(summary.since).toLowerCase()}` : 'Total'}
              </Txt>
              <Txt serif size={36} lh={1.05} color={color.onPrimary}>
                {fmtInt(summary?.total ?? 0)} FCFA
              </Txt>
            </div>
            <Txt size={12} weight={700} color={color.accent}>
              {summary?.count ?? 0} paiement{(summary?.count ?? 0) > 1 ? 's' : ''}
            </Txt>
          </div>
          {items.length === 0 ? (
            <Empty>Vos contributions apparaîtront ici.</Empty>
          ) : (
            <div>
              {items.map((c) => (
                <ListRow key={c.id} href={`/app/contribuer/recu/${encodeURIComponent(c.id)}`} label={`${c.type}, ${fmtInt(c.amount)} francs CFA, ${c.statusLabel}`}>
                  <IconTile icon={TYPE_ICON[c.typeKey] ?? HandCoins} iconSize={19} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <Txt as="span" size={14} weight={700} style={{ display: 'block' }}>
                      {c.type}
                    </Txt>
                    <Txt as="span" size={12} color={color.textMuted} clamp={1}>
                      {c.destination} · {dayMonthYear(c.confirmedAt ?? c.createdAt)}
                    </Txt>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <Txt as="span" size={14} weight={700} tabular>
                      {fmtInt(c.amount)}
                    </Txt>
                    <Txt as="span" size={11} weight={700} color={STATUS_FG[c.status]}>
                      {c.status === 'SUCCEEDED' ? 'Reçu' : c.statusLabel}
                    </Txt>
                  </span>
                </ListRow>
              ))}
            </div>
          )}
          {q.hasNextPage ? <Btn label="Afficher plus" variant="outline" height={44} size={14} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} /> : null}
        </>
      )}
    </Screen>
  )
}
