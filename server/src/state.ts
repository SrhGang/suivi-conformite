/**
 * Chargement de l'état métier depuis PostgreSQL et enregistrement des
 * changements produits par une action métier (comparaison avant / après).
 */
import type {
  ComplianceState,
  Counters,
  Evidence,
  Gap,
  HistoryEntry,
  Milestone,
  Organization,
  Remediation,
  Role,
  User,
} from '../../src/types'
import type { Db, Tx } from './db'
import { appendHistory, rowToEntry } from './history'

type Queryable = Db | Tx

const DEFAULT_COUNTERS: Counters = { gap: 0, remediation: 0, evidence: 0, history: 0, review: 0 }

async function getMeta<T>(q: Queryable, key: string, fallback: T): Promise<T> {
  const r = await q.query<{ value: T }>('SELECT value FROM app_meta WHERE key = $1', [key])
  return r.rows[0]?.value ?? fallback
}

async function setMeta(q: Queryable, key: string, value: unknown): Promise<void> {
  await q.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  )
}

export async function ensureOrganization(q: Queryable, org: Organization): Promise<void> {
  await q.query(`INSERT INTO app_meta (key, value) VALUES ('organization', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [
    JSON.stringify(org),
  ])
}

export interface UserRow {
  id: string
  email: string
  name: string
  initials: string
  title: string
  role: Role
  disabled: boolean
}

export const toPublicUser = (u: UserRow): User => ({ id: u.id, name: u.name, initials: u.initials, title: u.title, role: u.role })

/** État complet vu par l'utilisateur `currentUserId`. */
export async function loadState(q: Queryable, currentUserId: string): Promise<ComplianceState> {
  // Requêtes séquentielles : une transaction n'accepte qu'une requête à la fois.
  const users = await q.query<UserRow>('SELECT id, email, name, initials, title, role, disabled FROM users ORDER BY name')
  const gaps = await q.query<{ data: Gap }>('SELECT data FROM gaps ORDER BY id')
  const remediations = await q.query<{ data: Remediation }>('SELECT data FROM remediations ORDER BY id')
  const evidence = await q.query<{ data: Evidence }>('SELECT data FROM evidence WHERE removed_at IS NULL ORDER BY id')
  const history = await q.query('SELECT id, gap_id, date, user_id, action, details FROM history ORDER BY seq')
  const organization = await getMeta<Organization>(q, 'organization', { name: 'Mon organisme', sector: '' })
  const counters = await getMeta<Counters>(q, 'counters', DEFAULT_COUNTERS)
  const milestones = await getMeta<Milestone[]>(q, 'milestones', [])
  const lastUpdated = await getMeta<string>(q, 'lastUpdated', new Date(0).toISOString())
  return {
    version: 1,
    organization,
    users: users.rows.map(toPublicUser),
    currentUserId,
    gaps: gaps.rows.map((r) => r.data),
    remediations: remediations.rows.map((r) => r.data),
    evidence: evidence.rows.map((r) => r.data),
    history: history.rows.map(rowToEntry),
    milestones,
    counters: { ...DEFAULT_COUNTERS, ...counters },
    lastUpdated,
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function diffById<T extends { id: string }>(before: T[], after: T[]) {
  const prev = new Map(before.map((x) => [x.id, x]))
  const next = new Map(after.map((x) => [x.id, x]))
  const upserted = after.filter((x) => !same(prev.get(x.id), x))
  const removed = before.filter((x) => !next.has(x.id))
  return { upserted, removed }
}

/**
 * Enregistre la différence entre deux états (à appeler sous le verrou
 * d'écriture). `fileMeta` associe une preuve nouvellement créée au fichier
 * stocké (clé et type MIME).
 */
export async function persistChanges(
  tx: Tx,
  before: ComplianceState,
  after: ComplianceState,
  fileMeta?: { evidenceName: string; fileKey: string; mimeType: string },
): Promise<void> {
  const gaps = diffById(before.gaps, after.gaps)
  for (const g of gaps.upserted) {
    await tx.query(
      `INSERT INTO gaps (id, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [g.id, JSON.stringify(g)],
    )
  }
  if (gaps.removed.length) throw new Error('Suppression de lacune interdite (archivage uniquement).')

  const rems = diffById(before.remediations, after.remediations)
  for (const r of rems.upserted) {
    await tx.query(
      `INSERT INTO remediations (id, gap_id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [r.id, r.gapId, JSON.stringify(r)],
    )
  }
  for (const r of rems.removed) await tx.query('DELETE FROM remediations WHERE id = $1', [r.id])

  const evs = diffById(before.evidence, after.evidence)
  for (const e of evs.upserted) {
    const withFile = fileMeta && e.fileKey === fileMeta.fileKey
    await tx.query(
      `INSERT INTO evidence (id, gap_id, data, file_key, mime_type, updated_at) VALUES ($1, $2, $3::jsonb, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [e.id, e.gapId, JSON.stringify(e), withFile ? fileMeta.fileKey : null, withFile ? fileMeta.mimeType : null],
    )
  }
  // Retrait logique : la preuve et son fichier restent disponibles pour l'audit.
  for (const e of evs.removed) await tx.query('UPDATE evidence SET removed_at = now(), updated_at = now() WHERE id = $1', [e.id])

  const known = new Set(before.history.map((h) => h.id))
  const added: HistoryEntry[] = after.history.filter((h) => !known.has(h.id))
  await appendHistory(tx, added)

  if (!same(before.counters, after.counters)) await setMeta(tx, 'counters', after.counters)
  if (!same(before.milestones, after.milestones)) await setMeta(tx, 'milestones', after.milestones)
  if (!same(before.organization, after.organization)) await setMeta(tx, 'organization', after.organization)
  if (before.lastUpdated !== after.lastUpdated) await setMeta(tx, 'lastUpdated', after.lastUpdated)
}
