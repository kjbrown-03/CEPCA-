'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Check, Pause, Play, ShieldCheck, UserCircle, UserPlus, X } from '@phosphor-icons/react'
import { fmtInt, initials, prettyPhone } from '@cepca/shared'
import { api } from '@/lib/api'
import { useAct, useDebounced } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import type { AdminUserDto, RoleMatrixDto } from '@/lib/types'
import { dayShort } from '@/lib/format'
import { Chips, ErrorBox, Field, Loading, PageHead, Pill, SearchInput } from '@/components/ui'
import { PhoneField, emptyPhone, toE164, type PhoneValue } from '@/components/phone'
import { StructureSelect } from '@/components/structure-select'

type Filter = 'ALL' | 'LEADERS' | 'MEMBERS' | 'PENDING' | 'SUSPENDED'
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'Tous' },
  { value: 'LEADERS', label: 'Responsables' },
  { value: 'MEMBERS', label: 'Fidèles' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'SUSPENDED', label: 'Suspendus' },
]
const MEMBERSHIP: Record<string, string> = { ACTIVE: 'Actif', PENDING: 'En attente', TO_VERIFY: 'À vérifier', INACTIVE: 'Inactif' }

type UserList = { items: AdminUserDto[]; nextCursor: string | null; pendingCount: number }
type UserDetail = AdminUserDto & { email: string | null; city: string | null; groups: string[] }

function statusOf(u: AdminUserDto): string {
  if (u.status === 'SUSPENDED') return 'Suspendu'
  if (u.membership?.status === 'PENDING') return 'En attente'
  return 'Actif'
}

export default function UsersPage() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  )
}

