import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { dayMonthYear } from '@cepca/shared'
import { publicGet, type PublicNews } from '@/lib/server-api'
import { NewsPhoto } from '../../_components/chrome'

type Props = { params: Promise<{ id: string }> }

const load = (id: string) => publicGet<PublicNews>(`/news/${encodeURIComponent(id.slice(0, 40))}`)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load((await params).id)
  return a ? { title: a.title, description: a.excerpt } : { title: 'Article introuvable' }
}

export default async function Article({ params }: Props) {
  const a = await load((await params).id)
  if (!a) notFound()
  return (
    <main className="article">
      <Link href="/actualites" className="back">
        <ArrowLeft size={16} />
        Toutes les actualités
      </Link>
      <span className="meta-line">
        <span>{a.kindLabel}</span>
        <span>·</span>
        <span>{a.origin}</span>
        {a.publishedAt ? (
          <>
            <span>·</span>
            <span>{dayMonthYear(a.publishedAt)}</span>
          </>
        ) : null}
      </span>
      <h1>{a.title}</h1>
      {a.imageUrl ? <NewsPhoto src={a.imageUrl} source={a.source} eager /> : null}
      <div className="body">{a.body}</div>
    </main>
  )
}
