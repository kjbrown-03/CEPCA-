/**
 * Vérifie la configuration d'envoi des e-mails (nodemailer + SMTP de apps/api/.env).
 *   npm run mail:test -- vous@exemple.com
 * Le mot de passe SMTP n'est jamais affiché.
 */
import nodemailer from 'nodemailer'
import { env } from '../src/config/env'

async function main() {
  const to = process.argv[2]
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    console.error('Indiquez l’adresse de destination : npm run mail:test -- vous@exemple.com')
    process.exit(1)
  }
  if (env.MAIL_MODE !== 'smtp') {
    console.error('MAIL_MODE=console dans apps/api/.env : les e-mails ne partent pas, ils s’affichent dans le terminal de l’API.')
    console.error('Renseignez MAIL_MODE=smtp, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM, puis relancez cette commande.')
    process.exit(1)
  }
  console.log(`Serveur : ${env.SMTP_HOST}:${env.SMTP_PORT} · compte : ${env.SMTP_USER || '(aucun)'} · expéditeur : ${env.MAIL_FROM}`)
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })
  try {
    await transport.verify()
    console.log('Connexion au serveur et identifiants : OK')
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to,
      subject: 'CEPCA · E-mail de test',
      text: 'Bonjour,\n\nSi vous lisez ce message, l’envoi des e-mails de CEPCA fonctionne : les codes de connexion arriveront dans cette boîte.\n\nL’équipe CEPCA',
    })
    console.log(`E-mail envoyé à ${to} (identifiant ${info.messageId}). Regardez aussi dans les courriers indésirables.`)
  } catch (e) {
    const err = e as { code?: string; responseCode?: number; message: string }
    console.error(`Échec : ${err.message}`)
    if (err.code === 'EAUTH' || err.responseCode === 535) {
      console.error('Identifiants refusés. Avec Gmail : SMTP_PASS doit être un « mot de passe d’application » (16 lettres, sans espaces), pas le mot de passe du compte, et la validation en deux étapes doit être activée.')
    } else if (err.code === 'ESOCKET' || err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
      console.error('Serveur injoignable. Vérifiez SMTP_HOST et SMTP_PORT (Gmail : smtp.gmail.com et 465), et qu’un VPN ou un pare-feu ne bloque pas la connexion.')
    }
    process.exit(1)
  }
}

void main()
