/**
 * Tests d'intégration de l'API contre une vraie base PostgreSQL.
 * Variables attendues :
 *   TEST_DATABASE_ADMIN_URL  rôle propriétaire (migrations)
 *   TEST_DATABASE_URL        rôle applicatif « conformite_app »
 * Sans elles, les tests sont ignorés.
 */
import * as OTPAuth from 'otpauth'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import type { Config } from '../src/config'
import { createPool, migrate, type Db } from '../src/db'
import { verifyHistory } from '../src/history'
import { hashPassword } from '../src/security'

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL
const APP_URL = process.env.TEST_DATABASE_URL
const ORIGIN = 'http://app.test'

const config: Config = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: APP_URL ?? '',
  databaseAdminUrl: ADMIN_URL ?? '',
  publicOrigin: ORIGIN,
  cookieSecure: false,
  sessionIdleMinutes: 60,
  sessionMaxHours: 8,
  uploadDir: `/tmp/conformite-test-uploads-${process.pid}`,
  maxUploadMb: 1,
  organizationName: 'Organisme de test',
  organizationSector: 'Tests',
  totpIssuer: 'Test',
  trustProxy: false,
  appSecret: 'x'.repeat(48),
}

let app: FastifyInstance
let db: Db
let admin: pg.Pool

/** Client HTTP minimal qui conserve le cookie de session. */
class Client {
  cookie = ''
  constructor(
    private readonly origin = ORIGIN,
    private readonly ip = '127.0.0.1',
  ) {}
  async req(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(method !== 'GET' ? { origin: this.origin } : {}), ...headers },
      ...(body !== undefined ? (typeof body === 'string' || Buffer.isBuffer(body) ? { payload: body } : { payload: body as object }) : {}),
    })
    const set = res.headers['set-cookie']
    const first = Array.isArray(set) ? set[0] : set
    if (first) this.cookie = first.split(';')[0] ?? ''
    return { status: res.statusCode, json: res.headers['content-type']?.includes('json') ? res.json() : null, raw: res }
  }
  action(name: string, ...args: unknown[]) {
    return this.req('POST', `/api/actions/${name}`, { args })
  }
}

const totpCode = (secret: string, offset = 0) =>
  new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate({
    timestamp: Date.now() + offset * 30_000,
  })

async function createUser(id: string, email: string, role: string, isAdmin = false, password = 'Mot-de-passe-initial-42') {
  await admin.query(
    `INSERT INTO users (id, email, name, initials, title, role, is_admin, password_hash, must_change_password) VALUES ($1, $2, $3, 'XX', '', $4, $5, $6, true)`,
    [id, email, `Utilisateur ${id}`, role, isAdmin, await hashPassword(password)],
  )
}

/** Parcours complet : mot de passe initial → nouveau mot de passe → enrôlement TOTP. */
async function onboard(email: string): Promise<{ client: Client; secret: string }> {
  const c = new Client()
  const login = await c.req('POST', '/api/auth/login', { email, password: 'Mot-de-passe-initial-42' })
  expect(login.json.stage).toBe('password_change')
  const pw = await c.req('POST', '/api/auth/password', { newPassword: 'Une phrase de passe solide 2026' })
  expect(pw.json.stage).toBe('totp_enroll')
  const setup = await c.req('GET', '/api/auth/totp/setup')
  expect(setup.json.qr).toMatch(/^data:image\/png;base64,/)
  const enroll = await c.req('POST', '/api/auth/totp/enroll', { code: totpCode(setup.json.secret) })
  expect(enroll.json.stage).toBe('full')
  return { client: c, secret: setup.json.secret }
}

const run = ADMIN_URL && APP_URL ? describe : describe.skip