function Users() {
  const params = useSearchParams()
  const { seat } = useSession()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>((params.get('filtre') as Filter) || 'ALL')
  const [sel, setSel] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const dq = useDebounced(q.trim())

  useEffect(() => setQ(params.get('q') ?? ''), [params])

  const list = useInfiniteQuery({
    queryKey: ['users', seat.structure.id, filter, dq],
    queryFn: ({ pageParam }) => api.get<UserList>('/admin/users', { structureId: seat.structure.id, filter, q: dq || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const users = list.data?.pages.flatMap((p) => p.items) ?? []
  const pending = list.data?.pages[0]?.pendingCount ?? 0
  const grid = '1.6fr 1.4fr 1.6fr 110px'

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Utilisateurs" note="Fidèles et responsables de votre périmètre. Attribuez les rôles et validez les inscriptions.">
        {seat.permissions.USERS_ROLES?.write ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setInviting(true)
              setSel(null)
            }}
          >
            <UserPlus size={16} weight="bold" />
            Inviter un utilisateur
          </button>
        ) : null}
      </PageHead>

      <div className="split">
        <section className="card main" style={{ flexBasis: 560 }}>
          <div className="row" style={{ gap: 10 }}>
            <SearchInput value={q} onChange={setQ} placeholder="Nom, e-mail, téléphone" label="Rechercher une personne" />
            <Chips options={FILTERS.map((f) => ({ ...f, label: f.value === 'PENDING' && pending ? `En attente · ${pending}` : f.label }))} value={filter} onChange={setFilter} label="Filtrer" />
          </div>
          {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
          <div className="table-wrap tbl-pad">
            <div style={{ minWidth: 600 }}>
              <div className="tbl-head" style={{ gridTemplateColumns: grid }}>
                <span>Nom</span>
                <span>Rôle</span>
                <span>Structure</span>
                <span>Statut</span>
              </div>
              {list.isPending ? <Loading rows={6} /> : null}
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="tbl-row big"
                  style={{ gridTemplateColumns: grid, padding: 12 }}
                  aria-pressed={u.id === sel}
                  onClick={() => {
                    setSel(u.id)
                    setInviting(false)
                  }}
                >
                  <span className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0 }}>
                    <span className="avatar">{initials(u.fullName)}</span>
                    <span className="strong ellipsis">{u.fullName}</span>
                  </span>
                  <span style={{ color: 'var(--c-text-muted-2)' }}>{u.roles[0]?.label ?? 'Fidèle'}</span>
                  <span className="muted ellipsis">{u.roles[0]?.structure ?? u.membership?.structure ?? '—'}</span>
                  <span>
                    <Pill label={statusOf(u)} />
                  </span>
                </button>
              ))}
              {!list.isPending && users.length === 0 ? <div className="empty-line" style={{ padding: '24px 12px' }}>Aucune personne ne correspond.</div> : null}
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="foot-note">{fmtInt(users.length)} personne(s) affichée(s) dans votre périmètre</span>
            {list.hasNextPage ? (
              <button type="button" className="btn-ghost btn-sm" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                Afficher plus
              </button>
            ) : null}
          </div>
        </section>

        <section className="card side" style={{ flexBasis: 320, gap: 16 }}>
          {inviting ? (
            <InviteForm onClose={() => setInviting(false)} onDone={(id) => setSel(id)} />
          ) : sel ? (
            <UserCard id={sel} />
          ) : (
            <div className="empty">
              <UserCircle size={40} />
              Sélectionnez une personne pour voir sa fiche et gérer ses rôles.
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function UserCard({ id }: { id: string }) {
  const { me, can } = useSession()
  const u = useQuery({ queryKey: ['user', id], queryFn: () => api.get<UserDetail>(`/admin/users/${id}`) })
  const inv = [['users'], ['user', id], ['dashboard']]
  const approve = useAct((mid: string) => api.post(`/admin/memberships/${mid}/approve`), { ok: () => `Inscription validée : ${u.data?.fullName}`, invalidate: inv })
  const reject = useAct((mid: string) => api.post(`/admin/memberships/${mid}/reject`), { ok: 'Inscription refusée', invalidate: inv })
  const susp = useAct((on: boolean) => api.post(`/admin/users/${id}/${on ? 'suspend' : 'reactivate'}`), { ok: (_, on) => (on ? 'Compte suspendu' : 'Compte réactivé'), invalidate: inv })
  const revoke = useAct((aid: string) => api.del(`/admin/assignments/${aid}`), { ok: 'Mandat terminé', invalidate: inv })

  if (u.isPending) return <Loading rows={5} />
  if (u.isError) return <ErrorBox error={u.error} onRetry={() => u.refetch()} />
  const d = u.data
  const self = d.id === me.id
  const st = statusOf(d)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        <span className="avatar lg">{initials(d.fullName)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: '400 26px/1.1 var(--font-serif), serif' }}>{d.fullName}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {d.email ? `${d.email} · ` : ''}
            {prettyPhone(d.phone)}
            {d.residence === 'DIASPORA' ? ' · Diaspora' : ''}
          </div>
        </div>
      </div>
      <div>
        <Pill label={st} />
      </div>

      {d.membership ? (
        <div className="fact">
          <div className="k">Rattachement</div>
          <div className="v">{d.membership.structure}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {MEMBERSHIP[d.membership.status] ?? d.membership.status} · demande du {dayShort(d.membership.requestedAt)}
            {d.groups.length ? ` · ${d.groups.join(', ')}` : ''}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-text-muted)', marginBottom: 4 }}>Rôles</span>
        {d.roles.length === 0 ? <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>Fidèle, sans mandat.</div> : null}
        {d.roles.map((r) => (
          <div key={r.assignmentId} className="line" style={{ padding: '10px 0', gap: 10, boxShadow: '0 1px 0 var(--c-border-soft)' }}>
            <ShieldCheck size={18} color="var(--c-primary)" />
            <div className="grow">
              <div className="t">
                {r.label}
                {r.title ? ` · ${r.title}` : ''}
              </div>
              <div className="m">
                {r.structure}
                {r.endsAt ? ` · jusqu’au ${dayShort(r.endsAt)}` : ''}
              </div>
            </div>
            {can('USERS_ROLES', 'write') && !self ? (
              <button
                type="button"
                className="link-danger"
                disabled={revoke.isPending}
                onClick={() => {
                  if (window.confirm(`Mettre fin au mandat de ${d.fullName} (${r.label}, ${r.structure}) ?`)) revoke.mutate(r.assignmentId)
                }}
              >
                Mettre fin
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {!self ? (
        <div className="row">
          {d.membership?.status === 'PENDING' && can('MEMBERS', 'validate', true) ? (
            <>
              <button type="button" className="btn" disabled={approve.isPending} onClick={() => approve.mutate(d.membership!.id)}>
                <Check size={16} weight="bold" />
                Valider l’inscription
              </button>
              <button type="button" className="icon-btn" style={{ width: 44, height: 44 }} aria-label="Refuser l’inscription" disabled={reject.isPending} onClick={() => reject.mutate(d.membership!.id)}>
                <X size={16} />
              </button>
            </>
          ) : null}
          {can('MEMBERS', 'validate') || can('USERS_ROLES', 'validate') ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={susp.isPending}
              onClick={() => {
                const on = d.status !== 'SUSPENDED'
                if (!on || window.confirm(`Suspendre le compte de ${d.fullName} ? Ses sessions seront fermées immédiatement.`)) susp.mutate(on)
              }}
            >
              {d.status === 'SUSPENDED' ? <Play size={16} /> : <Pause size={16} />}
              {d.status === 'SUSPENDED' ? 'Réactiver' : 'Suspendre'}
            </button>
          ) : null}
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 13 }}>
          C’est votre compte : vos mandats se gèrent depuis le niveau supérieur.
        </span>
      )}

      {can('USERS_ROLES', 'write') && !self && d.status === 'ACTIVE' ? <AssignBox email={d.email} userId={d.id} /> : null}
    </div>
  )
}

/**
 * Rôles proposables : comme l'API, on ne donne que des droits que l'on détient soi-même
 * (un droit détaillé ne s'obtient pas d'un droit agrégé).
 */
function useAssignableRoles() {
  const { seat } = useSession()
  const q = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleMatrixDto[]>('/admin/roles'), staleTime: 5 * 60_000 })
  const data = useMemo(
    () =>
      (q.data ?? []).filter((r) =>
        Object.entries(r.permissions).every(([m, p]) => {
          const mine = seat.permissions[m as keyof typeof seat.permissions]
          if (!p || !(p.read || p.write || p.validate)) return true
          return !!mine && (!p.read || mine.read) && (!p.write || mine.write) && (!p.validate || mine.validate) && (!p.read || p.aggregateOnly || !mine.aggregateOnly)
        }),
      ),
    [q.data, seat],
  )
  return { ...q, data }
}

function AssignBox({ email, userId }: { email: string | null; userId: string }) {
  const { seat } = useSession()
  const roles = useAssignableRoles()
  const [roleId, setRoleId] = useState('')
  const [structureId, setStructureId] = useState(seat.structure.id)
  const options = roles.data
  const role = roleId || options[0]?.id || ''
  const assign = useAct(() => api.post('/admin/assignments', { email, roleId: role, structureId }), {
    ok: () => `${options.find((r) => r.id === role)?.label} attribué`,
    invalidate: [['users'], ['user', userId]],
  })
  return (
    <div className="soft-box on-soft">
      <span style={{ fontSize: 14, fontWeight: 700 }}>Attribuer un rôle</span>
      <select className="select" value={role} onChange={(e) => setRoleId(e.target.value)} aria-label="Rôle">
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <StructureSelect value={structureId} onChange={setStructureId} />
      <button type="button" className="btn" disabled={!role || !email || assign.isPending} onClick={() => assign.mutate()}>
        Attribuer
      </button>
      {!email ? <span className="field-error">Ce compte n’a pas d’adresse e-mail : la personne doit l’ajouter dans son profil avant d’être nommée.</span> : null}
      <span style={{ fontSize: 12, color: 'var(--c-text-muted-2)' }}>Les droits suivent le rôle, limités à la structure choisie et à ses sous-structures. Vous ne pouvez donner que des droits que vous détenez.</span>
    </div>
  )
}

function InviteForm({ onClose, onDone }: { onClose: () => void; onDone: (userId: string) => void }) {
  const { seat } = useSession()
  const roles = useAssignableRoles()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState<PhoneValue>(emptyPhone)
  const [roleId, setRoleId] = useState('')
  const [title, setTitle] = useState('')
  const [structureId, setStructureId] = useState(seat.structure.id)
  const role = roleId || roles.data?.[0]?.id || ''
  const e164 = toE164(phone)
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())
  const invite = useAct(
    () =>
      api.post<{ userId: string; invited: boolean }>('/admin/assignments', {
        email: email.trim(),
        fullName: name.trim() || undefined,
        phone: e164 ?? undefined,
        roleId: role,
        structureId,
        title: title.trim() || undefined,
      }),
    {
      ok: (r) => (r.invited ? 'Invitation envoyée par e-mail' : 'Rôle attribué · la personne est prévenue par e-mail'),
      invalidate: [['users']],
      onDone: (r) => {
        onClose()
        onDone(r.userId)
      },
    },
  )
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault()
        if (validEmail && role) invite.mutate()
      }}
    >
      <h2>Inviter un responsable</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        La personne est retrouvée par son adresse e-mail ; sans compte, elle en reçoit un. Elle définit elle-même son mot de passe avec un code reçu par e-mail.
      </p>
      <Field label="Nom complet" hint="Requis si la personne n’a pas encore de compte.">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Adresse e-mail">
        <input className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <div className="field">
        <label htmlFor="invite-phone">Téléphone</label>
        <PhoneField id="invite-phone" value={phone} onChange={setPhone} />
        <span className="field-hint">Requis si la personne n’a pas encore de compte.</span>
      </div>
      <Field label="Rôle">
        <select className="select" value={role} onChange={(e) => setRoleId(e.target.value)}>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="field">
        <span>Structure</span>
        <StructureSelect value={structureId} onChange={setStructureId} />
      </div>
      <Field label="Titre (facultatif)">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Trésorier, Pasteur" />
      </Field>
      <div className="row">
        <button className="btn" type="submit" disabled={!validEmail || !role || invite.isPending}>
          <UserPlus size={16} weight="bold" />
          Inviter
        </button>
        <button className="btn-ghost" type="button" onClick={onClose}>
          Annuler
        </button>
      </div>
    </form>
  )
}
