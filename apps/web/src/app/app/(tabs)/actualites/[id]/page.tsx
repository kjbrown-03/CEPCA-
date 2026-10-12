'use client'

import { use, useState } from 'react'
import { Check, FilePdf, ShareNetwork } from '@phosphor-icons/react'
import { dayMonth, type PublicationDto } from '@cepca/shared'
import { usePublication } from '../../../_lib/queries'
import { saveFile } from '../../../_lib/device'
import { useToast } from '../../../_components/toast'
import { BackHeader, Btn, ErrorState, Loading, Overline, Photo, RoundButton, Screen, Txt } from '../../../_components/ui'

export default function NewsDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const q = usePublication(id)
  const toast = useToast()
  const [shared, setShared] = useState(false)
  const n = q.data

  /** Feuille de partage du téléphone (WhatsApp, SMS…), ou copie du texte si le navigateur n'en a pas. */
  async function share(p: PublicationDto) {
    const text = `${p.title}\n\n${p.body[0] ?? ''}\n\n— ${p.source}, via l'application CEPCA`
    try {
      if (navigator.share) {
        await navigator.share({ title: p.title, text })
        setShared(true)
      } else {
        await navigator.clipboard.writeText(text)
        setShared(true)
        toast('Texte copié')
      }
    } catch {
      // partage annulé
    }
  }

  return (
    <Screen gap={14}>
      <BackHeader
        title={n?.kindLabel ?? ''}
        fallback="/app/actualites"
        right={
          n ? (
            <RoundButton label="Partager" onClick={() => void share(n)}>
              {shared ? <Check size={18} weight="bold" /> : <ShareNetwork size={18} />}
            </RoundButton>
          ) : null
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError || !n ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <article style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {n.imageUrl ? <Photo uri={n.imageUrl} radius={22} style={{ height: 210 }} /> : null}
          <Overline>
            {n.source} · {dayMonth(n.publishedAt)}
          </Overline>
          <Txt as="h2" serif size={30} lh={1.1}>
            {n.title}
          </Txt>
          {n.body.map((t, i) => (
            <Txt key={i} as="p" size={15} lh={1.65}>
              {t}
            </Txt>
          ))}
          {n.attachmentUrl ? <Attachment url={n.attachmentUrl} /> : null}
        </article>
      )}
    </Screen>
  )
}

function Attachment({ url }: { url: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <Btn
      label="Ouvrir la pièce jointe"
      icon={FilePdf}
      iconWeight="regular"
      variant="outlineGreen"
      height={48}
      size={14}
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await saveFile(url)
        } catch {
          toast('La pièce jointe n’a pas pu être ouverte.', 'error')
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}
