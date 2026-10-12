'use client'

import { useState } from 'react'
import { Moon, Sun } from '@phosphor-icons/react'

/** Bascule clair / sombre du portail ; le choix est gardé un an dans un cookie lu au rendu serveur. */
export function ThemeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [dark, setDark] = useState(initial === 'dark')
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = !dark
    setDark(next)
    const root = e.currentTarget.closest<HTMLElement>('.portal')
    if (root) root.dataset.theme = next ? 'dark' : 'light'
    document.cookie = `cepca_theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`
  }
  return (
    <button type="button" className="p-round" onClick={toggle} aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'} aria-pressed={dark}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
