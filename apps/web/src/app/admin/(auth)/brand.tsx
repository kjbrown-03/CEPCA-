import Link from 'next/link'
import { Cross } from '@phosphor-icons/react/dist/ssr'

export function AuthBrand() {
  return (
    <aside className="auth-brand">
      <Link href="/" className="bo-brand" style={{ padding: 0 }}>
        <span className="bo-mark">
          <Cross size={17} weight="bold" />
        </span>
        <div>
          <div className="name">CEPCA</div>
          <div className="sub">Back-office</div>
        </div>
      </Link>
      <div>
        <blockquote>
          Des Églises diverses, <em>une même maison.</em>
        </blockquote>
        <p>Espace des responsables : chacun ne voit que sa structure et celles qui en dépendent. Toute action sensible est tracée au journal.</p>
      </div>
      <span className="foot">Conseil des Églises Protestantes du Cameroun</span>
    </aside>
  )
}
