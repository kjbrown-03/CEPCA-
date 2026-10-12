import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { z } from 'zod'

// apps/api/.env (et .env.test en test). Les variables déjà définies (Docker, CI) ne sont jamais écrasées.
// Affectation explicite plutôt que process.loadEnvFile, qui n'atteint pas le process.env isolé de Jest.
for (const f of process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env']) {
  let vars: Record<string, string | undefined>
  try {
    vars = parseEnv(readFileSync(resolve(__dirname, '../..', f), 'utf8'))
  } catch {
    continue // fichier absent : la configuration vient de l'environnement
  }
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined && v !== undefined) process.env[k] = v
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  OTP_PEPPER: z.string().min(16),
  TRUST_PROXY: z.string().default('false'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
  S3_ENDPOINT: z.string().default('http://127.0.0.1:9100'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('cepca-media'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  // simulator : paiements simulés en local, sans réseau. fapshi : MTN MoMo et Orange Money via Fapshi.
  PAYMENT_PROVIDER: z.enum(['simulator', 'fapshi']).default('simulator'),
  SANDBOX_CONFIRM_DELAY_MS: z.coerce.number().int().default(2500),
  FAPSHI_BASE_URL: z.string().default('https://sandbox.fapshi.com'),
  FAPSHI_API_USER: z.string().default(''),
  FAPSHI_API_KEY: z.string().default(''),
  FAPSHI_WEBHOOK_SECRET: z.string().default(''),
  // console : e-mails affichés dans le terminal ; smtp : envoi réel par nodemailer
  MAIL_MODE: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('CEPCA <no-reply@cepca.org>'),
  // 1 : notifications push envoyées par Expo Push ; sinon affichées dans le terminal
  EXPO_PUSH: z.enum(['0', '1']).default('0'),
  // Notifications push de l'application web (PWA). Clés : npx web-push generate-vapid-keys. Vides : envoi simulé.
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:contact@cepca.org'),
})

export type Env = z.infer<typeof schema> & { trustProxy: boolean | string }

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    // Refuser de démarrer plutôt que de tourner avec une configuration incomplète.
    console.error('Configuration invalide :', z.prettifyError(parsed.error))
    process.exit(1)
  }
  const e = parsed.data
  if (e.NODE_ENV === 'production') {
    const weak: string[] = []
    if (e.JWT_ACCESS_SECRET.length < 32 || /change-me/.test(e.JWT_ACCESS_SECRET)) weak.push('JWT_ACCESS_SECRET')
    if (e.OTP_PEPPER.length < 32 || /change-me/.test(e.OTP_PEPPER)) weak.push('OTP_PEPPER')
    if (e.JWT_ACCESS_SECRET === e.OTP_PEPPER) weak.push('JWT_ACCESS_SECRET = OTP_PEPPER')
    if (e.PAYMENT_PROVIDER !== 'fapshi') weak.push('PAYMENT_PROVIDER=simulator en production')
    if (/sandbox/.test(e.FAPSHI_BASE_URL) || /^FAK_TEST/.test(e.FAPSHI_API_KEY)) weak.push('Fapshi en bac à sable')
    if (e.FAPSHI_WEBHOOK_SECRET.length < 16) weak.push('FAPSHI_WEBHOOK_SECRET')
    if (e.MAIL_MODE !== 'smtp') weak.push('MAIL_MODE=console en production (aucun e-mail ne partirait)')
    if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) weak.push('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (notifications push de l’application)')
    if (weak.length) {
      console.error('Refus de démarrer en production — secrets absents, faibles ou mode bac à sable :', weak.join(', '))
      process.exit(1)
    }
  }
  if (e.PAYMENT_PROVIDER === 'fapshi' && (!e.FAPSHI_API_USER || !e.FAPSHI_API_KEY)) {
    console.error('PAYMENT_PROVIDER=fapshi : FAPSHI_API_USER et FAPSHI_API_KEY sont obligatoires.')
    process.exit(1)
  }
  if (e.MAIL_MODE === 'smtp' && !e.SMTP_HOST) {
    console.error('MAIL_MODE=smtp : SMTP_HOST est obligatoire.')
    process.exit(1)
  }
  // false en dev (IP de la socket), 'loopback' en production derrière nginx. Jamais une constante en dur.
  const trustProxy = e.TRUST_PROXY === 'false' ? false : e.TRUST_PROXY === 'true' ? true : e.TRUST_PROXY
  return { ...e, trustProxy }
}

export const env = load()
