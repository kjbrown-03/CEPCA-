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
import { api } from './api'

// Clés de cache : une par ressource, pour invalider précisément après une action
export const qk = {
  me: ['me'] as const,
  home: ['home'] as const,
  publications: (scope?: string) => ['publications', scope ?? 'ALL'] as const,
  publication: (id: string) => ['publication', id] as const,
  events: ['events'] as const,
  event: (id: string) => ['event', id] as const,
  notifications: ['notifications'] as const,
  sermons: (type?: string) => ['sermons', type ?? 'ALL'] as const,
  sermon: (id: string) => ['sermon', id] as const,
  documents: ['documents'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  types: ['contribution-types'] as const,
  history: ['contributions'] as const,
  contribution: (id: string) => ['contribution', id] as const,
  registrations: ['registrations'] as const,
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api<MeDto>('/me') })
export const useHome = () => useQuery({ queryKey: qk.home, queryFn: () => api<HomeDto>('/feed/home') })

export const usePublications = (scope?: string) =>
  useQuery({ queryKey: qk.publications(scope), queryFn: () => api<PublicationDto[]>('/feed/publications' + (scope ? `?scope=${scope}` : '')) })
export const usePublication = (id: string) => useQuery({ queryKey: qk.publication(id), queryFn: () => api<PublicationDto>(`/feed/publications/${encodeURIComponent(id)}`) })

export const useEvents = () => useQuery({ queryKey: qk.events, queryFn: () => api<EventDto[]>('/feed/events') })
export const useEvent = (id: string) => useQuery({ queryKey: qk.event(id), queryFn: () => api<EventDto>(`/feed/events/${encodeURIComponent(id)}`) })
export const useRegistrations = () => useQuery({ queryKey: qk.registrations, queryFn: () => api<EventDto[]>('/me/registrations') })

export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => api<NotificationDto[]>('/notifications') })

export const useSermons = (type?: 'AUDIO' | 'VIDEO') => useQuery({ queryKey: qk.sermons(type), queryFn: () => api<SermonDto[]>('/feed/sermons' + (type ? `?type=${type}` : '')) })
export const useSermon = (id: string) => useQuery({ queryKey: qk.sermon(id), queryFn: () => api<SermonDto>(`/feed/sermons/${encodeURIComponent(id)}`) })

export const useDocuments = () => useQuery({ queryKey: qk.documents, queryFn: () => api<DocumentDto[]>('/feed/documents') })

export const useProjects = () => useQuery({ queryKey: qk.projects, queryFn: () => api<ProjectDto[]>('/feed/projects') })
export const useProject = (id: string) => useQuery({ queryKey: qk.project(id), queryFn: () => api<ProjectDto>(`/feed/projects/${encodeURIComponent(id)}`) })

export const useContributionTypes = (enabled = true) => useQuery({ queryKey: qk.types, queryFn: () => api<ContributionTypeDto[]>('/contributions/types'), enabled })

export const useHistory = () =>
  useInfiniteQuery({
    queryKey: qk.history,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api<ContributionHistoryDto>('/contributions' + (pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : '')),
    getNextPageParam: (last) => last.nextCursor,
  })

/** Suivi d'une contribution ; `poll` relance la lecture tant que le paiement est en attente. */
export const useContribution = (id: string | null, poll = false) =>
  useQuery({
    queryKey: qk.contribution(id ?? ''),
    queryFn: () => api<ContributionDto>(`/contributions/${encodeURIComponent(id!)}`),
    enabled: !!id,
    refetchInterval: (q) => (poll && q.state.data?.status === 'PENDING' ? 3000 : false),
  })

export function useToggleRegistration(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (register: boolean) => api<{ registered: boolean }>(`/events/${encodeURIComponent(id)}/registration`, { method: register ? 'POST' : 'DELETE' }),
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
    mutationFn: (id: string | 'all') => api(id === 'all' ? '/notifications/read-all' : `/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
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
