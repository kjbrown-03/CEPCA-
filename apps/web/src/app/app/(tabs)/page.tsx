'use client'

import Link from 'next/link'
import { Bell, Buildings, FolderSimple, HandHeart, MicrophoneStage, Play, type Icon } from '@phosphor-icons/react'
import { agendaParts, countdown, dayMonth, doualaParis, fmtMillions, fmtPct, initials, pct, type HomeDto } from '@cepca/shared'
import { useHome, useMe } from '../_lib/queries'
import { useNow } from '../_lib/device'
import { InstallBanner } from '../_components/install'
import { StaffEntry } from '../_components/staff-entry'
import { ErrorState, ListRow, Loading, Overline, Photo, Progress, Screen, Txt, color } from '../_components/ui'

export default function Home() {
  const me = useMe()
  const home = useHome()
  const name = me.data?.fullName ?? ''
  const unread = home.data?.unreadNotifications ?? me.data?.unreadNotifications ?? 0

  return (
    <Screen gap={18}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 22, background: color.primary, color: color.onPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }} aria-hidden>
          {name ? initials(name) : ''}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Txt size={12} color={color.textMuted}>
            Bonjour {name.split(' ')[0]}
          </Txt>
          <Txt as="h1" serif size={24} clamp={1}>
            {me.data?.membership?.structure.name ?? 'CEPCA'}
          </Txt>
        </div>
        <Link
          href="/app/notifications"
          className="pwa-round"
          aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
          style={{ width: 44, height: 44, position: 'relative' }}
        >
          <Bell size={20} aria-hidden />
          {unread > 0 ? (
            <span style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px', background: color.accent, color: color.text, fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Link>
      </header>

      {me.data?.roles.length ? <StaffEntry roles={me.data.roles} /> : null}

      <InstallBanner />

      {home.isPending ? (
        <Loading />
      ) : home.isError ? (
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      ) : (
        <>
          {home.data.nextService ? <NextService e={home.data.nextService} /> : null}
          <QuickAccess />
          <Announcements items={home.data.announcements} />
          {home.data.featuredProject ? <FeaturedProject p={home.data.featuredProject} /> : null}
        </>
      )}
    </Screen>
  )
}

function NextService({ e }: { e: NonNullable<HomeDto['nextService']> }) {
  const now = useNow()
  const cd = countdown(e.countdownTo, now)
  const badge = e.isLive ? (cd ? `Direct ${cd}` : 'En direct') : cd
  const d = agendaParts(e.startsAt)
  return (
    <Link href={`/app/agenda/${encodeURIComponent(e.id)}`} className="pwa-press" aria-label={`Prochain culte : ${e.title}`} style={{ position: 'relative', height: 224, borderRadius: 26, overflow: 'hidden' }}>
      <Photo uri={e.imageUrl} style={{ position: 'absolute', inset: 0 }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(16,42,28,.92), transparent 62%)' }} />
      {badge ? (
        <span style={{ position: 'absolute', left: 14, top: 14, padding: '5px 10px', borderRadius: 999, background: color.accent, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: color.deep }} />
          {badge}
        </span>
      ) : null}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 14, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Overline color={color.accentLight} ls={0.1}>
            Prochain culte
          </Overline>
          <Txt serif size={26} lh={1.05} color={color.onPrimary}>
            {e.title}
          </Txt>
          <Txt size={12} color={color.onPrimary} style={{ marginTop: 3 }}>
            {d.wd} {d.d} {d.monthShort} · {doualaParis(e.startsAt)}
          </Txt>
        </div>
        <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 22, background: color.onPrimary, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
          <Play size={18} weight="fill" />
        </span>
      </div>
    </Link>
  )
}

const QUICK: Array<{ icon: Icon; label: string; href: string; main?: boolean }> = [
  { icon: HandHeart, label: 'Contribuer', href: '/app/contribuer', main: true },
  { icon: MicrophoneStage, label: 'Prédications', href: '/app/predications' },
  { icon: Buildings, label: 'Projets', href: '/app/projets' },
  { icon: FolderSimple, label: 'Documents', href: '/app/documents' },
]

function QuickAccess() {
  return (
    <nav aria-label="Accès rapides" style={{ display: 'flex', gap: 6 }}>
      {QUICK.map((q) => (
        <Link key={q.label} href={q.href} className="pwa-press" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: q.main ? color.primary : color.primarySoft, color: q.main ? color.onPrimary : color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <q.icon size={22} aria-hidden />
          </span>
          <Txt as="span" size={11} weight={700} align="center">
            {q.label}
          </Txt>
        </Link>
      ))}
    </nav>
  )
}

function Announcements({ items }: { items: HomeDto['announcements'] }) {
  if (!items.length) return null
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt as="h2" serif size={24}>
          Annonces
        </Txt>
        <Link href="/app/actualites" style={{ fontSize: 13, fontWeight: 700 }}>
          Tout voir
        </Link>
      </div>
      {items.map((n) => (
        <ListRow key={n.id} py={10} href={`/app/actualites/${encodeURIComponent(n.id)}`}>
          <Photo uri={n.imageUrl} radius={16} style={{ flex: 'none', width: 68, height: 68 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Txt size={11} weight={700} color={color.primary}>
              {n.source} · {dayMonth(n.publishedAt)}
            </Txt>
            <Txt size={14} weight={600} lh={1.3}>
              {n.title}
            </Txt>
          </div>
        </ListRow>
      ))}
    </section>
  )
}

function FeaturedProject({ p }: { p: NonNullable<HomeDto['featuredProject']> }) {
  const v = pct(p.raisedAmount, p.goalAmount)
  return (
    <Link href={`/app/projets/${encodeURIComponent(p.id)}`} className="pwa-press pwa-card" style={{ padding: 12, borderRadius: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
      <Photo uri={p.imageUrl} radius={16} style={{ flex: 'none', width: 76, height: 76 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Overline color={color.textMuted} ls={0.08}>
          Projet à soutenir
        </Overline>
        <Txt size={14} weight={700}>
          {p.title}
        </Txt>
        <Progress value={v} />
        <Txt size={11} color={color.textMuted}>
          {fmtPct(v)} · {fmtMillions(p.raisedAmount)}
          {p.goalAmount ? ` / ${fmtMillions(p.goalAmount)}` : ''} FCFA
        </Txt>
      </div>
    </Link>
  )
}
