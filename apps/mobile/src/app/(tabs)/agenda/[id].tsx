import { useState } from 'react'
import { Linking, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BroadcastIcon, CalendarBlankIcon, CalendarPlusIcon, CheckIcon, ClockIcon, MapPinIcon, PlusIcon, type Icon } from 'phosphor-react-native'
import { agendaParts, type EventDto } from '@cepca/shared'
import { useEvent, useToggleRegistration } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { eventTime } from '@/lib/format'
import { eventIcs } from '@/lib/ics'
import { openFile } from '@/lib/files'
import { BackHeader, Btn, ErrorState, Loading, Photo, Screen } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Txt } from '@/components/Txt'
import { color } from '@/theme'

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = useEvent(id)
  return (
    <Screen gap={14} bottom={28} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <BackHeader title="Activité" fallback="/agenda" />
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <EventBody e={q.data} />}
    </Screen>
  )
}

function InfoLine({ icon: I, children }: { icon: Icon; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <I size={20} color={color.primary} />
      <Txt size={14} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
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

  async function addToCalendar() {
    try {
      await openFile(eventIcs(e), 'text/calendar', 'Ajouter à mon calendrier')
      setInCal(true)
    } catch {
      toast('Impossible d’ouvrir le calendrier.', 'error')
    }
  }

  return (
    <>
      <View>
        <Photo uri={e.imageUrl} radius={22} style={{ height: 190 }} />
        {e.isLive ? (
          <View style={{ position: 'absolute', left: 12, top: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color.accent }}>
            <Txt size={11} weight={800}>
              RETRANSMIS EN DIRECT
            </Txt>
          </View>
        ) : null}
      </View>
      <Txt serif size={30} lh={1.1} accessibilityRole="header">
        {e.title}
      </Txt>
      <View style={{ gap: 10 }}>
        <InfoLine icon={CalendarBlankIcon}>
          {d.wd} {d.d} {d.month} {d.year}
        </InfoLine>
        <InfoLine icon={ClockIcon}>{eventTime(e)}</InfoLine>
        <InfoLine icon={MapPinIcon}>{e.place}</InfoLine>
      </View>
      {e.description ? (
        <Txt size={15} lh={1.6} color={color.textMuted2}>
          {e.description}
        </Txt>
      ) : null}
      {e.capacity != null ? (
        <Txt size={13} weight={600} color={full ? color.errorFg : color.textMuted}>
          {full ? 'Complet' : `${e.remaining} place${e.remaining === 1 ? '' : 's'} restante${e.remaining === 1 ? '' : 's'} sur ${e.capacity}`}
        </Txt>
      ) : null}
      {e.isLive && e.liveUrl ? <Btn label="Suivre le direct" icon={BroadcastIcon} iconWeight="regular" variant="ochre" height={54} size={15} onPress={() => void Linking.openURL(e.liveUrl!)} /> : null}
      {e.registrationOpen ? (
        <Btn
          label={e.isRegistered ? 'Inscrit · se désinscrire' : "Je m'inscris"}
          icon={e.isRegistered ? CheckIcon : PlusIcon}
          variant={e.isRegistered ? 'outlineGreen' : 'primary'}
          height={54}
          size={15}
          loading={reg.isPending}
          disabled={full}
          onPress={toggleReg}
        />
      ) : null}
      <Btn
        label={inCal ? 'Ajouté à mon calendrier' : 'Ajouter à mon calendrier'}
        icon={inCal ? CheckIcon : CalendarPlusIcon}
        iconWeight={inCal ? 'bold' : 'regular'}
        variant="outline"
        height={50}
        size={14}
        onPress={addToCalendar}
      />
    </>
  )
}
