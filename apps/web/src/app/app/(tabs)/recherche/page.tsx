'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Buildings, CalendarBlank, Church, FilePdf, MagnifyingGlass, MicrophoneStage, X, type Icon } from '@phosphor-icons/react'
import type { SearchCategory, SearchResultDto } from '@cepca/shared'
import { useSearch } from '../../_lib/queries'
import { saveFile } from '../../_lib/device'
import { useToast } from '../../_components/toast'
import { BackHeader, Chip, ChipRow, Empty, ErrorState, ListRow, Loading, Screen, Txt, color } from '../../_components/ui'

const CATS: Array<[SearchCategory | undefined, string]> = [
  [undefined, 'Tout'],
  ['SERMON', 'Prédication'],
  ['STRUCTURE', 'Paroisse'],
  ['PROJECT', 'Projet'],
  ['EVENT', 'Événement'],
  ['DOCUMENT', 'Document'],
]
const LABEL: Record<SearchCategory, string> = { SERMON: 'Prédication', STRUCTURE: 'Paroisse', PROJECT: 'Projet', EVENT: 'Événement', DOCUMENT: 'Document' }
const ICON: Record<SearchCategory, Icon> = { SERMON: MicrophoneStage, STRUCTURE: Church, PROJECT: Buildings, EVENT: CalendarBlank, DOCUMENT: FilePdf }

/** Attend une pause dans la frappe avant d'interroger l'API. */
function useDebounced(v: string, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

/** Maquette 3 · « Recherche » : prédications, paroisses, projets, événements, documents. */
export default function Search() {
  const [text, setText] = useState('')
  const [cat, setCat] = useState<SearchCategory | undefined>()
  const q = useDebounced(text.trim())
  const r = useSearch(q, cat)
  const short = q.length < 2

  return (
    <Screen gap={12}>
      <BackHeader title="Recherche" fallback="/app" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 999, background: color.surface, boxShadow: `inset 0 0 0 1.5px ${color.primary}` }}>
        <MagnifyingGlass size={18} color={color.primary} aria-hidden />
        <input
          // type="text" : un champ « search » ajoute sa propre croix, en double avec celle de l'écran
          type="text"
          role="searchbox"
          inputMode="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Prédication, paroisse, projet…"
          aria-label="Rechercher"
          autoFocus
          enterKeyHint="search"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', fontSize: 15, color: color.text }}
        />
        {text ? (
          <button type="button" onClick={() => setText('')} aria-label="Effacer" style={{ display: 'inline-flex', color: color.textMuted }}>
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </label>
      <ChipRow wrap={false}>
        {CATS.map(([k, l]) => (
          <Chip key={l} label={l} active={cat === k} onClick={() => setCat(k)} height={34} />
        ))}
      </ChipRow>

      {short ? (
        <Empty>Saisissez au moins 2 caractères.</Empty>
      ) : r.isPending ? (
        <Loading minHeight={160} />
      ) : r.isError ? (
        <ErrorState error={r.error} onRetry={() => r.refetch()} />
      ) : (
        <section aria-live="polite">
          <Txt size={12} weight={700} color={color.textMuted} style={{ marginBottom: 4 }}>
            {r.data.length} résultat{r.data.length > 1 ? 's' : ''}
          </Txt>
          {r.data.length === 0 ? <Empty>Aucun résultat. Essayez un autre mot.</Empty> : r.data.map((x) => <ResultRow key={`${x.category}-${x.id}`} r={x} />)}
        </section>
      )}
    </Screen>
  )
}

function ResultRow({ r }: { r: SearchResultDto }) {
  const router = useRouter()
  const toast = useToast()
  const I = ICON[r.category]
  // Un document se télécharge (fichier derrière le relais /api) ; une paroisse n'a pas de fiche dédiée
  const open =
    r.category === 'DOCUMENT' && r.href
      ? () => saveFile(r.href!).catch(() => toast('Le téléchargement a échoué. Réessayez.', 'error'))
      : r.href
        ? () => router.push(r.href!)
        : undefined
  const body = (
    <>
      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: color.primarySoft, color: color.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <I size={19} aria-hidden />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <Txt as="span" size={14} weight={600} lh={1.3} style={{ display: 'block' }}>
          {r.title}
        </Txt>
        <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
          {[LABEL[r.category], r.meta].filter(Boolean).join(' · ')}
        </Txt>
      </span>
    </>
  )
  return open ? <ListRow onClick={open}>{body}</ListRow> : <ListRow>{body}</ListRow>
}
