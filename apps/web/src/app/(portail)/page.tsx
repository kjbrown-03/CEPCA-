import { Church, EnvelopeSimple, HandHeart, HandsPraying, MapPin, Phone } from '@phosphor-icons/react/dist/ssr'
import { publicGet, type PublicConfession, type PublicNews } from '@/lib/server-api'
import { Hero } from './_components/hero'
import { ChurchesAndNews } from './_components/churches-news'
import { ContactForm } from './_components/contact-form'

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`

export default async function Home() {
  const [confessions, news] = await Promise.all([publicGet<PublicConfession[]>('/confessions'), publicGet<{ items: PublicNews[] }>('/news?take=4')])
  return (
    <main>
      <Hero />

      <section className="wrap mission" aria-labelledby="mission-titre">
        <div className="photos">
          <div className="photo" style={{ height: 440, borderRadius: 200 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={U('photo-1647957902647-0337913440fc')} alt="" loading="lazy" />
          </div>
          <div className="photo" style={{ height: 340, borderRadius: 24, marginBottom: -48 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={U('photo-1738744655193-706236bd4480')} alt="" loading="lazy" />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span id="mission-titre" className="eyebrow-p">
            Notre raison d’être
          </span>
          <p className="statement">
            Relier les confessions, les paroisses et les fidèles, <em>au Cameroun comme dans la diaspora</em>, sans rien retirer à l’identité de chacun.
          </p>
          <div className="pillars">
            <div>
              <Church size={26} />
              <span className="t">S’informer</span>
              <span className="s">Actualités, communiqués et agenda des Églises membres.</span>
            </div>
            <div>
              <HandsPraying size={26} />
              <span className="t">Se retrouver</span>
              <span className="s">Cultes, prédications et activités, en présence ou à distance.</span>
            </div>
            <div>
              <HandHeart size={26} />
              <span className="t">Agir ensemble</span>
              <span className="s">Projets communs et actions sociales suivis en toute transparence.</span>
            </div>
          </div>
        </div>
      </section>

      <ChurchesAndNews confessions={confessions} news={news?.items ?? null} />

      <section id="contact" className="wrap contact" aria-labelledby="contact-titre">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h2 id="contact-titre" className="section-title">
            Nous <em>écrire</em>
          </h2>
          <p className="lead-p" style={{ maxWidth: 420 }}>
            Le secrétariat répond aux demandes d’information, aux Églises souhaitant adhérer et à la presse.
          </p>
          <div className="coords">
            <span>
              <MapPin size={22} />
              <span>
                Secrétariat général du CEPCA
                <br />
                <span style={{ color: 'var(--muted)' }}>Yaoundé, Cameroun</span>
              </span>
            </span>
            <span style={{ alignItems: 'center' }}>
              <EnvelopeSimple size={22} />
              contact@cepca.org
            </span>
            <span style={{ alignItems: 'center' }}>
              <Phone size={22} />
              +237 2 22 00 00 00
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Coordonnées à confirmer.</div>
        </div>
        <ContactForm />
      </section>
    </main>
  )
}
