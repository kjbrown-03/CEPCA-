'use client'

import { useEffect, useState } from 'react'
import { ArrowDown } from '@phosphor-icons/react'

const U = (id: string, w: number) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`

// Illustrations Unsplash de la maquette, à remplacer par les photos du CEPCA
const SLIDES = [
  { src: U('photo-1604072424771-7300bc5de457', 2000), credit: 'Danique Godwin' },
  { src: U('photo-1738744655193-706236bd4480', 2000), credit: 'Muhammad Asim' },
  { src: U('photo-1647957902647-0337913440fc', 2000), credit: 'Andile Mnothoza' },
  { src: U('photo-1608560938854-96a63d9214a8', 2000), credit: 'Vincent Lockhart' },
]

export function Hero() {
  const [i, setI] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // Pas de défilement automatique pour qui a demandé moins d'animations
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 6000)
    return () => clearInterval(t)
  }, [tick])

  return (
    <section id="top" className="hero-outer" aria-label="Accueil">
      <div className="hero">
        {SLIDES.map((s, k) => (
          <div key={s.src} className="slide" style={{ opacity: k === i ? 1 : 0 }} aria-hidden={k !== i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt="" loading={k === 0 ? 'eager' : 'lazy'} fetchPriority={k === 0 ? 'high' : 'low'} />
          </div>
        ))}
        <div className="shade" />
        <div className="copy">
          <span className="kicker">Conseil des Églises Protestantes du Cameroun</span>
          <h1>
            Des Églises diverses, <em>une même</em> maison.
          </h1>
          <p>Chaque confession membre garde son autonomie et son organisation. Le CEPCA offre un espace commun pour s’informer, se retrouver et agir ensemble.</p>
          <div className="row">
            <a href="/app" className="hero-link">
              L’application des fidèles
            </a>
            <a href="#eglises" className="hero-link">
              Les Églises membres
              <ArrowDown size={16} />
            </a>
            <div className="dots" role="group" aria-label="Photos">
              {SLIDES.map((s, k) => (
                <button
                  key={s.src}
                  type="button"
                  aria-label={`Photo ${k + 1} sur ${SLIDES.length}`}
                  aria-current={k === i}
                  onClick={() => {
                    setI(k)
                    setTick((t) => t + 1)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
