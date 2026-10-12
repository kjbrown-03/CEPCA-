import { NestFactory } from '@nestjs/core'
import type { LogLevel } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { env } from './config/env'
import { AppModule } from './app.module'

/** Configuration HTTP commune au serveur et aux tests d'intégration (l'application doit être créée avec bodyParser: false). */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  // false en dev, 'loopback' derrière nginx : req.ip est alors l'IP réelle transmise par le proxy
  app.set('trust proxy', env.trustProxy)
  app.disable('x-powered-by')
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))
  app.useBodyParser('json', { limit: '200kb' })
  app.useBodyParser('urlencoded', { extended: false, limit: '50kb' })
  app.use(cookieParser())
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true })
  app.setGlobalPrefix('api')
  app.enableShutdownHooks()
  return app
}

export async function createApp(): Promise<NestExpressApplication> {
  const logger: LogLevel[] = env.NODE_ENV === 'production' ? ['warn', 'error'] : ['log', 'warn', 'error']
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false })
  return configureApp(app)
}
