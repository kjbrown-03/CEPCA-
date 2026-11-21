import { Injectable, Logger } from '@nestjs/common'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '../config/env'

export interface Mail {
  to: string
  subject: string
  text: string
}

/**
 * Envoi d'e-mails (codes de connexion, nominations, notifications). Aucun SMS : l'e-mail ne coûte rien.
 * MAIL_MODE=console : le message s'affiche dans le terminal de l'API (développement, tests).
 * MAIL_MODE=smtp : envoi réel par nodemailer (Gmail avec mot de passe d'application, Brevo, serveur de l'hébergeur…).
 * MAIL_MODE=brevo : envoi par l'API HTTPS de Brevo, quand l'hébergeur bloque les ports SMTP (Render gratuit).
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('E-mail')
  private transport: Transporter | null = null

  private smtp(): Transporter {
    this.transport ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
    return this.transport
  }

  async send(mail: Mail) {
    if (env.MAIL_MODE === 'console') {
      this.log.log(`→ ${mail.to} · ${mail.subject}\n${mail.text}`)
      return
    }
    if (env.MAIL_MODE === 'brevo') return this.brevo(mail)
    await this.smtp().sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text })
  }

  private async brevo(mail: Mail) {
    // MAIL_FROM « Nom <adresse> » : Brevo veut les deux champs séparés, et l'adresse doit être un expéditeur vérifié chez Brevo.
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(env.MAIL_FROM)
    const sender = m ? { name: m[1] || undefined, email: m[2] } : { email: env.MAIL_FROM.trim() }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`Brevo ${res.status} : ${(await res.text()).slice(0, 300)}`)
  }

  /** Message d'accompagnement (nomination, notification) : un échec est journalisé sans faire échouer l'action. */
  async trySend(mail: Mail): Promise<boolean> {
    try {
      await this.send(mail)
      return true
    } catch (e) {
      this.log.warn(`Non remis à ${mail.to} : ${(e as Error).message}`)
      return false
    }
  }
}
