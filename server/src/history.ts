/**
 * Journal d'audit chaîné : chaque entrée porte le condensé SHA-256 de la
 * précédente. Toute modification ou suppression d'une ligne passée casse la
 * chaîne et est détectée par `verifyHistory`.
 */
import { createHash } from 'node:crypto'
import type { ComplianceState, HistoryEntry } from '../../src/types'
import type { Db, Tx } from './db'

export const GENESIS_HASH = '0'.repeat(64)

/** Contenu canonique d'une entrée (ordre des champs fixe). */
const canonical = (e: HistoryEntry) =>
  JSON.stringify([e.id, e.gapId ?? null, new Date(e.date).toISOString(), e.userId, e.action, e.details])

export const entryHash = (prevHash: string, e: HistoryEntry): string =>
  createHash('sha256').update(prevHash).update('\n').update(canonical(e)).digest('hex')

/** Ajoute des entrées à la fin du journal (à appeler sous le verrou d'écriture). */
export async function appendHistory(tx: Tx, entries: HistoryEntry[]): Promise<void> {
  if (!entries.length) return
  const last = await tx.query<{ hash: string }>('SELECT hash FROM history ORDER BY seq DESC LIMIT 1')
  let prev = last.rows[0]?.hash ?? GENESIS_HASH
  for (const e of entries) {
    const hash = entryHash(prev, e)
    await tx.query(
      `INSERT INTO history (id, gap_id, date, user_id, action, details, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [e.id, e.gapId, e.date, e.userId, e.action, e.details, prev, hash],
    )
    prev = hash
  }
}

interface HistoryRow {
  seq: string
  id: string
  gap_id: string | null
  date: Date
  user_id: string
  action: string
  details: string
  prev_hash: string
  hash: string
}

export const rowToEntry = (r: Pick<HistoryRow, 'id' | 'gap_id' | 'date' | 'user_id' | 'action' | 'details'>): HistoryEntry => ({
  id: r.id,
  gapId: r.gap_id,
  date: new Date(r.date).toISOString(),
  userId: r.user_id,
  action: r.action,
  details: r.details,
})

export interface VerifyReport {
  ok: boolean
  count: number
  /** Première entrée dont le chaînage est rompu. */
  brokenAt?: { seq: number; id: string; reason: string }
}

export async function verifyHistory(db: Db): Promise<VerifyReport> {
  const { rows } = await db.query<HistoryRow>('SELECT * FROM history ORDER BY seq')
  let prev = GENESIS_HASH
  for (const r of rows) {
    if (r.prev_hash !== prev)
      return { ok: false, count: rows.length, brokenAt: { seq: Number(r.seq), id: r.id, reason: 'prev_hash ne correspond pas à l’entrée précédente' } }
    const expected = entryHash(prev, rowToEntry(r))
    if (r.hash !== expected)
      return { ok: false, count: rows.length, brokenAt: { seq: Number(r.seq), id: r.id, reason: 'contenu modifié (condensé invalide)' } }
    prev = r.hash
  }
  return { ok: true, count: rows.length }
}

/** Ajoute au journal d'audit un évènement hors action métier (gestion des comptes). */
export async function logEvent(tx: Tx, userId: string, action: string, details: string): Promise<void> {
  const meta = await tx.query<{ value: ComplianceState['counters'] }>(`SELECT value FROM app_meta WHERE key = 'counters'`)
  const counters: ComplianceState['counters'] = Object.assign({ gap: 0, remediation: 0, evidence: 0, history: 0, review: 0 }, meta.rows[0]?.value)
  counters.history += 1
  const entry: HistoryEntry = {
    id: `H-${String(counters.history).padStart(4, '0')}`,
    gapId: null,
    date: new Date().toISOString(),
    userId,
    action,
    details,
  }
  await appendHistory(tx, [entry])
  await tx.query(
    `INSERT INTO app_meta (key, value) VALUES ('counters', $1::jsonb), ('lastUpdated', $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(counters), JSON.stringify(entry.date)],
  )
}
