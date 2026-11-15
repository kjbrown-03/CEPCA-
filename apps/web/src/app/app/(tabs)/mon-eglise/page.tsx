'use client'

import { BookOpen, CaretRight, Clock, HandsPraying, Lightning, MagnifyingGlass, MapPin, Newspaper, Phone, Sparkle, User, UsersThree, type Icon } from '@phosphor-icons/react'
import { prettyPhone } from '@cepca/shared'
import { ApiError } from '@/lib/api'
import { useChurch } from '../../_lib/queries'
import { Btn, Card, ErrorState, IconTile, ListRow, Loading, RoundButton, Screen, Txt, color } from '../../_components/ui'

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  // Le libellé suit le niveau réel : « Ma paroisse… » ou « Ma chapelle… » (tous deux féminins)
  ACTIVE: { label: 'Ma {niveau} de rattachement', bg: color.primary, fg: color.onPrimary },
  PENDING: { label: 'Rattachement en attente', bg: color.warnBg, fg: color.warnFg },
  TO_VERIFY: { label: 'Rattachement à vérifier', bg: color.warnBg, fg: color.warnFg },
}

const MENU: Array<{ icon: Icon; label: string; sub: string; href: string }> = [
  { icon: UsersThree, label: 'Groupes', sub: 'Chorale, jeunesse, unions…', href: '/app/mon-eglise/groupes' },
  { icon: HandsPraying, label: 'Je participe', sub: 'Mes compétences et disponibilités', href: '/app/mon-eglise/participer' },
  { icon: BookOpen, label: 'Lire et méditer', sub: 'Méditations, études, messages', href: '/app/mon-eglise/mediter' },
  { icon: Lightning, label: 'Espace jeunes et actions sociales', sub: 'Activités, solidarité', href: '/app/mon-eglise/jeunes' },
  { icon: Sparkle, label: 'Mon engagement', sub: 'Mes projets et mes activités', href: '/app/mon-eglise/engagement' },
  { icon: Newspaper, label: 'Actualités', sub: 'Paroisse, confession, CEPCA', href: '/app/actualites' },
]

/** Maquette 3 · « Ma chapelle » : la hiérarchie, le responsable, l'horaire du culte, puis les espaces du fidèle. */
export default function MyChurch() {
  const q = useChurch()
  const none = q.isError && q.error instanceof ApiError && q.error.status === 404
  return (
    <Screen gap={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Txt as="h1" serif size={34} lh={1.05}>
          Mon Église
        </Txt>
        <RoundButton label="Rechercher" href="/app/recherche">
          <MagnifyingGlass size={18} aria-hidden />
        </RoundButton>
      </div>

      {q.isPending ? (
        <Loading minHeight={200} />
      ) : none ? (
        <Card style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Txt size={14} lh={1.5} color={color.textMuted}>
            Rattachez-vous à votre paroisse ou à votre chapelle pour retrouver ici ses groupes, ses activités et ses messages.
          </Txt>
          <Btn label="Choisir mon Église" height={46} size={14} href="/app/eglise" />
        </Card>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ChurchCard c={q.data} />
      )}

      <nav aria-label="Espaces de mon Église">
        {MENU.map((m) => (
          <ListRow key={m.href} href={m.href}>
            <IconTile icon={m.icon} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <Txt as="span" size={14} weight={700} style={{ display: 'block' }}>
                {m.label}
              </Txt>
              <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
                {m.sub}
              </Txt>
            </span>
            <CaretRight size={14} color={color.textMuted} aria-hidden />
          </ListRow>
        ))}
      </nav>
    </Screen>
  )
}

function ChurchCard({ c }: { c: NonNullable<ReturnType<typeof useChurch>['data']> }) {
  const badge = STATUS[c.status]
  const leader = c.leaders[0]
  return (
    <>
      <Card style={{ padding: 18, borderRadius: 22 }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Hiérarchie de mon Église">
          {c.hierarchy.map((h, i) => {
            const last = i === c.hierarchy.length - 1
            return (
              <li key={h.id} style={{ display: 'flex', gap: 12 }} aria-current={last ? 'true' : undefined}>
                <span style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center' }} aria-hidden>
                  <span style={{ width: 12, height: 12, borderRadius: 6, marginTop: 4, boxShadow: `inset 0 0 0 2px ${color.primary}`, background: last ? color.primary : color.surface }} />
                  <span style={{ flex: 1, width: 2, background: last ? 'transparent' : color.primarySoft2 }} />
                </span>
                <span style={{ flex: 1, paddingBottom: last ? 0 : 10 }}>
                  <Txt as="span" size={10} weight={700} upper ls={0.08} color={color.textMuted} style={{ display: 'block' }}>
                    {h.level}
                  </Txt>
                  <Txt as="span" size={last ? 17 : 14} weight={last ? 700 : 500} lh={1.3} style={{ display: 'block' }}>
                    {h.name}
                  </Txt>
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card style={{ padding: '6px 18px', borderRadius: 22 }}>
        {leader ? (
          <Info icon={User} title={leader.name} sub={leader.title} />
        ) : null}
        {c.structure.serviceSchedule ? <Info icon={Clock} title={`Culte : ${c.structure.serviceSchedule.replace(/^./, (x) => x.toLowerCase())}`} /> : null}
        {c.structure.address || c.structure.city ? <Info icon={MapPin} title={[c.structure.address, c.structure.city].filter(Boolean).join(', ')} /> : null}
        {c.structure.phone ? <Info icon={Phone} title={prettyPhone(c.structure.phone)} href={`tel:${c.structure.phone}`} /> : null}
        {!leader && !c.structure.serviceSchedule && !c.structure.address && !c.structure.phone ? <Info icon={MapPin} title={c.structure.name} sub="Coordonnées à compléter par la paroisse" /> : null}
      </Card>

      {badge ? (
        <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: badge.bg, color: badge.fg, fontSize: 13, fontWeight: 700 }}>{badge.label.replace('{niveau}', c.structure.level.toLowerCase())}</span>
      ) : null}
    </>
  )
}

function Info({ icon: I, title, sub, href }: { icon: Icon; title: string; sub?: string; href?: string }) {
  const body = (
    <>
      <I size={20} color={color.primary} aria-hidden style={{ flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <Txt as="span" size={14} weight={600} lh={1.35} style={{ display: 'block' }}>
          {title}
        </Txt>
        {sub ? (
          <Txt as="span" size={12} color={color.textMuted} style={{ display: 'block' }}>
            {sub}
          </Txt>
        ) : null}
      </span>
    </>
  )
  return href ? (
    <ListRow href={href} py={12}>
      {body}
    </ListRow>
  ) : (
    <ListRow py={12}>{body}</ListRow>
  )
}
