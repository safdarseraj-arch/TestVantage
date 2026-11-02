import { migrate, pingPostgres, closePostgres } from '../server/db/pg.js'

const ok = await migrate()
if (!ok) {
  console.error('Set DATABASE_URL or TESTVANTAGE_DATABASE_URL to run migrations.')
  process.exit(1)
}
const ping = await pingPostgres()
await closePostgres()
if (!ping) {
  console.error('PostgreSQL migration ran but ping failed.')
  process.exit(1)
}
console.log('db-migrate: schema applied OK')
