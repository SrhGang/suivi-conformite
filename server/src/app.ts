import { createReadStream } from 'node:fs'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import { addEvidence, can } from '../../src/store/actions'
import type { ComplianceState, EvidenceTypeId, HistoryEntry, Role, User } from '../../src/types'
import { ACTIONS } from './actions'
import { registerAuth, requireFull } from './auth'
import type { Config } from './config'
import { WRITE_LOCK_KEY, withTx, type Db, type Tx } from './db'
import { appendHistory, verifyHistory } from './history'
import { hashPassword, initialsOf, newId, temporaryPassword } from './security'
import { ensureOrganization, loadState, persistChanges } from './state'

const EVIDENCE_TYPES: EvidenceTypeId[] = ['capture', 'certificat', 'rapport', 'procedure', 'journal', 'autre']

/** Ajoute au journal d'audit un évènement hors action métier (gestion des comptes). */
async function logEvent(tx: Tx, userId: string, action: string, details: string): Promise<void> {
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
    `INSERT INTO app_meta (key, value) VALUES ('counters', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(counters)],
  )
}

export async function buildApp(db: Db, config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
  })

  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1, fields: 5 } })
  await ensureOrganization(db, { name: config.organizationName, sector: config.organizationSector })
  await mkdir(config.uploadDir, { recursive: true })

  // Protection CSRF : en plus du cookie SameSite=Strict, toute requête qui
  // modifie des données doit venir de l'origine publique de l'application.
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const origin = req.headers.origin
    if (origin !== config.publicOrigin) {
      req.log.warn({ origin }, 'origine refusée')
      return reply.code(403).send({ ok: false, error: 'Origine de la requête non autorisée.' })
    }
  })

  // Les réponses de l'API ne doivent jamais être mises en cache.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store')
  })

  registerAuth(app, db, config)

  app.get('/api/health', async () => {
    await db.query('SELECT 1')
    return { ok: true }
  })

  /* -------------------------------------------------------------- */
  /* État et actions métier                                         */
  /* -------------------------------------------------------------- */

  app.get('/api/state', async (req, reply) => {
    const auth = requireFull(req, reply)
    if (!auth) return
    return { ok: true, state: await loadState(db, auth.id) }
  })

  /** Exécute une action métier sous verrou et enregistre ses effets. */
  const runAction = async (
    userId: string,
    run: (state: ComplianceState, user: User) => ReturnType<(typeof ACTIONS)[string]>,
    fileMeta?: { evidenceName: string; fileKey: string; mimeType: string },
  ) =>
    withTx(db, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
      const before = await loadState(tx, userId)
      const user = before.users.find((u) => u.id === userId)
      if (!user) return { status: 401, body: { ok: false as const, error: 'Utilisateur inconnu.' } }
      const out = run(before, user)
      if (!out.ok) return { status: 400, body: { ok: false as const, error: out.error, errors: out.errors, blockers: out.blockers } }
      await persistChanges(tx, before, out.state, fileMeta)
      return { status: 200, body: { ok: true as const, result: out.result, state: out.state } }
    })

  app.post<{ Params: { name: string } }>('/api/actions/:name', async (req, reply) => {
    const auth = requireFull(req, reply)
    if (!auth) return
    const handler = Object.hasOwn(ACTIONS, req.params.name) ? ACTIONS[req.params.name] : undefined
    if (!handler) return reply.code(404).send({ ok: false, error: 'Action inconnue.' })
    const body = z.object({ args: z.array(z.unknown()).max(5) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Requête invalide.' })
    const res = await runAction(auth.id, (state, user) => handler(state, user, body.data.args))
    return reply.code(res.status).send(res.body)
  })

  /* -------------------------------------------------------------- */
  /* Preuves : envoi et téléchargement de fichiers                  */
  /* -------------------------------------------------------------- */

  app.post<{ Params: { gapId: string } }>('/api/gaps/:gapId/evidence', async (req, reply) => {
    const auth = requireFull(req, reply)
    if (!auth) return
    if (!can({ role: auth.role } as User, 'edit')) return reply.code(403).send({ ok: false, error: 'Votre rôle ne permet pas d’ajouter une preuve.' })
    const file = await req.file()
    if (!file) return reply.code(400).send({ ok: false, error: 'Aucun fichier reçu.' })
    const buffer = await file.toBuffer().catch(() => null)
    if (!buffer || file.file.truncated)
      return reply.code(413).send({ ok: false, error: `Fichier trop volumineux (${config.maxUploadMb} Mo maximum).` })
    const typeField = file.fields.type
    const rawType = typeField && 'value' in typeField ? String(typeField.value) : 'autre'
    const type = EVIDENCE_TYPES.includes(rawType as EvidenceTypeId) ? (rawType as EvidenceTypeId) : 'autre'
    const name = file.filename.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'preuve'
    const fileKey = newId('f')
    const path = join(config.uploadDir, fileKey)
    await writeFile(path, buffer, { flag: 'wx', mode: 0o600 })
    const input = { name, type, size: buffer.length, fileKey }
    const res = await runAction(auth.id, (state, user) => addEvidence(state, user, req.params.gapId, input), {
      evidenceName: name,
      fileKey,
      mimeType: file.mimetype,
    }).catch(async (e) => {
      await unlink(path).catch(() => {})
      throw e
    })
    if (!res.body.ok) await unlink(path).catch(() => {})
    return reply.code(res.status).send(res.body)
  })

  app.get<{ Params: { id: string } }>('/api/evidence/:id/file', async (req, reply) => {
    const auth = requireFull(req, reply)
    if (!auth) return
    const row = (
      await db.query<{ file_key: string | null; data: { name: string } }>('SELECT file_key, data FROM evidence WHERE id = $1', [req.params.id])
    ).rows[0]
    if (!row?.file_key) return reply.code(404).send({ ok: false, error: 'Fichier introuvable.' })
    const path = join(config.uploadDir, row.file_key)
    const info = await stat(path).catch(() => null)
    if (!info) return reply.code(404).send({ ok: false, error: 'Fichier introuvable.' })
    // Toujours en téléchargement, jamais interprété par le navigateur.
    const safeName = encodeURIComponent(row.data.name)
    reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename*=UTF-8''${safeName}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Length', String(info.size))
    return reply.send(createReadStream(path))
  })

  /* -------------------------------------------------------------- */
  /* Gestion des utilisateurs (responsable validant)                */
  /* -------------------------------------------------------------- */

  const roleSchema = z.enum(['responsable', 'contributeur', 'lecteur'])

  app.get('/api/users', async (req, reply) => {
    if (!requireFull(req, reply, ['responsable'])) return
    const { rows } = await db.query(
      `SELECT id, email, name, initials, title, role, disabled, totp_enabled, must_change_password, last_login_at, created_at,
              (locked_until IS NOT NULL AND locked_until > now()) AS locked
       FROM users ORDER BY name`,
    )
    return { ok: true, users: rows }
  })

  app.post('/api/users', async (req, reply) => {
    const auth = requireFull(req, reply, ['responsable'])
    if (!auth) return
    const body = z
      .object({ email: z.string().email().max(200), name: z.string().min(2).max(120), title: z.string().max(120).default(''), role: roleSchema })
      .strict()
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Données invalides (e-mail, nom et rôle obligatoires).' })
    const { email, name, title, role } = body.data
    const temp = temporaryPassword()
    const id = newId('usr')
    try {
      await withTx(db, async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
        await tx.query(
          `INSERT INTO users (id, email, name, initials, title, role, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [id, email, name, initialsOf(name), title, role, await hashPassword(temp)],
        )
        await logEvent(tx, auth.id, 'Compte créé', `${name} <${email}> — rôle ${role}`)
      })
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return reply.code(409).send({ ok: false, error: 'Un compte existe déjà pour cet e-mail.' })
      throw e
    }
    return { ok: true, id, temporaryPassword: temp }
  })

  /** Vérifie qu'il restera au moins un responsable actif. */
  const lastResponsable = async (tx: Tx, excludingId: string) =>
    Number(
      (await tx.query<{ n: string }>(`SELECT count(*) AS n FROM users WHERE role = 'responsable' AND NOT disabled AND id <> $1`, [excludingId])).rows[0]
        ?.n ?? 0,
    ) === 0

  app.patch<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const auth = requireFull(req, reply, ['responsable'])
    if (!auth) return
    const body = z
      .object({ name: z.string().min(2).max(120).optional(), title: z.string().max(120).optional(), role: roleSchema.optional(), disabled: z.boolean().optional() })
      .strict()
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Données invalides.' })
    const changes = body.data
    const res = await withTx(db, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
      const target = (await tx.query<{ id: string; name: string; role: Role; disabled: boolean }>('SELECT id, name, role, disabled FROM users WHERE id = $1', [req.params.id]))
        .rows[0]
      if (!target) return { status: 404, error: 'Compte introuvable.' }
      const demoting = (changes.role && changes.role !== 'responsable') || changes.disabled === true
      if (target.role === 'responsable' && demoting && (await lastResponsable(tx, target.id)))
        return { status: 400, error: 'Il doit rester au moins un responsable validant actif.' }
      if (target.id === auth.id && changes.disabled) return { status: 400, error: 'Vous ne pouvez pas désactiver votre propre compte.' }
      const name = changes.name ?? target.name
      await tx.query(
        `UPDATE users SET name = $2, initials = $3, title = COALESCE($4, title), role = COALESCE($5, role), disabled = COALESCE($6, disabled) WHERE id = $1`,
        [target.id, name, initialsOf(name), changes.title ?? null, changes.role ?? null, changes.disabled ?? null],
      )
      if (changes.disabled) await tx.query('DELETE FROM sessions WHERE user_id = $1', [target.id])
      const parts = [
        changes.role && changes.role !== target.role ? `rôle ${target.role} → ${changes.role}` : '',
        changes.disabled === true ? 'compte désactivé' : changes.disabled === false && target.disabled ? 'compte réactivé' : '',
        changes.name && changes.name !== target.name ? `nom : ${changes.name}` : '',
      ].filter(Boolean)
      if (parts.length) await logEvent(tx, auth.id, 'Compte modifié', `${target.name} — ${parts.join(' ; ')}`)
      return { status: 200 }
    })
    if (res.status !== 200) return reply.code(res.status).send({ ok: false, error: res.error })
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/api/users/:id/reset', async (req, reply) => {
    const auth = requireFull(req, reply, ['responsable'])
    if (!auth) return
    const temp = temporaryPassword()
    const res = await withTx(db, async (tx) => {
      const target = (await tx.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [req.params.id])).rows[0]
      if (!target) return false
      await tx.query(
        `UPDATE users SET password_hash = $2, must_change_password = true, totp_secret = NULL, totp_enabled = false, totp_last_step = NULL,
                failed_attempts = 0, locked_until = NULL WHERE id = $1`,
        [req.params.id, await hashPassword(temp)],
      )
      await tx.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id])
      await logEvent(tx, auth.id, 'Accès réinitialisé', `${target.name} — nouveau mot de passe temporaire et MFA à réenrôler`)
      return true
    })
    if (!res) return reply.code(404).send({ ok: false, error: 'Compte introuvable.' })
    return { ok: true, temporaryPassword: temp }
  })

  /** Intégrité du journal d'audit (responsable ou lecteur/auditeur). */
  app.get('/api/audit/verify', async (req, reply) => {
    if (!requireFull(req, reply, ['responsable', 'lecteur'])) return
    return { ok: true, report: await verifyHistory(db) }
  })

  return app
}
