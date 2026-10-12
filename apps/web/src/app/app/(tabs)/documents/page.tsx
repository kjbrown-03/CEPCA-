'use client'

import { useState } from 'react'
import { DownloadSimple, FilePdf, FileText } from '@phosphor-icons/react'
import type { DocumentDto } from '@cepca/shared'
import { useDocuments } from '../../_lib/queries'
import { saveFile } from '../../_lib/device'
import { useToast } from '../../_components/toast'
import { BackHeader, Empty, ErrorState, ListRow, Loading, Screen, Txt, color } from '../../_components/ui'

const isPdf = (d: DocumentDto) => d.mimeType === 'application/pdf'

/** « 1,2 Mo », « 840 Ko » */
function size(bytes: number): string {
  if (bytes >= 1e6) return String(Math.round(bytes / 1e5) / 10).replace('.', ',') + ' Mo'
  return Math.max(1, Math.round(bytes / 1e3)) + ' Ko'
}

export default function Documents() {
  const q = useDocuments()
  return (
    <Screen gap={0}>
      <div style={{ marginBottom: 8 }}>
        <BackHeader title="Documents" fallback="/app" />
      </div>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <Empty>Aucun document partagé pour le moment.</Empty>
      ) : (
        q.data.map((d) => <DocRow key={d.id} d={d} />)
      )}
    </Screen>
  )
}

function DocRow({ d }: { d: DocumentDto }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const I = isPdf(d) ? FilePdf : FileText

  async function open() {
    setBusy(true)
    try {
      await saveFile(d.url)
    } catch {
      toast('Le téléchargement a échoué. Réessayez.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ListRow>
      <span style={{ flex: 'none', width: 42, height: 50, borderRadius: 8, background: color.surface, boxShadow: `inset 0 0 0 1px ${color.fieldBorder}`, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <I size={20} aria-hidden />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={600} lh={1.3}>
          {d.title}
        </Txt>
        <Txt size={12} color={color.textMuted}>
          {isPdf(d) ? 'PDF' : d.category} · {size(d.sizeBytes)}
        </Txt>
      </div>
      <button
        type="button"
        onClick={busy ? undefined : open}
        aria-label={`Télécharger ${d.title}`}
        aria-busy={busy || undefined}
        style={{ flex: 'none', width: 40, height: 40, borderRadius: 20, boxShadow: `inset 0 0 0 1px ${color.primary}`, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {busy ? <span className="pwa-spinner" style={{ width: 18, height: 18 }} /> : <DownloadSimple size={18} aria-hidden />}
      </button>
    </ListRow>
  )
}