run('API (PostgreSQL)', () => {
  let resp: Client
  let contrib: Client
  let adm: Client
  let respSecret = ''

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL })
    await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    await migrate(ADMIN_URL!)
    db = createPool(APP_URL!)
    app = await buildApp(db, config)
    await createUser('u_resp', 'rssi@test.fr', 'responsable')
    await createUser('u_contrib', 'admin.sys@test.fr', 'contributeur')
    await createUser('u_lect', 'auditeur@test.fr', 'lecteur')
    // Administrateur sans droit métier (séparation des tâches).
    await createUser('u_admin', 'admin@test.fr', 'lecteur', true)
    ;({ client: resp, secret: respSecret } = await onboard('rssi@test.fr'))
    ;({ client: contrib } = await onboard('admin.sys@test.fr'))
    ;({ client: adm } = await onboard('admin@test.fr'))
  })

  afterAll(async () => {
    await app?.close()
    await db?.end()
    await admin?.end()
  })

  it('refuse l’accès aux données sans session complète', async () => {
    const anon = new Client()
    expect((await anon.req('GET', '/api/state')).status).toBe(401)
    const partial = new Client()
    await partial.req('POST', '/api/auth/login', { email: 'auditeur@test.fr', password: 'Mot-de-passe-initial-42' })
    expect((await partial.req('GET', '/api/state')).status).toBe(401)
  })

  it('refuse un mot de passe trop court au changement initial', async () => {
    const c = new Client()
    await c.req('POST', '/api/auth/login', { email: 'auditeur@test.fr', password: 'Mot-de-passe-initial-42' })
    const res = await c.req('POST', '/api/auth/password', { newPassword: 'court' })
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/12 caractères/)
  })

  it('exige le TOTP à la connexion suivante et refuse le rejeu d’un code', async () => {
    const c = new Client()
    const login = await c.req('POST', '/api/auth/login', { email: 'rssi@test.fr', password: 'Une phrase de passe solide 2026' })
    expect(login.json.stage).toBe('totp')
    // Le code courant a déjà servi à l'enrôlement : il est refusé (rejeu).
    expect((await c.req('POST', '/api/auth/totp/verify', { code: totpCode(respSecret) })).status).toBe(400)
    const ok = await c.req('POST', '/api/auth/totp/verify', { code: totpCode(respSecret, 1) })
    expect(ok.json.stage).toBe('full')
  })

  it('bloque les requêtes d’une autre origine (CSRF)', async () => {
    const evil = new Client('https://evil.example')
    evil.cookie = resp.cookie
    const res = await evil.action('createGap', { title: 'x', controlIds: ['5.1'], criticality: 'haute', dueDate: '2027-01-01' })
    expect(res.status).toBe(403)
  })

  it('première installation : organisme, données de départ à confirmer, fin de l’assistant', async () => {
    const before = await adm.req('GET', '/api/state')
    expect(before.json.state.setupPending).toBe(true)
    expect(before.json.state.users.find((u: { id: string }) => u.id === 'u_admin').isAdmin).toBe(true)
    // Réservé à l'administrateur, même pour un responsable validant.
    expect((await resp.req('PUT', '/api/organization', { name: 'Pirate', sector: '' })).status).toBe(403)
    expect((await resp.req('POST', '/api/setup/starter', {})).status).toBe(403)

    expect((await adm.req('PUT', '/api/organization', { name: 'Régie des eaux', sector: 'Eau potable' })).status).toBe(200)
    const starter = await adm.req('POST', '/api/setup/starter', {})
    expect(starter.status).toBe(200)
    const gaps = starter.json.state.gaps as { id: string; toConfirm?: boolean; assignee: string }[]
    expect(gaps.length).toBe(starter.json.result)
    expect(gaps.every((g) => g.toConfirm && g.assignee === '')).toBe(true)
    // Base non vide : second chargement refusé.
    expect((await adm.req('POST', '/api/setup/starter', {})).status).toBe(400)

    // Un contributeur confirme une lacune de départ ; l'administrateur (lecteur) ne peut pas.
    expect((await adm.action('confirmGap', gaps[0]!.id)).status).toBe(400)
    const confirmed = await contrib.action('confirmGap', gaps[0]!.id)
    expect(confirmed.json.result.toConfirm).toBeUndefined()

    expect((await adm.req('POST', '/api/setup/complete', {})).status).toBe(200)
    const after = await resp.req('GET', '/api/state')
    expect(after.json.state.setupPending).toBeUndefined()
    expect(after.json.state.organization.name).toBe('Régie des eaux')
    const actions = after.json.state.history.map((h: { action: string }) => h.action)
    expect(actions).toEqual(expect.arrayContaining(['Organisme modifié', 'Confirmation', 'Installation terminée']))
  })

  let gapId = ''

  it('crée une lacune, une remédiation et une preuve, puis valide', async () => {
    const created = await contrib.action('createGap', {
      title: 'MFA absente sur le VPN',
      controlIds: ['8.5'],
      criticality: 'critique',
      dueDate: '2027-01-15',
    })
    expect(created.status).toBe(200)
    gapId = created.json.result.id
    const gapOf = (st: { gaps: { id: string; nis2Refs: string[]; status: string }[] }) => st.gaps.find((g) => g.id === gapId)!
    expect(gapOf(created.json.state).nis2Refs).toEqual(['21.2.i', '21.2.j'])

    const rem = await contrib.action('addRemediation', gapId, { title: 'Bastion MFA', type: 'outil', targetDate: '2026-12-31' })
    expect(rem.json.result.id).toBe('IMP-001')
    expect(gapOf(rem.json.state).status).toBe('en_cours')

    // Le contributeur ne peut pas valider.
    const denied = await contrib.action('changeGapStatus', gapId, 'validee', 'OK')
    expect(denied.status).toBe(400)

    // Le responsable non plus tant qu'aucune preuve n'est jointe.
    const noProof = await resp.action('changeGapStatus', gapId, 'validee', 'OK')
    expect(noProof.json.error).toMatch(/preuve/)

    // Envoi d'un fichier de preuve (multipart).
    const boundary = '----test'
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\ncapture\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="capture-mfa.png"\r\nContent-Type: image/png\r\n\r\nPNGDATA\r\n` +
        `--${boundary}--\r\n`,
    )
    const up = await contrib.req('POST', `/api/gaps/${gapId}/evidence`, payload, { 'content-type': `multipart/form-data; boundary=${boundary}` })
    expect(up.status).toBe(200)
    const ev = up.json.result
    expect(ev.fileKey).toMatch(/^f_/)
    expect(ev.type).toBe('capture')

    const file = await contrib.req('GET', `/api/evidence/${ev.id}/file`)
    expect(file.status).toBe(200)
    expect(file.raw.headers['content-disposition']).toMatch(/attachment/)
    expect(file.raw.body).toBe('PNGDATA')

    const validated = await resp.action('changeGapStatus', gapId, 'validee', 'Preuves vérifiées')
    expect(validated.status).toBe(200)
    expect(validated.json.result.validation.by).toBe('u_resp')
  })

  it('refuse les champs non autorisés (pas de contournement du statut)', async () => {
    const res = await contrib.action('updateGap', gapId, { title: 'Nouveau titre', status: 'non_traitee' })
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/Données invalides/)
  })

  it('un lecteur ne peut pas écrire', async () => {
    const c = new Client()
    await c.req('POST', '/api/auth/login', { email: 'auditeur@test.fr', password: 'Mot-de-passe-initial-42' })
    await c.req('POST', '/api/auth/password', { newPassword: 'Autre phrase de passe robuste' })
    const setup = await c.req('GET', '/api/auth/totp/setup')
    await c.req('POST', '/api/auth/totp/enroll', { code: totpCode(setup.json.secret) })
    const res = await c.action('duplicateGap', gapId)
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/rôle/)
  })

  it('gère les comptes (administrateur uniquement) et journalise', async () => {
    expect((await contrib.req('GET', '/api/users')).status).toBe(403)
    expect((await resp.req('GET', '/api/users')).status).toBe(403) // responsable non administrateur
    const created = await adm.req('POST', '/api/users', { email: 'dpo@test.fr', name: 'Déborah Po', role: 'contributeur' })
    expect(created.json.temporaryPassword).toHaveLength(18)
    const second = await adm.req('POST', '/api/users', { email: 'dsi@test.fr', name: 'Denis Si', role: 'responsable', isAdmin: true })
    expect(second.status).toBe(200)
    // Un administrateur ne modifie pas ses propres droits.
    expect((await adm.req('PATCH', '/api/users/u_admin', { role: 'responsable' })).status).toBe(400)
    expect((await adm.req('PATCH', '/api/users/u_admin', { isAdmin: false })).status).toBe(400)
    // Il attribue les rôles des autres.
    expect((await adm.req('PATCH', '/api/users/u_lect', { role: 'contributeur' })).status).toBe(200)
    expect((await adm.req('PATCH', `/api/users/${second.json.id}`, { isAdmin: false })).status).toBe(200)
    const list = await adm.req('GET', '/api/users')
    const dsi = list.json.users.find((u: { email: string }) => u.email === 'dsi@test.fr')
    expect(dsi.is_admin).toBe(false)
    const state = await adm.req('GET', '/api/state')
    const details = state.json.state.history.map((h: { details: string }) => h.details).join('\n')
    expect(details).toMatch(/Denis Si <dsi@test.fr>, rôle responsable \+ administrateur/)
    expect(details).toMatch(/administrateur retiré/)
  })

  it('verrouille le compte après 5 échecs', async () => {
    // Adresse IP dédiée : la limite de débit par IP ne doit pas masquer le verrouillage du compte.
    const c = new Client(ORIGIN, '10.0.0.99')
    for (let i = 0; i < 5; i++) await c.req('POST', '/api/auth/login', { email: 'dpo@test.fr', password: 'mauvais mot de passe' })
    const locked = await admin.query(`SELECT locked_until FROM users WHERE email = 'dpo@test.fr'`)
    expect(locked.rows[0].locked_until).not.toBeNull()
    const res = await c.req('POST', '/api/auth/login', { email: 'dpo@test.fr', password: 'mauvais mot de passe' })
    expect(res.status).toBe(423)
  })

  it('journal d’audit : ajout seul et altération détectée', async () => {
    expect((await verifyHistory(db)).ok).toBe(true)
    // Le rôle applicatif n'a pas le droit de modifier le journal…
    await expect(db.query(`UPDATE history SET details = 'x'`)).rejects.toThrow()
    // … le propriétaire non plus (trigger).
    await expect(admin.query(`DELETE FROM history`)).rejects.toThrow(/ajout seul/)
    // Même en désactivant le trigger, l'altération est détectée par le chaînage.
    await admin.query('ALTER TABLE history DISABLE TRIGGER history_no_update')
    await admin.query(`UPDATE history SET details = 'falsifié' WHERE seq = 2`)
    await admin.query('ALTER TABLE history ENABLE TRIGGER history_no_update')
    const report = await verifyHistory(db)
    expect(report.ok).toBe(false)
    expect(report.brokenAt?.seq).toBe(2)
  })
})
