'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, CheckCircle, MagnifyingGlass, X } from '@phosphor-icons/react'
import { dayMonthYear } from '@cepca/shared'
import type { PublicConfession, PublicNews } from '@/lib/server-api'
import { NewsPhoto } from './chrome'

type Kind = '' | 'ACTUALITE' | 'COMMUNIQUE'
const KINDS: Array<{ value: Kind; label: string }> = [
  { value: '', label: 'Tout' },
  { value: 'ACTUALITE', label: 'Actualités' },
  { value: 'COMMUNIQUE', label: 'Communiqués' },
]
const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`

export function ChurchesAndNews({ confessions, news: initial }: { confessions: PublicConfession[] | null; news: PublicNews[] | null }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('')
  const [news, setNews] = useState<PublicNews[] | null>(initial)
  const [loading, setLoading] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const ac = new AbortController()
    setLoading(true)
    const p = new URLSearchParams({ take: '4' })
    if (sel) p.set('confession', sel)
    if (kind) p.set('kind', kind)
    fetch(`/api/public/news?${p}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: PublicNews[] }) => setNews(d.items))
      .catch((e) => e.name !== 'AbortError' && setNews(null))
      .finally(() => !ac.signal.aborted && setLoading(false))
    return () => ac.abort()
  }, [sel, kind])

  const ql = q.trim().toLowerCase()
  const list = (confessions ?? []).filter((c) => !ql || `${c.code} ${c.name}`.toLowerCase().includes(ql))
  const selected = confessions?.find((c) => c.code === sel)
  const feat = news?.[0]
  const rest = news?.slice(1, 4) ?? []
  const allHref = `/actualites${sel || kind ? `?${new URLSearchParams({ ...(sel ? { confession: sel } : {}), ...(kind ? { kind } : {}) })}` : ''}`

  return (
    <>
      <section id="eglises" className="churches-band" aria-labelledby="eglises-titre">
        <div className="wrap churches">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 440 }}>
            <h2 id="eglises-titre" className="section-title">
              Églises <em>membres</em>
            </h2>
            <p className="lead-p">Sélectionnez une confession pour filtrer les actualités.</p>
            <div className="p-search">
              <MagnifyingGlass size={16} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une confession" aria-label="Rechercher une confession" />
            </div>
            <div className="photo" style={{ height: 260, borderRadius: 24, marginTop: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={U('photo-1708267062168-38fdffccde95')} alt="" loading="lazy" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="conf-grid">
              {list.map((c) => {
                const on = sel === c.code
                return (
                  <button key={c.code} type="button" className="conf" aria-pressed={on} onClick={() => setSel(on ? null : c.code)}>
                    <span className="code">{c.code}</span>
                    <span className="nm">{c.name}</span>
                    {on ? <CheckCircle size={18} weight="fill" /> : <ArrowUpRight size={18} />}
                  </button>
                )
              })}
            </div>
            {confessions && list.length === 0 ? <div style={{ padding: '24px 0', fontSize: 15, color: 'var(--muted)' }}>Aucune confession ne correspond à cette recherche.</div> : null}
            {!confessions ? <div style={{ padding: '24px 0', fontSize: 15, color: 'var(--muted)' }}>La liste des Églises membres est momentanément indisponible.</div> : null}
            {selected ? (
              <div className="selected">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="k">Confession sélectionnée</div>
                  <div className="v">{selected.name}</div>
                </div>
                {selected.website ? (
                  <a href={selected.website} className="ocre-btn" target="_blank" rel="noreferrer">
                    Son site
                    <ArrowUpRight size={16} weight="bold" />
                  </a>
                ) : (
                  <a href="#actualites" className="ocre-btn">
                    Voir ses actualités
                    <ArrowUpRight size={16} weight="bold" />
                  </a>
                )}
                <button type="button" className="x" aria-label="Retirer la sélection" onClick={() => setSel(null)}>
                  <X size={18} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section id="actualites" className="wrap news" aria-labelledby="actualites-titre" aria-busy={loading}>
        <div className="news-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 id="actualites-titre" className="section-title">
              Actualités
            </h2>
            {selected ? <span style={{ fontSize: 14, color: 'var(--muted)' }}>Filtré sur {selected.code} et le CEPCA</span> : null}
          </div>
          <div className="p-chips" role="radiogroup" aria-label="Type">
            {KINDS.map((k) => (
              <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} className="p-chip" onClick={() => setKind(k.value)}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {feat ? (
          <div className="news-grid" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
            <Link href={`/actualites/${feat.id}`} className="feat">
              <NewsPhoto src={feat.imageUrl} source={feat.source} />
              <span className="meta-line">
                <span>{feat.kindLabel}</span>
                <span>·</span>
                <span>{feat.source}</span>
                {feat.publishedAt ? (
                  <>
                    <span>·</span>
                    <span>{dayMonthYear(feat.publishedAt)}</span>
                  </>
                ) : null}
              </span>
              <span className="t">{feat.title}</span>
              <span className="x">{feat.excerpt}</span>
            </Link>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rest.map((n) => (
                <Link key={n.id} href={`/actualites/${n.id}`} className="item">
                  <NewsPhoto src={n.imageUrl} source={n.source} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span className="meta-line">
                      <span>{n.source}</span>
                      {n.publishedAt ? (
                        <>
                          <span>·</span>
                          <span>{dayMonthYear(n.publishedAt)}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="t">{n.title}</span>
                  </div>
                </Link>
              ))}
              <Link href={allHref} className="all-link">
                Toutes les actualités
                <ArrowRight size={16} weight="bold" />
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 0', fontSize: 16, color: 'var(--muted)' }}>{news === null ? 'Les actualités sont momentanément indisponibles.' : 'Aucune publication pour ce filtre.'}</div>
        )}
      </section>
    </>
  )
}
