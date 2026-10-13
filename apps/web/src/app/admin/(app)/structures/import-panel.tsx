'use client'

import { useRef, useState } from 'react'
import { DownloadSimple, FileArrowUp } from '@phosphor-icons/react'
import { api, download } from '@/lib/api'
import { useAct } from '@/lib/hooks'

export function ImportStructuresPanel({ onClose }: { onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const send = useAct(
    (selected: File) => {
      const form = new FormData()
      form.append('file', selected)
      return api.upload<{ created: number }>('/admin/imports/structures', form)
    },
    {
      ok: (r) => `${r.created} structure(s) importée(s)`,
      invalidate: [['structures'], ['dashboard']],
      onDone: onClose,
    },
  )

  return (
    <section className="card" style={{ gap: 14 }}>
      <div className="card-head">
        <div>
          <h2>Import initial</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            Téléchargez le modèle, faites remplir les onglets Structures et Responsables, puis importez uniquement les structures validées.
          </p>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn-ghost" onClick={() => void download('/admin/imports/structures/template')}>
          <DownloadSimple size={16} />
          Télécharger le modèle Excel
        </button>
        <input ref={input} type="file" accept=".xlsx,.csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button type="button" className="btn-ghost" onClick={() => input.current?.click()}>
          <FileArrowUp size={16} />
          {file ? file.name : 'Choisir le fichier rempli'}
        </button>
        <button type="button" className="btn" disabled={!file || send.isPending} onClick={() => file && send.mutate(file)}>
          Importer les structures
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>
      <span className="foot-note">L&apos;onglet Responsables sert à collecter les identités. Les comptes et rôles restent créés dans Utilisateurs pour garder le contrôle des droits.</span>
    </section>
  )
}
