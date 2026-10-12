'use client'

import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeSlash } from '@phosphor-icons/react'

/** Champ mot de passe avec bouton œil pour afficher ou masquer la saisie. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="password">
      <input {...props} className="input" type={shown ? 'text' : 'password'} />
      <button type="button" aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
        {shown ? <EyeSlash size={20} /> : <Eye size={20} />}
      </button>
    </div>
  )
}
