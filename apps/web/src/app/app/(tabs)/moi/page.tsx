'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarCheck, CaretRight, FolderSimple, GlobeHemisphereWest, Receipt, SignOut, Translate, type Icon } from '@phosphor-icons/react'
import { initials, prettyPhone, type MeDto } from '@cepca/shared'
import { api, errorMessage } from '@/lib/api'
import { qk, useMe, useRegistrations } from '../../_lib/queries'
import { useToast } from '../../_components/toast'
import { forgetPush } from '../../_components/push'
import { Btn, Card, ErrorState, Loading, Screen, Txt, color } from '../../_components/ui'

const TZ_LABEL: Record<string, string> = { 'Africa/Douala': 'Douala', 'Europe/Paris': 'Paris', 'America/Toronto': 'Toronto', 'America/New_York': 'New York' }
const TZ_CYCLE = ['Africa/Douala', 'Europe/Paris', 'America/Toronto', 'America/New_York']

const MEMBERSHIP_BADGE: Partial<Record<NonNullable<MeDto['membership']>['status'], { label: string; bg: string; fg: string }>> = {
  ACTIVE: { label: 'Rattachement validé', bg: color.primarySoft, fg: color.primary },
  PENDING: { label: 'En attente de validation', bg: color.warnBg, fg: color.warnFg },
  TO_VERIFY: { label: 'À vérifier', bg: color.warnBg, fg: color.warnFg },
  REJECTED: { label: 'Rattachement refusé', bg: color.errorBg, fg: color.errorFg },
}

export default function Me() {
  const router = useRouter()
  const me = useMe()
  const regs = useRegistrations()
  const qc = useQueryClient()
  const toast = useToast()

  const tz = useMutation({
    mutationFn: (timezone: string) => api.patch<MeDto>('/me', { timezone }),
    onSuccess: (d) => qc.setQueryData(qk.me, d),
    onError: (e) => toast(errorMessage(e), 'error'),
  })
  const logout = useMutation({
    mutationFn: async () => {
      await forgetPush()
      await api.post('/auth/logout')
    },
    onSettled: () => {
      qc.clear()
      router.replace('/app/bienvenue')
    },
  })

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
  const u = me.data
  const m = u.membership
  const badge = m ? MEMBERSHIP_BADGE[m.status] : undefined

  const menu: Array<{ icon: Icon; label: string; value?: string; href?: string; onClick?: () => void }> = [
    { icon: Receipt, label: 'Mes contributions', href: '/app/contribuer/historique' },
    { icon: CalendarCheck, label: 'Mes inscriptions', value: regs.data ? String(regs.data.length) : '', href: '/app/agenda' },
    { icon: Bell, label: 'Notifications', value: u.unreadNotifications ? `${u.unreadNotifications} non lue(s)` : '', href: '/app/notifications' },
    { icon: FolderSimple, label: 'Mes documents', href: '/app/documents' },
    { icon: Translate, label: 'Langue', value: 'Français', onClick: () => toast('L’anglais arrive dans une prochaine version.') },
    { icon: GlobeHemisphereWest, label: 'Fuseau horaire', value: TZ_LABEL[u.timezone] ?? u.timezone, onClick: () => tz.mutate(TZ_CYCLE[(TZ_CYCLE.indexOf(u.timezone) + 1) % TZ_CYCLE.length]) },
  ]

  return (
    <Screen gap={16}>
      <Txt as="h1" serif size={34} lh={1.05}>
        Moi
      </Txt>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ flex: 'none', width: 62, height: 62, borderRadius: 31, background: color.primary, color: color.onPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700 }} aria-hidden>
          {initials(u.fullName)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={17} weight={700}>
            {u.fullName}
          </Txt>
          {u.email ? (
            <Txt size={13} color={color.textMuted} style={{ overflowWrap: 'anywhere' }}>
              {u.email}
            </Txt>
          ) : null}
          <Txt size={13} color={color.textMuted} style={{ whiteSpace: 'nowrap' }}>
            {prettyPhone(u.phone)} · {u.residence === 'CAMEROON' ? 'Au Cameroun' : 'Diaspora'}
          </Txt>
        </div>
      </div>

      <Card style={{ padding: 16, borderRadius: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
          <Txt as="h2" serif size={22}>
            Mon Église
          </Txt>
          {badge ? <span style={{ padding: '4px 10px', borderRadius: 999, background: badge.bg, color: badge.fg, fontSize: 11, fontWeight: 700 }}>{badge.label}</span> : null}
        </div>
        {m && m.status !== 'REJECTED' ? (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {m.hierarchy.map((h, i) => {
              const last = i === m.hierarchy.length - 1
              return (
                <li key={h.id} style={{ display: 'flex', gap: 12 }}>
                  <span style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }} aria-hidden>
                    <span style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, boxShadow: `inset 0 0 0 2px ${color.primary}`, background: last ? color.primary : color.surface }} />
                    <span style={{ flex: 1, width: 2, background: last ? 'transparent' : color.primarySoft2 }} />
                  </span>
                  <span style={{ flex: 1, paddingBottom: 10 }}>
                    <Txt as="span" size={10} weight={700} upper ls={0.08} color={color.textMuted} style={{ display: 'block' }}>
                      {h.level}
                    </Txt>
                    <Txt as="span" size={last ? 16 : 14} weight={last ? 700 : 500} lh={1.3} style={{ display: 'block' }}>
                      {h.name}
                    </Txt>
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Txt size={14} lh={1.5} color={color.textMuted}>
              {m ? 'Votre demande n’a pas été acceptée. Choisissez à nouveau votre paroisse ou contactez-la.' : 'Rattachez-vous à votre paroisse pour recevoir ses annonces et contribuer.'}
            </Txt>
            <Btn label="Choisir mon Église" height={46} size={14} href="/app/eglise" />
          </div>
        )}
      </Card>

      <nav aria-label="Mon compte">
        {menu.map((it) => {
          const inner = (
            <>
              <it.icon size={21} color={color.primary} aria-hidden />
              <Txt as="span" size={14} weight={600} style={{ flex: 1 }}>
                {it.label}
              </Txt>
              {it.value ? (
                <Txt as="span" size={13} weight={500} color={color.textMuted}>
                  {it.value}
                </Txt>
              ) : null}
              <CaretRight size={14} color={color.textMuted} aria-hidden />
            </>
          )
          const style = { height: 54, gap: 14 }
          return it.href ? (
            <Link key={it.label} href={it.href} className="pwa-row" style={style}>
              {inner}
            </Link>
          ) : (
            <button key={it.label} type="button" className="pwa-row" style={style} onClick={it.onClick}>
              {inner}
            </button>
          )
        })}
      </nav>

      <Btn label="Se déconnecter" icon={SignOut} iconWeight="regular" variant="danger" height={50} size={14} loading={logout.isPending} onClick={() => logout.mutate()} />
    </Screen>
  )
}
