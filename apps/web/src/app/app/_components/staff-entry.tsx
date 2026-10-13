'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueries } from '@tanstack/react-query'
import { BookOpenText, Briefcase, Buildings, CaretRight, HandCoins, Megaphone, X, type Icon } from '@phosphor-icons/react'
import type { DashboardDto, MeDto } from '@cepca/shared'
import { api } from '@/lib/api'
import { familyOf, staffKeys, useStaffMe, type Family } from '../_lib/staff'
import { Txt, color } from './ui'

const FAMILY_ICON: Record<Family, Icon> = { structure: BookOpenText, finance: HandCoins, project: Buildings, communication: Megaphone }

/**
 * Accueil d'un fidèle qui a aussi une responsabilité (maquette 4) : bouton « Espace responsable »,
 * puis choix du rôle s'il en a plusieurs.
 */
export function StaffEntry({ roles }: { roles: MeDto['roles'] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const staff = useStaffMe(roles.length > 0)
  // Les éléments à traiter ne s'affichent qu'une fois l'identité confirmée (double authentification)
  const dashboards = useQueries({
    queries: roles.map((r) => ({ queryKey: staffKeys.dashboard(r.assignmentId), queryFn: () => api.get<DashboardDto>('/admin/dashboard', { assignmentId: r.assignmentId }), enabled: staff.isSuccess, staleTime: 60_000, retry: false })),
  })
  if (roles.length === 0) return null
  const counts = dashboards.map((d) => d.data?.queue.length)
  const total = counts.every((c) => c != null) ? counts.reduce<number>((t, c) => t + (c ?? 0), 0) : null

  const go = () => (roles.length === 1 ? router.push(`/app/espace/${encodeURIComponent(roles[0].assignmentId)}`) : setOpen(true))

  return (
    <>
      <button type="button" onClick={go} className="pwa-press" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 20, background: color.sidebar, color: color.onPrimary, textAlign: 'left' }}>
        <span style={{ flex: 'none', width: 42, height: 42, borderRadius: 14, background: color.sidebarHover, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Briefcase size={21} aria-hidden />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <Txt as="span" size={15} weight={700} style={{ display: 'block' }}>
            Espace responsable
          </Txt>
          <Txt as="span" size={12} color={color.onPrimaryMuted} style={{ display: 'block' }}>
            {roles.length} rôle{roles.length > 1 ? 's' : ''}
            {total != null ? ` · ${total} élément${total > 1 ? 's' : ''} à traiter` : ''}
          </Txt>
        </span>
        <CaretRight size={16} aria-hidden />
      </button>

      {open ? (
        <div className="pwa-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="choose-space" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="pwa-sheet" style={{ alignItems: 'stretch', textAlign: 'left', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt as="h2" id="choose-space" serif size={26}>
                Choisir un espace
              </Txt>
              <button type="button" className="pwa-round" aria-label="Fermer" onClick={() => setOpen(false)} style={{ width: 36, height: 36 }}>
                <X size={16} aria-hidden />
              </button>
            </div>
            {roles.map((r, i) => {
              const I = FAMILY_ICON[familyOf(r.roleKey)]
              const n = counts[i]
              return (
                <button
                  key={r.assignmentId}
                  type="button"
                  className="pwa-select"
                  style={{ minHeight: 64 }}
                  onClick={() => {
                    setOpen(false)
                    router.push(`/app/espace/${encodeURIComponent(r.assignmentId)}`)
                  }}
                >
                  <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: color.primarySoft, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <I size={20} aria-hidden />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <Txt as="span" size={14} weight={700} style={{ display: 'block' }}>
                      {r.label}
                    </Txt>
                    <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
                      {r.structure.name}
                    </Txt>
                  </span>
                  {n ? <span style={{ minWidth: 24, height: 24, padding: '0 7px', borderRadius: 12, background: color.accent, fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span> : null}
                  <CaretRight size={14} color={color.textMuted} aria-hidden />
                </button>
              )
            })}
            <Txt size={12} color={color.textMuted} lh={1.5} style={{ marginTop: 4 }}>
              Vos rôles sont attribués par l’administrateur de votre structure.
            </Txt>
          </div>
        </div>
      ) : null}
    </>
  )
}
