'use client'

import { useEffect, useState } from 'react'
import { Calculator, Camera, Car, ChalkboardTeacher, Check, CookingPot, FirstAid, Hammer, Minus, MusicNotes, type Icon } from '@phosphor-icons/react'
import { VOLUNTEER_SKILLS, WEEK_DAYS, type VolunteerDto, type VolunteerSkill, type WeekDay } from '@cepca/shared'
import { errorMessage } from '@/lib/api'
import { useSaveVolunteer, useVolunteer } from '../../../_lib/queries'
import { useToast } from '../../../_components/toast'
import { BackHeader, Btn, Card, ErrorState, Loading, Screen, Txt, color } from '../../../_components/ui'

const SKILL_ICON: Record<VolunteerSkill, Icon> = {
  chant: MusicNotes,
  batiment: Hammer,
  sante: FirstAid,
  enseignement: ChalkboardTeacher,
  photo: Camera,
  comptabilite: Calculator,
  transport: Car,
  cuisine: CookingPot,
}

/** Maquette 3 · « Je participe » (§27) : compétences et jours disponibles, pour être sollicité. */
export default function Participate() {
  const q = useVolunteer()
  return (
    <Screen gap={14}>
      <BackHeader title="Je participe" fallback="/app/mon-eglise" />
      <Txt size={14} lh={1.5} color={color.textMuted}>
        Indiquez vos compétences et vos disponibilités. Les responsables d’activités et de projets pourront vous solliciter.
      </Txt>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <ProfileForm v={q.data} />}
    </Screen>
  )
}

const pill = (on: boolean) => ({ background: on ? color.primary : color.surface, color: on ? color.onPrimary : color.text, boxShadow: `inset 0 0 0 1px ${on ? color.primary : color.fieldBorder}` })

function ProfileForm({ v }: { v: VolunteerDto }) {
  const toast = useToast()
  const save = useSaveVolunteer()
  const [skills, setSkills] = useState<Set<string>>(() => new Set(v.skills))
  const [days, setDays] = useState<Set<string>>(() => new Set(v.days))
  const [dirty, setDirty] = useState(false)

  // Après l'enregistrement, la réponse de l'API (dédoublonnée) devient l'état de référence
  useEffect(() => {
    setSkills(new Set(v.skills))
    setDays(new Set(v.days))
  }, [v])

  const flip = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    setter(n)
    setDirty(true)
  }

  function submit() {
    save.mutate(
      { skills: [...skills] as VolunteerSkill[], days: WEEK_DAYS.map((d) => d[0]).filter((d) => days.has(d)) as WeekDay[] },
      {
        onSuccess: () => {
          setDirty(false)
          toast('Profil enregistré.')
        },
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    )
  }

  const saved = !dirty && !!v.updatedAt
  return (
    <>
      <section>
        <Txt as="h2" serif size={22} style={{ marginBottom: 10 }}>
          Mes compétences
        </Txt>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} role="group" aria-label="Mes compétences">
          {VOLUNTEER_SKILLS.map(([k, label]) => {
            const on = skills.has(k)
            const I = SKILL_ICON[k]
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => flip(skills, setSkills, k)} style={{ height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', fontSize: 13, fontWeight: 600, ...pill(on) }}>
                <I size={18} aria-hidden />
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <Txt as="h2" serif size={22} style={{ marginBottom: 10 }}>
          Mes disponibilités
        </Txt>
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Jours disponibles">
          {WEEK_DAYS.map(([k, label]) => {
            const on = days.has(k)
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => flip(days, setDays, k)} style={{ flex: 1, height: 58, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 12, fontWeight: 700, ...pill(on) }}>
                {label}
                {on ? <Check size={14} weight="bold" aria-hidden /> : <Minus size={14} aria-hidden />}
              </button>
            )
          })}
        </div>
      </section>

      {saved ? (
        <Card style={{ padding: 16, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Txt as="span" serif size={30} color={color.primary}>
            {v.openActivities}
          </Txt>
          <Txt as="span" size={13} lh={1.4}>
            {v.openActivities > 1 ? 'activités ouvertes aux inscriptions' : 'activité ouverte aux inscriptions'} cette semaine, les jours où vous êtes disponible.
          </Txt>
        </Card>
      ) : null}

      <Btn label={saved ? 'Profil enregistré' : 'Enregistrer mon profil'} icon={saved ? Check : undefined} variant={saved ? 'outlineGreen' : 'primary'} height={52} size={15} loading={save.isPending} disabled={saved} onClick={submit} />
    </>
  )
}
