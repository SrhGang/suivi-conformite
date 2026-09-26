import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export type Db = pg.Pool
export type Tx = pg.PoolClient

export const createPool = (connectionString: string): Db =>
  new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 })

/** Exécute `fn` dans une transaction (COMMIT si succès, ROLLBACK sinon). */
export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Clé du verrou consultatif qui sérialise les écritures métier. */
export const WRITE_LOCK_KEY = 27001

const defaultMigrationsDir = () => {
  // En développement : server/src/../migrations ; une fois compilé : server/dist/../migrations.
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', 'migrations')
}

/** Applique les migrations SQL non encore passées (ordre alphabétique des fichiers). */
export async function migrate(adminUrl: string, dir = process.env.MIGRATIONS_DIR || defaultMigrationsDir()): Promise<string[]> {
  const pool = createPool(adminUrl)
  try {
    return await withTx(pool, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY + 1])
      await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
      const done = new Set((await tx.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
      const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
      const applied: string[] = []
      for (const f of files) {
        if (done.has(f)) continue
        await tx.query(await readFile(join(dir, f), 'utf8'))
        await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
        applied.push(f)
      }
      return applied
    })
  } finally {
    await pool.end()
  }
}
