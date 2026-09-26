import { buildApp } from './app'
import { loadConfig } from './config'
import { createPool, migrate } from './db'

const config = loadConfig()

// Les migrations sont appliquées avec le rôle propriétaire, puis l'API
// fonctionne avec le rôle applicatif aux droits restreints.
const applied = await migrate(config.databaseAdminUrl)
const db = createPool(config.databaseUrl)
const app = await buildApp(db, config)
if (applied.length) app.log.info({ applied }, 'migrations appliquées')

const shutdown = async () => {
  await app.close()
  await db.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

await app.listen({ port: config.port, host: config.host })
