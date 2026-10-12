import {
  BellRinging,
  BookOpenText,
  Buildings,
  CalendarBlank,
  ChartBar,
  Church,
  Folder,
  Gear,
  GitBranch,
  GlobeHemisphereWest,
  HandCoins,
  HouseLine,
  ListChecks,
  Megaphone,
  MicrophoneStage,
  Newspaper,
  ShieldCheck,
  SquaresFour,
  TreeStructure,
  Users,
  type Icon,
} from '@phosphor-icons/react'

/** Entrées du menu, dans l'ordre de la maquette ; la clé est celle que renvoie l'API (seat.nav). */
export const NAV: Record<string, { href: string; label: string; icon: Icon }> = {
  dash: { href: '/admin', label: 'Tableau de bord', icon: SquaresFour },
  struct: { href: '/admin/structures', label: 'Structures', icon: TreeStructure },
  users: { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  roles: { href: '/admin/roles', label: 'Rôles et droits', icon: ShieldCheck },
  news: { href: '/admin/publications', label: 'Publications', icon: Newspaper },
  events: { href: '/admin/evenements', label: 'Événements', icon: CalendarBlank },
  sermons: { href: '/admin/predications', label: 'Prédications', icon: MicrophoneStage },
  docs: { href: '/admin/documents', label: 'Documents', icon: Folder },
  notif: { href: '/admin/notifications', label: 'Notifications', icon: BellRinging },
  proj: { href: '/admin/projets', label: 'Projets', icon: Buildings },
  pay: { href: '/admin/contributions', label: 'Contributions', icon: HandCoins },
  reports: { href: '/admin/rapports', label: 'Rapports', icon: ChartBar },
  audit: { href: '/admin/journal', label: "Journal d'audit", icon: ListChecks },
  settings: { href: '/admin/parametres', label: 'Paramètres', icon: Gear },
}

export function navKeyFor(pathname: string): string {
  let best = 'dash'
  for (const [k, n] of Object.entries(NAV)) if (n.href !== '/admin' && (pathname === n.href || pathname.startsWith(n.href + '/'))) best = k
  return best
}

const ROLE_ICON: Record<string, Icon> = {
  cepca_admin: GlobeHemisphereWest,
  conf_admin: Church,
  synod_lead: TreeStructure,
  consistory_lead: GitBranch,
  pastor: BookOpenText,
  chapel_lead: HouseLine,
  finance: HandCoins,
  project: Buildings,
  communication: Megaphone,
  youth: Users,
}
export const roleIcon = (key: string): Icon => ROLE_ICON[key] ?? ShieldCheck

/** Icône d'un niveau de l'arbre, par profondeur (CEPCA, confession, synode, consistoire, paroisse, chapelle). */
const DEPTH_ICON: Icon[] = [GlobeHemisphereWest, Church, TreeStructure, GitBranch, BookOpenText, HouseLine]
export const depthIcon = (depth: number): Icon => DEPTH_ICON[Math.min(depth, DEPTH_ICON.length - 1)]
