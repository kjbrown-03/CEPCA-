'use client'

import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarPlus, Camera, FileText, HandCoins, Megaphone, MicrophoneStage, PencilSimpleLine, PlusCircle, ArrowsLeftRight, UsersThree, Image as ImageIcon, Browsers, type Icon } from '@phosphor-icons/react'
import type { AdminMeDto, DashboardDto, QueueItemDto } from '@cepca/shared'
import { api, ApiError } from '@/lib/api'

/** Fonctions des responsables : il faut la double authentification (sinon l'API répond MFA_REQUIRED). */
export const isMfaRequired = (e: unknown) => e instanceof ApiError && e.code === 'MFA_REQUIRED'

export const staffKeys = {
  me: ['app', 'staff', 'me'] as const,
  dashboard: (id: string) => ['app', 'staff', 'dashboard', id] as const,
}

export const useStaffMe = (enabled = true) =>
  useQuery({ queryKey: staffKeys.me, queryFn: () => api.get<AdminMeDto>('/admin/me'), enabled, retry: false, staleTime: 5 * 60_000 })

export const useSeatDashboard = (assignmentId: string, enabled = true) =>
  useQuery({ queryKey: staffKeys.dashboard(assignmentId), queryFn: () => api.get<DashboardDto>('/admin/dashboard', { assignmentId }), enabled, staleTime: 30_000 })

export type Family = 'structure' | 'finance' | 'project' | 'communication'
export const familyOf = (roleKey: string): Family => (roleKey === 'finance' ? 'finance' : roleKey === 'project' ? 'project' : roleKey === 'communication' ? 'communication' : 'structure')

export interface QuickAction {
  icon: Icon
  label: string
  /** Écran de l'application (formulaire rapide) ou page du back-office (tâche plus lourde) */
  href: (seat: string) => string
  backOffice?: boolean
}

/** Trois actions rapides par espace (maquette 4). */
export const QUICK: Record<Family, QuickAction[]> = {
  structure: [
    { icon: Megaphone, label: 'Publier une annonce', href: (s) => `/app/espace/${s}/annonce` },
    { icon: MicrophoneStage, label: 'Ajouter une prédication', href: () => '/admin/predications', backOffice: true },
    { icon: CalendarPlus, label: 'Créer une activité', href: (s) => `/app/espace/${s}/activite` },
  ],
  finance: [
    { icon: PlusCircle, label: 'Saisie manuelle', href: (s) => `/app/espace/${s}/saisie` },
    { icon: ArrowsLeftRight, label: 'Rapprocher', href: () => '/admin/contributions?statut=PENDING', backOffice: true },
    { icon: HandCoins, label: 'Contributions', href: () => '/admin/contributions', backOffice: true },
  ],
  project: [
    { icon: Camera, label: 'Photos du chantier', href: (s) => `/app/espace/${s}/etape?photo=1` },
    { icon: FileText, label: 'Rapport d’étape', href: (s) => `/app/espace/${s}/etape` },
    { icon: UsersThree, label: 'Projets', href: () => '/admin/projets', backOffice: true },
  ],
  communication: [
    { icon: PencilSimpleLine, label: 'Rédiger', href: (s) => `/app/espace/${s}/annonce` },
    { icon: Bell, label: 'Envoyer une notification', href: (s) => `/app/espace/${s}/notification` },
    { icon: ImageIcon, label: 'Médias', href: () => '/admin/predications', backOffice: true },
  ],
}

export const BACK_OFFICE: QuickAction = { icon: Browsers, label: 'Ouvrir le back-office', href: () => '/admin', backOffice: true }

/** L'élément se règle-t-il en un geste depuis l'application ? (sans rien envoyer) */
export function oneTap(item: QueueItemDto): boolean {
  if (item.kind === 'PUBLICATION') return item.actions.includes('approve')
  return ['MEMBERSHIP', 'REFUND', 'SERMON', 'PROJECT', 'PAYMENT'].includes(item.kind)
}

/** Décision en un geste depuis la liste « à traiter » (mêmes routes que le tableau de bord du back-office). */
export function decide(item: QueueItemDto, ok: boolean): Promise<unknown> | null {
  switch (item.kind) {
    case 'MEMBERSHIP':
      return api.post(`/admin/memberships/${encodeURIComponent(item.id)}/${ok ? 'approve' : 'reject'}`)
    case 'REFUND':
      return api.post(`/admin/refunds/${encodeURIComponent(item.id)}/${ok ? 'validate' : 'reject'}`)
    case 'PUBLICATION':
      return item.actions.includes('approve') ? api.post(`/admin/publications/${encodeURIComponent(item.id)}/publish`) : null
    case 'SERMON':
      return api.post(`/admin/sermons/${encodeURIComponent(item.id)}/publish`)
    case 'PROJECT':
      return api.post(`/admin/projects/${encodeURIComponent(item.id)}/validate`)
    case 'PAYMENT':
      // « Régler » : on redemande le statut à l'opérateur
      return api.post(`/admin/contributions/${encodeURIComponent(item.id)}/recheck`)
    default:
      return null
  }
}

/** Libellés du bouton en un geste et du résultat, selon la nature de l'élément (maquette : Valider / Régler…). */
export const CTA: Record<QueueItemDto['kind'], { cta: string; done: string }> = {
  MEMBERSHIP: { cta: 'Valider', done: 'Validé' },
  PUBLICATION: { cta: 'Publier', done: 'Publié' },
  SERMON: { cta: 'Publier', done: 'Publiée' },
  PROJECT: { cta: 'Valider', done: 'Validé' },
  PAYMENT: { cta: 'Régler', done: 'Vérifié auprès de l’opérateur' },
  REFUND: { cta: 'Valider', done: 'Validé' },
  CLOSING: { cta: 'Ouvrir', done: '' },
}

/** Page du back-office qui traite un élément quand il ne se règle pas en un geste. */
export const OPEN_HREF: Record<QueueItemDto['kind'], (id: string) => string> = {
  MEMBERSHIP: () => '/admin/utilisateurs?filtre=PENDING',
  PUBLICATION: (id) => `/admin/publications?id=${id}`,
  SERMON: (id) => `/admin/predications?id=${id}`,
  PROJECT: (id) => `/admin/projets?id=${id}`,
  PAYMENT: () => '/admin/contributions?statut=PENDING',
  REFUND: () => '/admin/contributions?vue=remboursements',
  CLOSING: () => '/admin/contributions',
}
