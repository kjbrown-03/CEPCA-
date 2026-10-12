'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, FloppyDisk, TreeStructure } from '@phosphor-icons/react'
import { MODULES, MODULE_LABEL, type ModuleKey } from '@cepca/shared'
import { api } from '@/lib/api'
import { useAct } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import type { RoleMatrixDto } from '@/lib/types'
import { Chips, ErrorBox, Loading, PageHead } from '@/components/ui'

type Cell = { read: boolean; write: boolean; validate: boolean }
type Matrix = Record<ModuleKey, Cell>
const ACTIONS: Array<{ k: keyof Cell; label: string }> = [
  { k: 'read', label: 'Consulter' },
  { k: 'write', label: 'Créer / modifier' },
  { k: 'validate', label: 'Valider' },
]

function toMatrix(r: RoleMatrixDto): Matrix {
  const m = {} as Matrix
  for (const mod of MODULES) {
    const p = r.permissions[mod]
    m[mod] = { read: !!p?.read, write: !!p?.write, validate: !!p?.validate }
  }
  return m
}

export default function RolesPage() {
  const { seat, can } = useSession()
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<RoleMatrixDto[]>('/admin/roles') })
  const [roleId, setRoleId] = useState<string | null>(null)
  // Par défaut, le rôle du mandat actif
  const role = roles.data?.find((r) => r.id === roleId) ?? roles.data?.find((r) => r.key === seat.roleKey) ?? roles.data?.[0]
  const [draft, setDraft] = useState<Matrix | null>(null)
  const saved = useMemo(() => (role ? toMatrix(role) : null), [role])
  const m = draft ?? saved
  const dirty = !!draft && !!saved && MODULES.some((x) => ACTIONS.some((a) => draft[x][a.k] !== saved[x][a.k]))

  useEffect(() => setDraft(null), [role?.id])

  const save = useAct(() => api.put<RoleMatrixDto>(`/admin/roles/${role!.id}/permissions`, { permissions: draft }), {
    ok: () => `Droits enregistrés : ${role?.label}`,
    invalidate: [['roles']],
    onDone: () => setDraft(null),
  })

  const toggle = (mod: ModuleKey, k: keyof Cell) => {
    if (!m || !role?.editable) return
    const cur = m[mod]
    const on = !cur[k]
    // Créer ou valider suppose de consulter ; ne plus consulter retire le reste
    const next: Cell = k === 'read' ? (on ? { ...cur, read: true } : { read: false, write: false, validate: false }) : { ...cur, [k]: on, read: cur.read || on }
    setDraft({ ...m, [mod]: next })
  }

  // Les modules du paramétrage d'abord, dans l'ordre de la maquette
  const order: ModuleKey[] = ['NEWS', 'EVENTS', 'SERMONS', 'DOCUMENTS', 'MEMBERS', 'CONTRIBUTIONS', 'PROJECTS', 'REPORTS', 'USERS_ROLES', 'SETTINGS', 'NOTIFICATIONS', 'STRUCTURES', 'AUDIT']
  const grid = '2.2fr 1fr 1fr 1fr'

  return (
    <>
      <PageHead
        eyebrow={`${seat.roleLabel} · ${seat.structure.level}`}
        title="Rôles et droits"
        note="Ce que chaque rôle peut consulter, créer ou valider. Les droits s’appliquent à la structure de la personne et à ses sous-structures."
      >
        {can('USERS_ROLES', 'validate') ? (
          <button type="button" className="btn" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <FloppyDisk size={16} weight="bold" />
            Enregistrer les droits
          </button>
        ) : null}
      </PageHead>

      <section className="card" style={{ gap: 18 }}>
        {roles.isPending ? <Loading rows={8} /> : null}
        {roles.isError ? <ErrorBox error={roles.error} onRetry={() => roles.refetch()} /> : null}
        {roles.data && role && m ? (
          <>
            <Chips
              label="Rôle"
              options={roles.data.map((r) => ({ value: r.id, label: r.label }))}
              value={role.id}
              onChange={(id) => {
                if (!dirty || window.confirm('Abandonner les modifications non enregistrées ?')) setRoleId(id)
              }}
            />
            {role.description ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>{role.description}</p> : null}
            <div className="table-wrap">
              <div style={{ minWidth: 620 }}>
                <div className="tbl-head" style={{ gridTemplateColumns: grid, gap: 12 }}>
                  <span>Module</span>
                  {ACTIONS.map((a) => (
                    <span key={a.k} style={{ textAlign: 'center' }}>
                      {a.label}
                    </span>
                  ))}
                </div>
                {order.map((mod) => (
                  <div key={mod} className="tbl-row" style={{ gridTemplateColumns: grid, gap: 12, padding: '10px 0' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {MODULE_LABEL[mod]}
                      {role.permissions[mod]?.aggregateOnly ? <span className="pill pill-sm tone-info" style={{ marginLeft: 8 }}>agrégé</span> : null}
                    </span>
                    {ACTIONS.map((a) => (
                      <span key={a.k} style={{ display: 'flex', justifyContent: 'center' }}>
                        <button type="button" role="checkbox" className="mx-cell" aria-checked={m[mod][a.k]} aria-label={`${MODULE_LABEL[mod]} : ${a.label}`} disabled={!role.editable} onClick={() => toggle(mod, a.k)}>
                          {m[mod][a.k] ? <Check size={15} weight="bold" /> : null}
                        </button>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between', gap: 14 }}>
              <span className="row muted" style={{ fontSize: 13, gap: 8 }}>
                <TreeStructure size={18} color="var(--c-primary)" />
                Périmètre : {seat.structure.level} · {seat.structure.name} et ses sous-structures
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: !role.editable ? 'var(--c-text-muted)' : dirty ? 'var(--c-warn-fg)' : 'var(--c-primary)' }}>
                {!role.editable ? (role.isSystem ? 'Rôle commun, fixé par le CEPCA' : 'Lecture seule') : dirty ? 'Modifications non enregistrées' : 'Enregistré'}
              </span>
            </div>
          </>
        ) : null}
      </section>
    </>
  )
}
