'use client'

import { use, useState, type ReactNode } from 'react'
import { Broadcast, CalendarBlank, CalendarPlus, Check, Clock, MapPin, Plus, type Icon } from '@phosphor-icons/react'
import { agendaParts, type EventDto } from '@cepca/shared'
import { errorMessage } from '@/lib/api'
import { useEvent, useToggleRegistration } from '../../../_lib/queries'
import { addToCalendar, eventTime } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Btn, ErrorState, Loading, Photo, Screen, Txt, color } from '../../../_components/ui'

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = useEvent(id)
  return (
    <Screen gap={14}>
      <BackHeader title="Activité" fallback="/app/agenda" />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <EventBody e={q.data} />}
    </Screen>
  )
}

function InfoLine({ icon: I, children }: { icon: Icon; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <I size={20} color={color.primary} aria-hidden />
      <Txt as="span" size={14} style={{ flex: 1 }}>
        {children}
      </Txt>
    </div>
  )
}

function EventBody({ e }: { e: EventDto }) {
  const toast = useToast()
  const reg = useToggleRegistration(e.id)
  const [inCal, setInCal] = useState(false)
  const d = agendaParts(e.startsAt)
  const full = e.remaining === 0 && !e.isRegistered

  function toggleReg() {
    reg.mutate(!e.isRegistered, {
      onSuccess: ({ registered }) => toast(registered ? 'Inscription confirmée' : 'Inscription annulée'),
      onError: (err) => toast(errorMessage(err), 'error'),
    })
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <Photo uri={e.imageUrl} radius={22} style={{ height: 190 }} />
        {e.isLive ? (
          <span style={{ position: 'absolute', left: 12, top: 12, padding: '5px 10px', borderRadius: 999, background: color.accent, fontSize: 11, fontWeight: 800 }}>RETRANSMIS EN DIRECT</span>
        ) : null}
      </div>
      <Txt as="h2" serif size={30} lh={1.1}>
        {e.title}
      </Txt>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <InfoLine icon={CalendarBlank}>
          {d.wd} {d.d} {d.month} {d.year}
        </InfoLine>
        <InfoLine icon={Clock}>{eventTime(e)}</InfoLine>
        <InfoLine icon={MapPin}>{e.place}</InfoLine>
      </div>
      {e.description ? (
        <Txt size={15} lh={1.6} color={color.textMuted2} style={{ whiteSpace: 'pre-line' }}>
          {e.description}
        </Txt>
      ) : null}
      {e.capacity != null ? (
        <Txt size={13} weight={600} color={full ? color.errorFg : color.textMuted}>
          {full ? 'Complet' : `${e.remaining} place${e.remaining === 1 ? '' : 's'} restante${e.remaining === 1 ? '' : 's'} sur ${e.capacity}`}
        </Txt>
      ) : null}
      {e.isLive && e.liveUrl ? <Btn label="Suivre le direct" icon={Broadcast} iconWeight="regular" variant="ochre" height={54} size={15} href={e.liveUrl} external /> : null}
      {e.registrationOpen ? (
        <Btn
          label={e.isRegistered ? 'Inscrit · se désinscrire' : 'Je m’inscris'}
          icon={e.isRegistered ? Check : Plus}
          variant={e.isRegistered ? 'outlineGreen' : 'primary'}
          height={54}
          size={15}
          loading={reg.isPending}
          disabled={full}
          onClick={toggleReg}
        />
      ) : null}
      <Btn
        label={inCal ? 'Ajouté à mon calendrier' : 'Ajouter à mon calendrier'}
        icon={inCal ? Check : CalendarPlus}
        iconWeight={inCal ? 'bold' : 'regular'}
        variant="outline"
        height={50}
        size={14}
        onClick={() => {
          addToCalendar(e)
          setInCal(true)
        }}
      />
    </>
  )
}
