'use client'

import { useSeatSubtree } from '@/lib/session'

/** Structure du mandat ou l'une de ses sous-structures, indentées selon l'arbre. */
export function StructureSelect({ value, onChange, maxDepth, label = 'Structure', id }: { value: string; onChange: (v: string) => void; maxDepth?: number; label?: string; id?: string }) {
  const { nodes } = useSeatSubtree()
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {nodes
        .filter((n) => maxDepth === undefined || n.rel <= maxDepth)
        .map((n) => (
          <option key={n.id} value={n.id}>
            {' '.repeat(n.rel * 3) + n.name}
          </option>
        ))}
    </select>
  )
}
