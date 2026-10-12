'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ContributionDto,
  ContributionHistoryDto,
  ContributionTypeDto,
  DocumentDto,
  EventDto,
  HomeDto,
  MeDto,
  NotificationDto,
  ProjectDto,
  PublicationDto,
  SermonDto,
} from '@cepca/shared'
import { api } from '@/lib/api'

// Clés de cache : une par ressource, pour invalider précisément après une action
export const qk = {
  me: ['app', 'me'] as const,
  home: ['app', 'home'] as const,
  publications: (scope?: string) => ['app', 'publications', scope ?? 'ALL'] as const,
  publication: (id: string) => ['app', 'publication', id] as const,
  events: ['app', 'events'] as const,
  event: (id: string) => ['app', 'event', id] as const,
  notifications: ['app', 'notifications'] as const,
  sermons: (type?: string) => ['app', 'sermons', type ?? 'ALL'] as const,
  sermon: (id: string) => ['app', 'sermon', id] as const,
  documents: ['app', 'documents'] as const,
  projects: ['app', 'projects'] as const,
  project: (id: string) => ['app', 'project', id] as const,
  types: ['app', 'contribution-types'] as const,
  history: ['app', 'contributions'] as const,
  contribution: (id: string) => ['app', 'contribution', id] as const,
  registrations: ['app', 'registrations'] as const,
}

const enc = encodeURIComponent

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api.get<MeDto>('/me') })
export const useHome = () => useQuery({ queryKey: qk.home, queryFn: () => api.get<HomeDto>('/feed/home') })

export const usePublications = (scope?: string) => useQuery({ queryKey: qk.publications(scope), queryFn: () => api.get<PublicationDto[]>('/feed/publications', { scope }) })
export const usePublication = (id: string) => useQuery({ queryKey: qk.publication(id), queryFn: () => api.get<PublicationDto>(`/feed/publications/${enc(id)}`) })

export const useEvents = () => useQuery({ queryKey: qk.events, queryFn: () => api.get<EventDto[]>('/feed/events') })
export const useEvent = (id: string) => useQuery({ queryKey: qk.event(id), queryFn: () => api.get<EventDto>(`/feed/events/${enc(id)}`) })
export const useRegistrations = () => useQuery({ queryKey: qk.registrations, queryFn: () => api.get<EventDto[]>('/me/registrations') })

export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => api.get<NotificationDto[]>('/notifications') })

export const useSermons = (type?: 'AUDIO' | 'VIDEO') => useQuery({ queryKey: qk.sermons(type), queryFn: () => api.get<SermonDto[]>('/feed/sermons', { type }) })
export const useSermon = (id: string) => useQuery({ queryKey: qk.sermon(id), queryFn: () => api.get<SermonDto>(`/feed/sermons/${enc(id)}`) })

export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: () => api.get<DocumentDto[]>('/feed/documents') })

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api.get<ProjectDto[]>('/feed/projects') })
export const useProject = (id: string) => useQuery({ queryKey: qk.project(id), queryFn: () => api.get<ProjectDto>(`/feed/projects/${enc(id)}`) })

export const useContributionTypes = (enabled = true) => useQuery({ queryKey: qk.types, queryFn: () => api.get<ContributionTypeDto[]>('/contributions/types'), enabled })

export const useHistory = () =>
  useInfiniteQuery({
    queryKey: qk.history,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<ContributionHistoryDto>('/contributions', { cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  })

/** Suivi d'une contribution ; `poll` relance la lecture tant que le paiement est en attente. */
export const useContribution = (id: string | null, poll = false) =>
  useQuery({
    queryKey: qk.contribution(id ?? ''),
    queryFn: () => api.get<ContributionDto>(`/contributions/${enc(id!)}`),
    enabled: !!id,
    refetchInterval: (q) => (poll && q.state.data?.status === 'PENDING' ? 3000 : false),
  })

export function useToggleRegistration(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (register: boolean) => (register ? api.post<{ registered: boolean }>(`/events/${enc(id)}/registration`) : api.del<{ registered: boolean }>(`/events/${enc(id)}/registration`)),
    onSuccess: ({ registered }) => {
      qc.setQueryData<EventDto>(qk.event(id), (e) => (e ? { ...e, isRegistered: registered, registeredCount: e.registeredCount + (registered ? 1 : -1) } : e))
      qc.setQueryData<EventDto[]>(qk.events, (xs) => xs?.map((e) => (e.id === id ? { ...e, isRegistered: registered } : e)))
      void qc.invalidateQueries({ queryKey: qk.registrations })
      void qc.invalidateQueries({ queryKey: qk.notifications })
      void qc.invalidateQueries({ queryKey: qk.home })
    },
  })
}

/** Marque lue localement tout de suite, puis côté API ; le compteur de la cloche suit. */
export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string | 'all') => api.post(id === 'all' ? '/notifications/read-all' : `/notifications/${enc(id)}/read`),
    onMutate: (id) => {
      qc.setQueryData<NotificationDto[]>(qk.notifications, (xs) => xs?.map((n) => (id === 'all' || n.id === id ? { ...n, read: true } : n)))
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications })
      void qc.invalidateQueries({ queryKey: qk.home })
      void qc.invalidateQueries({ queryKey: qk.me })
    },
  })
}
