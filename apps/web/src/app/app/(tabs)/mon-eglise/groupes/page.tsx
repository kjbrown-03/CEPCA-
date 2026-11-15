'use client'

import { Baby, GenderFemale, GenderMale, MusicNotes, UsersThree, type Icon } from '@phosphor-icons/react'
import type { GroupDto } from '@cepca/shared'
import { errorMessage } from '@/lib/api'
import { useGroups, useMe, useToggleGroup } from '../../../_lib/queries'
import { useToast } from '../../../_components/toast'
import { BackHeader, Empty, ErrorState, IconTile, ListRow, Loading, Screen, Txt, color } from '../../../_components/ui'

const KIND_ICON: Record<string, Icon> = { choir: MusicNotes, women: GenderFemale, men: GenderMale, youth: UsersThree, other: Baby }

export default function Groups() {
  const q = useGroups()
  const me = useMe()
  const pending = me.data?.membership?.status !== 'ACTIVE'
  return (
    <Screen gap={4}>
      <BackHeader title="Groupes" fallback="/app/mon-eglise" />
      <Txt size={14} lh={1.5} color={color.textMuted} style={{ margin: '10px 0 8px' }}>
        {pending
          ? 'Vous pourrez rejoindre un groupe dès que votre paroisse aura validé votre rattachement.'
          : 'Rejoignez un groupe de votre paroisse. Le responsable valide votre demande.'}
      </Txt>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Votre paroisse n’a pas encore enregistré de groupe.</Empty>
      ) : (
        q.data.map((g) => <GroupRow key={g.id} g={g} disabled={pending} />)
      )}
    </Screen>
  )
}

const CTA = {
  ACTIVE: { label: 'Membre', bg: color.primary, fg: color.onPrimary },
  PENDING: { label: 'En attente', bg: 'transparent', fg: color.primary },
  NONE: { label: 'Rejoindre', bg: 'transparent', fg: color.primary },
}

function GroupRow({ g, disabled }: { g: GroupDto; disabled: boolean }) {
  const toast = useToast()
  const m = useToggleGroup(g.id)
  const cta = CTA[g.myStatus ?? 'NONE']
  const meta = [g.memberCount ? `${g.memberCount} membre${g.memberCount > 1 ? 's' : ''}` : null, g.description].filter(Boolean).join(' · ')
  const closed = !g.openToJoin && !g.myStatus

  function click() {
    // Quitter un groupe validé se confirme : la demande devrait être refaite et revalidée
    if (g.myStatus === 'ACTIVE' && !window.confirm(`Quitter le groupe « ${g.name} » ?`)) return
    m.mutate(!g.myStatus, {
      onSuccess: (r) => toast(r.myStatus === 'PENDING' ? 'Demande envoyée au responsable.' : r.myStatus ? 'Vous êtes membre.' : g.myStatus === 'PENDING' ? 'Demande annulée.' : 'Vous avez quitté le groupe.'),
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  }

  return (
    <ListRow>
      <IconTile icon={KIND_ICON[g.kind] ?? UsersThree} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={700} lh={1.3}>
          {g.name}
        </Txt>
        <Txt size={12} color={color.textMuted}>
          {meta || g.structure}
        </Txt>
      </div>
      {closed ? (
        <Txt as="span" size={12} weight={600} color={color.textMuted} style={{ flex: 'none' }}>
          Sur désignation
        </Txt>
      ) : (
        <button
          type="button"
          onClick={click}
          disabled={(disabled && !g.myStatus) || m.isPending}
          aria-busy={m.isPending || undefined}
          aria-label={g.myStatus === 'ACTIVE' ? `Membre de ${g.name}, quitter` : g.myStatus === 'PENDING' ? `Demande en attente pour ${g.name}, annuler` : `Rejoindre ${g.name}`}
          style={{ flex: 'none', height: 34, padding: '0 14px', borderRadius: 999, background: cta.bg, color: cta.fg, boxShadow: `inset 0 0 0 1.5px ${color.primary}`, fontSize: 12, fontWeight: 700, opacity: disabled && !g.myStatus ? 0.5 : 1 }}
        >
          {cta.label}
        </button>
      )}
    </ListRow>
  )
}
