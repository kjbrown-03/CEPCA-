import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

/**
 * Applique les migrations à la base de test, sans rien effacer. Les specs n'ont pas besoin d'une base vide :
 * chacune construit sa propre confession (buildWorld) avec des numéros uniques.
 */
export default function globalSetup() {
  const root = resolve(__dirname, '..')
  process.loadEnvFile(resolve(root, '.env.test'))
  const url = process.env.DATABASE_URL ?? ''
  if (!/_test\b/.test(url)) throw new Error(`Refus : DATABASE_URL de test sans suffixe _test (${url})`)
  execSync('npx prisma migrate deploy', { cwd: root, stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } })
}
