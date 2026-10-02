import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { env } from './config/env'
import { createApp } from './app.factory'

async function bootstrap() {
  const app = await createApp()
  await app.listen(env.PORT, env.HOST)
  new Logger('API').log(`À l'écoute sur http://${env.HOST}:${env.PORT}/api (${env.NODE_ENV}, paiements ${env.PAYMENT_MODE})`)
}

void bootstrap()
