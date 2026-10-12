'use client'

import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { DownloadSimple } from '@phosphor-icons/react'
import { fmtInt } from '@cepca/shared'
import { api, download, errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import { useSession } from '@/lib/session'
import type { AuditRow, Page } from '@/lib/types'
import { dayTime } from '@/lib/format'
import { Chips, ErrorBox, Loading, PageHead, SearchInput, useToast } from '@/components/ui'

const CATEGORIES = [
  { value: '', label: 'Tous' },
  { value: 'CONNEXION', label: 'Connexion' },
  { value: 'VALIDATION', label: 'Validation' },
  { value: 'PAIEMENT', label: 'Paiement' },
  { value: 'DROITS', label: 'Droits' },
  { value: 'EXPORT', label: 'Export' },
  { value: 'PUBLICATION', label: 'Publication' },
  { value: 'SUPPRESSION', label: 'Suppression' },
  { value: 'PARAMETRAGE', label: 'Paramétrage' },
]
// Couleurs de la maquette (table AK)
const TONE: Record<string, string> = {
  CONNEXION: 'tone-neutral',
  VALIDATION: 'tone-ok',
  PAIEMENT: 'tone-warn',
  DROITS: 'tone-err',
  EXPORT: 'tone-info',
  PUBLICATION: 'tone-pub',
  SUPPRESSION: 'tone-err',
  PARAMETRAGE: 'tone-neutral',
}

export default function AuditPage() {
  const { seat } = useSession()
  const toast = useToast()
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const dq = useDebounced(q.trim())
  const [busy, setBusy] = useState(false)
  const list = useInfiniteQuery({
    queryKey: ['audit', category, dq],
    queryFn: ({ pageParam }) => api.get<Page<AuditRow>>('/admin/audit', { category: category || undefined, q: dq || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const grid = '130px 1.3fr 120px 2.6fr 90px 120px'

  const exportCsv = async () => {
    setBusy(true)
    try {
      await download('/admin/audit', { format: 'csv', category: category || undefined, q: dq || undefined })
      toast('Journal exporté (CSV)')
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead eyebrow={`${seat.roleLabel} · ${seat.structure.level}`} title="Journal d’audit" note="Toutes les actions sensibles sont tracées : connexions, validations, paiements, droits, exports.">
        <button type="button" className="btn" disabled={busy} onClick={exportCsv}>
          <DownloadSimple size={16} weight="bold" />
          Exporter le journal (CSV)
        </button>
      </PageHead>
      <section className="card">
        <div className="row" style={{ gap: 10 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Utilisateur, action" label="Rechercher dans le journal" />
          <Chips label="Catégorie" options={CATEGORIES} value={category} onChange={setCategory} />
        </div>
        {list.isError ? <ErrorBox error={list.error} onRetry={() => list.refetch()} /> : null}
        <div className="table-wrap">
          <div style={{ minWidth: 900 }}>
            <div className="tbl-head" style={{ gridTemplateColumns: grid }}>
              <span>Date</span>
              <span>Utilisateur</span>
              <span>Action</span>
              <span>Détail</span>
              <span>Résultat</span>
              <span>Adresse IP</span>
            </div>
            {list.isPending ? <Loading rows={8} /> : null}
            {rows.map((a) => (
              <div key={a.id} className="tbl-row" style={{ gridTemplateColumns: grid }}>
                <span className="muted tabular">{dayTime(a.at)}</span>
                <span className="strong">{a.actor}</span>
                <span>
                  <span className={`pill pill-sm ${TONE[a.category] ?? ''}`}>{a.categoryLabel}</span>
                </span>
                <span style={{ lineHeight: 1.4 }}>{a.action}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: a.success ? 'var(--c-primary)' : 'var(--c-error-fg)' }}>{a.success ? 'Réussi' : 'Échec'}</span>
                <span className="muted tabular">{a.ip ?? '—'}</span>
              </div>
            ))}
            {!list.isPending && rows.length === 0 ? <div className="empty-line">Aucune entrée ne correspond.</div> : null}
          </div>
        </div>
        {list.hasNextPage ? (
          <button type="button" className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            Afficher plus
          </button>
        ) : null}
        <span className="foot-note">{fmtInt(rows.length)} entrée(s) affichée(s) · conservation 5 ans · lecture seule, aucune entrée ne peut être modifiée ni supprimée</span>
      </section>
    </>
  )
}
