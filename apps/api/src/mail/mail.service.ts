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
    await this.smtp().sendMail({ from: env.MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text })
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
