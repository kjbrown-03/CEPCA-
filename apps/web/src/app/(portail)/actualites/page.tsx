import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { dayMonthYear } from '@cepca/shared'
import { publicGet, type PublicConfession, type PublicNews } from '@/lib/server-api'
import { NewsPhoto } from '../_components/chrome'

export const metadata: Metadata = { title: 'Actualités', description: 'Actualités et communiqués du CEPCA et de ses Églises membres.' }

type Search = { confession?: string; kind?: string; apres?: string }

const KINDS = [
  { v: '', l: 'Tout' },
  { v: 'ACTUALITE', l: 'Actualités' },
  { v: 'COMMUNIQUE', l: 'Communiqués' },
]

export default async function NewsList({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const confession = sp.confession && /^[A-Z0-9]{2,12}$/.test(sp.confession) ? sp.confession : undefined
  const kind = sp.kind === 'ACTUALITE' || sp.kind === 'COMMUNIQUE' ? sp.kind : undefined
  const q = new URLSearchParams({ take: '12' })
  if (confession) q.set('confession', confession)
  if (kind) q.set('kind', kind)
  if (sp.apres) q.set('cursor', sp.apres.slice(0, 40))
  const [data, confessions] = await Promise.all([publicGet<{ items: PublicNews[]; nextCursor: string | null }>(`/news?${q}`), publicGet<PublicConfession[]>('/confessions')])

  /** Lien qui garde les filtres courants ; une valeur vide retire le filtre. */
  const href = (p: Partial<Record<keyof Search, string>>) => {
    const s = new URLSearchParams()
    const next = { confession: confession ?? '', kind: kind ?? '', ...p }
    for (const [k, v] of Object.entries(next)) if (v) s.set(k, v)
    const str = s.toString()
    return `/actualites${str ? `?${str}` : ''}`
  }

  return (
    <main className="wrap news" style={{ paddingTop: 'clamp(40px, 6vw, 80px)' }}>
      <Link href="/#actualites" className="back">
        <ArrowLeft size={16} />
        Accueil
      </Link>
      <div className="news-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h1 className="section-title">Actualités</h1>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            {confession ? `${confessions?.find((c) => c.code === confession)?.name ?? confession} et le CEPCA` : 'Le CEPCA et toutes ses Églises membres'}
          </span>
        </div>
        <nav className="p-chips" aria-label="Type de publication">
          {KINDS.map((k) => (
            <Link key={k.v} href={href({ kind: k.v, apres: '' })} className="p-chip" aria-current={(kind ?? '') === k.v ? 'page' : undefined} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {k.l}
            </Link>
          ))}
        </nav>
      </div>
      {confessions?.length ? (
        <nav className="p-chips" aria-label="Confession">
          <Link href={href({ confession: '', apres: '' })} className="p-chip" aria-current={!confession ? 'page' : undefined} style={{ display: 'inline-flex', alignItems: 'center' }}>
            Toutes
          </Link>
          {confessions.map((c) => (
            <Link key={c.code} href={href({ confession: c.code, apres: '' })} className="p-chip" aria-current={confession === c.code ? 'page' : undefined} style={{ display: 'inline-flex', alignItems: 'center' }} title={c.name}>
              {c.code}
            </Link>
          ))}
        </nav>
      ) : null}
      {!data ? <p className="lead-p">Les actualités sont momentanément indisponibles.</p> : null}
      {data && data.items.length === 0 ? <p className="lead-p">Aucune publication pour ce filtre.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 520px), 1fr))', columnGap: 56 }}>
        {data?.items.map((n) => (
          <Link key={n.id} href={`/actualites/${n.id}`} className="item">
            <NewsPhoto src={n.imageUrl} source={n.source} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="meta-line">
                <span>{n.kindLabel}</span>
                <span>·</span>
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
      </div>
      {data?.nextCursor ? (
        <Link href={href({ apres: data.nextCursor })} className="all-link">
          Publications plus anciennes
          <ArrowRight size={16} weight="bold" />
        </Link>
      ) : null}
    </main>
  )
}
