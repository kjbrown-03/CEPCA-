'use client'

import type { ReactNode } from 'react'
import type { AdminSeat } from '@cepca/shared'
import { useMe } from '../_lib/queries'
import { isMfaRequired, useStaffMe } from '../_lib/staff'
import { StepUp } from './stepup'
import { BackHeader, Empty, ErrorState, Loading, Screen } from './ui'

/**
 * Garde des écrans de l'espace responsable : le rôle doit être le sien, et la double authentification faite.
 * Sinon : confirmation d'identité (mot de passe + code e-mail) à la place du contenu.
 */
export function SeatGate({ id, title, fallback = '/app', children }: { id: string; title: string; fallback?: string; children: (seat: AdminSeat) => ReactNode }) {
  const me = useMe()
  const role = me.data?.roles.find((r) => r.assignmentId === id)
  const staff = useStaffMe(!!role)

  if (me.isPending || (role && staff.isPending))
    return (
      <Screen>
        <BackHeader title={title} fallback={fallback} />
        <Loading />
      </Screen>
    )
  if (!role)
    return (
      <Screen>
        <BackHeader title={title} fallback={fallback} />
        <Empty>Ce rôle ne vous est plus attribué. Vos rôles sont gérés par l’administrateur de votre structure.</Empty>
      </Screen>
    )
  if (staff.isError)
    return (
      <Screen>
        <BackHeader title={title} fallback={fallback} />
        {isMfaRequired(staff.error) ? <StepUp roleLabel={role.label} /> : <ErrorState error={staff.error} onRetry={() => staff.refetch()} />}
      </Screen>
    )
  const seat = staff.data?.seats.find((s) => s.assignmentId === id)
  if (!seat)
    return (
      <Screen>
        <BackHeader title={title} fallback={fallback} />
        <Empty>Ce rôle n’est plus actif.</Empty>
      </Screen>
    )
  return <>{children(seat)}</>
}

/** Droit du mandat sur un module (l'API reste seule juge). */
export function can(seat: AdminSeat, module: keyof AdminSeat['permissions'], action: 'read' | 'write' | 'validate' = 'read') {
  return !!seat.permissions[module]?.[action]
}
