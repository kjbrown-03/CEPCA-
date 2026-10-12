'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CaretRight, Cross, LockKey, MagnifyingGlass, SignOut } from '@phosphor-icons/react'
import { initials, type QueueItemDto } from '@cepca/shared'
import { api, ApiError } from '@/lib/api'
import { SessionProvider, useMe, useSession } from '@/lib/session'
import type { DashboardDto } from '@/lib/types'
import { displayName } from '@/lib/format'
import { ErrorBox, Skeleton } from '@/components/ui'
import { NAV, navKeyFor, roleIcon } from '../nav'

/** Pastilles du menu : ce qui attend dans la file « À valider », rangé par module. */
const BADGE_OF: Record<QueueItemDto['kind'], string> = {
  MEMBERSHIP: 'users',
  PUBLICATION: 'news',
  SERMON: 'sermons',
  PROJECT: 'proj',
  PAYMENT: 'pay',
  REFUND: 'pay',
  CLOSING: 'pay',
}

export function useDashboard() {
  const { seat } = useSession()
  return useQuery({
    queryKey: ['dashboard', seat.assignmentId],
    queryFn: () => api.get<DashboardDto>('/admin/dashboard', { assignmentId: seat.assignmentId }),
    staleTime: 60_000,
  })
}

export function AdminShell({ children }: { children: ReactNode }) {
  const me = useMe()
  if (me.isPending) return <ShellSkeleton />
  if (me.isError) {
    const notStaff = me.error instanceof ApiError && me.error.code === 'NOT_STAFF'
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 440 }}>
          <span className="tile">
            <LockKey size={20} />
          </span>
          <h1 className="h2">{notStaff ? 'Espace réservé aux responsables' : 'Back-office indisponible'}</h1>
          {notStaff ? <p className="muted" style={{ margin: 0 }}>Votre compte n’a pas de mandat en cours. Les fidèles utilisent l’application mobile.</p> : <ErrorBox error={me.error} onRetry={() => me.refetch()} />}
          <LogoutButton className="btn-ghost" />
        </div>
      </div>
    )
  }
  return (
    <SessionProvider me={me.data}>
      <Frame>{children}</Frame>
    </SessionProvider>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const { me, seat, setSeat } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const dash = useDashboard()
  const [q, setQ] = useState('')
  const current = navKeyFor(pathname)
  const allowed = seat.nav.includes(current)
  const RoleIcon = roleIcon(seat.roleKey)

  const badges: Record<string, number> = {}
  for (const item of dash.data?.queue ?? []) {
    const k = BADGE_OF[item.kind]
    badges[k] = (badges[k] ?? 0) + 1
  }
  const crumbs = dash.data?.crumbs ?? [seat.structure.name]

  const search = (e: FormEvent) => {
    e.preventDefault()
    if (q.trim()) router.push(`/admin/utilisateurs?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <div className="bo">
      <aside className="bo-side">
        <Link href="/admin" className="bo-brand">
          <span className="bo-mark">
            <Cross size={17} weight="bold" />
          </span>
          <div>
            <div className="name">CEPCA</div>
            <div className="sub">Back-office</div>
          </div>
        </Link>
        <div className="bo-seat">
          <span className="ico">
            <RoleIcon size={20} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="k">Mon rôle</div>
            <div className="r">{seat.roleLabel}</div>
            <div className="s">{seat.structure.name}</div>
            {me.seats.length > 1 ? (
              <select
                aria-label="Changer de mandat"
                value={seat.assignmentId}
                onChange={(e) => {
                  setSeat(e.target.value)
                  router.push('/admin')
                }}
              >
                {me.seats.map((s) => (
                  <option key={s.assignmentId} value={s.assignmentId}>
                    {s.roleLabel} · {s.structure.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        <nav className="bo-nav" aria-label="Menu du back-office">
          {seat.nav
            .filter((k) => NAV[k])
            .map((k) => {
              const n = NAV[k]
              const Icon = n.icon
              return (
                <Link key={k} href={n.href} aria-current={current === k ? 'page' : undefined}>
                  <Icon size={19} />
                  <span className="l">{n.label}</span>
                  {badges[k] ? <span className="bo-badge">{badges[k]}</span> : null}
                </Link>
              )
            })}
        </nav>
        <div className="bo-user">
          <span className="av">{initials(me.fullName)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="n">{displayName(me.fullName, seat.title)}</div>
            <div className="l">{seat.structure.level}</div>
          </div>
          <LogoutButton icon />
        </div>
      </aside>

      <main className="bo-main">
        <header className="bo-header">
          <nav className="bo-crumbs" aria-label="Périmètre">
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`}>
                {i > 0 ? <CaretRight size={11} /> : null}
                {c}
              </span>
            ))}
          </nav>
          {seat.nav.includes('users') ? (
            <form className="search" role="search" onSubmit={search}>
              <MagnifyingGlass size={16} />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans mon périmètre" aria-label="Rechercher une personne dans mon périmètre" />
            </form>
          ) : null}
          <Link href="/admin#a-valider" className="bo-bell" aria-label={dash.data?.queue.length ? `${dash.data.queue.length} élément(s) à valider` : 'Rien à valider'}>
            <Bell size={18} />
            {dash.data?.queue.length ? <span className="dot" /> : null}
          </Link>
        </header>
        <div className="bo-content">
          {allowed ? (
            children
          ) : (
            <div className="card" style={{ maxWidth: 520 }}>
              <h1 className="h2">Cette page ne fait pas partie de votre rôle</h1>
              <p className="muted" style={{ margin: 0 }}>
                Votre mandat de {seat.roleLabel.toLowerCase()} ({seat.structure.name}) ne donne pas accès à ce module.
              </p>
              <Link href="/admin" className="btn" style={{ alignSelf: 'flex-start' }}>
                Revenir au tableau de bord
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function LogoutButton({ icon, className }: { icon?: boolean; className?: string }) {
  const qc = useQueryClient()
  const out = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // la session est fermée côté navigateur quoi qu'il arrive
    }
    qc.clear()
    window.location.assign('/admin/connexion')
  }
  if (icon)
    return (
      <button type="button" onClick={out} aria-label="Se déconnecter" title="Se déconnecter">
        <SignOut size={18} />
      </button>
    )
  return (
    <button type="button" onClick={out} className={className}>
      <SignOut size={18} />
      Se déconnecter
    </button>
  )
}

function ShellSkeleton() {
  return (
    <div className="bo" aria-busy="true" aria-label="Chargement du back-office">
      <aside className="bo-side" />
      <main className="bo-main">
        <header className="bo-header" />
        <div className="bo-content">
          <Skeleton h={60} w="50%" />
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={120} />
            ))}
          </div>
          <Skeleton h={260} />
        </div>
      </main>
    </div>
  )
}
