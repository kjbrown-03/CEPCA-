import { useState } from 'react'
import { Share } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { CheckIcon, FilePdfIcon, ShareNetworkIcon } from 'phosphor-react-native'
import { dayMonth, type PublicationDto } from '@cepca/shared'
import { usePublication } from '@/lib/queries'
import { download, openFile, safeName } from '@/lib/files'
import { BackHeader, Btn, ErrorState, Loading, Photo, RoundButton, Screen } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Overline, Txt } from '@/components/Txt'
import { color } from '@/theme'

export default function NewsDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const q = usePublication(id)
  const [shared, setShared] = useState(false)
  const n = q.data

  async function share(p: PublicationDto) {
    const r = await Share.share({ title: p.title, message: `${p.title}\n\n${p.body[0] ?? ''}\n\n— ${p.source}, via l'application CEPCA` }).catch(() => null)
    if (r && r.action !== Share.dismissedAction) setShared(true)
  }

  return (
    <Screen gap={14} bottom={28}>
      <BackHeader
        title={n?.kindLabel ?? ''}
        fallback="/news"
        right={
          n ? (
            <RoundButton label="Partager" onPress={() => void share(n)}>
              {shared ? <CheckIcon size={18} weight="bold" color={color.text} /> : <ShareNetworkIcon size={18} color={color.text} />}
            </RoundButton>
          ) : null
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError || !n ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          {n.imageUrl ? <Photo uri={n.imageUrl} radius={22} style={{ height: 210 }} /> : null}
          <Overline>
            {n.source} · {dayMonth(n.publishedAt)}
          </Overline>
          <Txt serif size={30} lh={1.1} accessibilityRole="header">
            {n.title}
          </Txt>
          {n.body.map((t, i) => (
            <Txt key={i} size={15} lh={1.65} selectable>
              {t}
            </Txt>
          ))}
          {n.attachmentUrl ? <Attachment p={n} /> : null}
        </>
      )}
    </Screen>
  )
}

function Attachment({ p }: { p: PublicationDto }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Btn
      label="Ouvrir la pièce jointe"
      icon={FilePdfIcon}
      iconWeight="regular"
      variant="outlineGreen"
      height={48}
      size={14}
      loading={busy}
      onPress={async () => {
        setBusy(true)
        try {
          const f = await download(p.attachmentUrl!, 'documents', safeName('pub-' + p.id, 'pdf'))
          await openFile(f, 'application/pdf', p.title)
        } catch {
          toast('La pièce jointe n’a pas pu être ouverte.', 'error')
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}
