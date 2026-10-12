'use client'

import { useRouter } from 'next/navigation'
import { Bell, Broadcast, Buildings, CalendarCheck, Church, Megaphone, MicrophoneStage, Receipt, type Icon } from '@phosphor-icons/react'
import { relativeShort } from '@cepca/shared'
import { useMarkRead, useNotifications } from '../../_lib/queries'
import { useNow } from '../../_lib/device'
import { notificationTarget } from '../../_lib/links'
import { PushToggle } from '../../_components/push'
import { BackHeader, Empty, ErrorState, IconTile, Loading, Screen, Txt, color } from '../../_components/ui'

const ICON: Record<string, Icon> = {
  LIVE: Broadcast,
  ANNOUNCEMENT: Megaphone,
  RECEIPT: Receipt,
  PAYMENT: Receipt,
  SERMON: MicrophoneStage,
  PROJECT: Buildings,
  EVENT: CalendarCheck,
  MEMBERSHIP: Church,
}

export default function Notifications() {
  const router = useRouter()
  const q = useNotifications()
  const mark = useMarkRead()
  const now = useNow(60_000)
  const anyUnread = q.data?.some((n) => !n.read)

  return (
    <Screen gap={0}>
      <div style={{ marginBottom: 8 }}>
        <BackHeader
          title="Notifications"
          fallback="/app"
          right={
            anyUnread ? (
              <button type="button" onClick={() => mark.mutate('all')} style={{ fontSize: 13, fontWeight: 700, color: color.primary }}>
                Tout marquer lu
              </button>
            ) : null
          }
        />
      </div>
      <PushToggle />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucune notification pour le moment.</Empty>
      ) : (
        q.data.map((n) => {
          const go = notificationTarget(n.link)
          return (
            <button
              key={n.id}
              type="button"
              className="pwa-press"
              onClick={() => {
                if (!n.read) mark.mutate(n.id)
                if (go) router.push(go)
              }}
              aria-label={`${n.read ? '' : 'Non lue. '}${n.title}. ${n.body}`}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 10px', margin: '0 -10px', borderRadius: 16, background: n.read ? 'transparent' : color.surface, textAlign: 'left' }}
            >
              <IconTile icon={ICON[n.kind] ?? Bell} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <Txt as="span" size={14} weight={n.read ? 500 : 700} lh={1.3} style={{ display: 'block' }}>
                  {n.title}
                </Txt>
                <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block', marginTop: 2 }}>
                  {n.body}
                </Txt>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <Txt as="span" size={11} color={color.textMuted}>
                  {relativeShort(n.createdAt, now)}
                </Txt>
                {n.read ? null : <span style={{ width: 9, height: 9, borderRadius: 5, background: color.accent }} />}
              </span>
            </button>
          )
        })
      )}
    </Screen>
  )
}
