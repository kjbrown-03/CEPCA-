import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { CheckIcon, DownloadSimpleIcon, FilePdfIcon, FileTextIcon } from 'phosphor-react-native'
import type { DocumentDto } from '@cepca/shared'
import { useDocuments } from '@/lib/queries'
import { download, localFile, openFile, safeName } from '@/lib/files'
import { BackHeader, Empty, ErrorState, ListRow, Loading, Screen } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { Txt } from '@/components/Txt'
import { color, extra } from '@/theme'

const isPdf = (d: DocumentDto) => d.mimeType === 'application/pdf'
const ext = (d: DocumentDto) => (isPdf(d) ? 'pdf' : d.mimeType.split('/')[1]?.replace(/[^\w]/g, '').slice(0, 5) || 'bin')

/** « 1,2 Mo », « 840 Ko » */
function size(bytes: number): string {
  if (bytes >= 1e6) return String(Math.round(bytes / 1e5) / 10).replace('.', ',') + ' Mo'
  return Math.max(1, Math.round(bytes / 1e3)) + ' Ko'
}

export default function Documents() {
  const q = useDocuments()
  return (
    <Screen gap={0} refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ marginBottom: 8 }}>
        <BackHeader title="Documents" fallback="/home" />
      </View>
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
  const file = localFile('documents', safeName(d.id, ext(d)))
  const [saved, setSaved] = useState(file.exists)
  const [busy, setBusy] = useState(false)
  const I = isPdf(d) ? FilePdfIcon : FileTextIcon

  async function onPress() {
    setBusy(true)
    try {
      const f = saved ? file : await download(d.url, 'documents', file.name)
      if (!saved) {
        setSaved(true)
        toast('Document téléchargé')
      }
      await openFile(f, d.mimeType, d.title)
    } catch {
      toast('Le téléchargement a échoué. Réessayez.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ListRow>
      <View style={{ width: 42, height: 50, borderRadius: 8, backgroundColor: color.surface, borderWidth: 1, borderColor: extra.fieldBorder, alignItems: 'center', justifyContent: 'center' }}>
        <I size={20} color={color.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={600} lh={1.3}>
          {d.title}
        </Txt>
        <Txt size={12} color={color.textMuted}>
          {isPdf(d) ? 'PDF' : d.category} · {size(d.sizeBytes)}
        </Txt>
      </View>
      <Pressable
        onPress={busy ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={saved ? `Ouvrir ${d.title}` : `Télécharger ${d.title}`}
        style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.primary, backgroundColor: saved ? color.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
      >
        {busy ? <ActivityIndicator size="small" color={saved ? color.onPrimary : color.primary} /> : saved ? <CheckIcon size={18} weight="bold" color={color.onPrimary} /> : <DownloadSimpleIcon size={18} color={color.primary} />}
      </Pressable>
    </ListRow>
  )
}
