/**
 * Authentification : comptes locaux, mot de passe initial à changer, TOTP
 * obligatoire, sessions côté serveur.
 *
 * Parcours d'une session :
 *   login → [password_change] → [totp_enroll | totp] → full
 * Seules les sessions « full » accèdent aux données.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import QRCode from 'qrcode'
import { z } from 'zod'
import type { Role } from '../../src/types'
import type { Config } from './config'
import type { Db } from './db'
import {
  checkTotp,
  decryptSecret,
  dummyVerify,
  encryptSecret,
  hashPassword,
  newToken,
  newTotpSecret,
  passwordProblem,
  tokenId,
  totpFor,
  verifyPassword,
} from './security'

export type Stage = 'password_change' | 'totp_enroll' | 'totp' | 'full'

export interface SessionUser {
  sessionId: string
  stage: Stage
  id: string
  email: string
  name: string
  role: Role
  isAdmin: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: SessionUser | null
  }
}

export const COOKIE_NAME = 'sc_session'
const MAX_FAILURES = 5
const LOCK_MINUTES = 15

interface UserAuthRow {
  id: string
  email: string
  name: string
  role: Role
  password_hash: string
  must_change_password: boolean
  totp_secret: string | null
  totp_enabled: boolean
  totp_last_step: string | null
  disabled: boolean
  failed_attempts: number
  locked_until: Date | null
}

const nextStage = (u: Pick<UserAuthRow, 'must_change_password' | 'totp_enabled'>): Stage =>
  u.must_change_password ? 'password_change' : u.totp_enabled ? 'totp' : 'totp_enroll'

export function registerAuth(app: FastifyInstance, db: Db, config: Config) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict' as const,
  }

  const clearSession = (reply: FastifyReply) => reply.clearCookie(COOKIE_NAME, cookieOptions)

  /** Charge la session à partir du cookie (expiration absolue et inactivité). */
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (req) => {
    req.auth = null
    const token = req.cookies[COOKIE_NAME]
    if (!token) return
    const { rows } = await db.query<{
      id: string
      stage: Stage
      last_seen_at: Date
      expires_at: Date
      user_id: string
      email: string
      name: string
      role: Role
      is_admin: boolean
      disabled: boolean
    }>(
      `SELECT s.id, s.stage, s.last_seen_at, s.expires_at, u.id AS user_id, u.email, u.name, u.role, u.is_admin, u.disabled
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
      [tokenId(token)],
    )
    const s = rows[0]
    if (!s) return
    const now = Date.now()
    const idleLimit = new Date(s.last_seen_at).getTime() + config.sessionIdleMinutes * 60_000
    if (s.disabled || new Date(s.expires_at).getTime() < now || idleLimit < now) {
      await db.query('DELETE FROM sessions WHERE id = $1', [s.id])
      return
    }
    // Mise à jour de l'activité au plus une fois par minute.
    if (now - new Date(s.last_seen_at).getTime() > 60_000) await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [s.id])
    req.auth = { sessionId: s.id, stage: s.stage, id: s.user_id, email: s.email, name: s.name, role: s.role, isAdmin: s.is_admin }
  })

  const setStage = (sessionId: string, stage: Stage) => db.query('UPDATE sessions SET stage = $2 WHERE id = $1', [sessionId, stage])

  const loadUser = async (id: string) =>
    (await db.query<UserAuthRow>('SELECT * FROM users WHERE id = $1', [id])).rows[0]

  const requireStage = (req: FastifyRequest, reply: FastifyReply, stage: Stage): SessionUser | null => {
    if (!req.auth || req.auth.stage !== stage) {
      reply.code(req.auth ? 403 : 401).send({ ok: false, error: 'Étape d’authentification invalide.' })
      return null
    }
    return req.auth
  }

  const authRate = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

  app.post('/api/auth/login', authRate, async (req, reply) => {
    const body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(256) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Identifiant ou mot de passe invalide.' })
    const { email, password } = body.data
    const user = (await db.query<UserAuthRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email])).rows[0]
    const refuse = () => reply.code(401).send({ ok: false, error: 'Identifiant ou mot de passe invalide.' })

    if (!user) {
      await dummyVerify(password)
      return refuse()
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now())
      return reply.code(423).send({ ok: false, error: `Compte temporairement verrouillé après ${MAX_FAILURES} échecs. Réessayez plus tard.` })
    const valid = await verifyPassword(user.password_hash, password)
    if (!valid || user.disabled) {
      if (!user.disabled) {
        const failures = user.failed_attempts + 1
        await db.query(
          `UPDATE users SET failed_attempts = $2::int,
                  locked_until = CASE WHEN $2::int >= $3::int THEN now() + make_interval(mins => $4::int) ELSE NULL END
           WHERE id = $1`,
          [user.id, failures, MAX_FAILURES, LOCK_MINUTES],
        )
        req.log.warn({ userId: user.id, failures }, 'échec de connexion')
      }
      return refuse()
    }
    await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id])
    const token = newToken()
    const stage = nextStage(user)
    await db.query(
      `INSERT INTO sessions (id, user_id, stage, expires_at, ip, user_agent) VALUES ($1, $2, $3, now() + make_interval(hours => $4::int), $5, $6)`,
      [tokenId(token), user.id, stage, config.sessionMaxHours, req.ip, String(req.headers['user-agent'] ?? '').slice(0, 300)],
    )
    reply.setCookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: config.sessionMaxHours * 3600 })
    return { ok: true, stage }
  })

  app.get('/api/auth/me', async (req) => {
    if (!req.auth) return { ok: true, stage: null }
    const { stage, id, email, name, role, isAdmin } = req.auth
    return { ok: true, stage, user: { id, email, name, role, isAdmin } }
  })

  app.post('/api/auth/password', authRate, async (req, reply) => {
    const auth = req.auth
    if (!auth || (auth.stage !== 'password_change' && auth.stage !== 'full'))
      return reply.code(401).send({ ok: false, error: 'Session invalide.' })
    const body = z.object({ currentPassword: z.string().max(256).optional(), newPassword: z.string().max(256) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ ok: false, error: 'Données invalides.' })
    const user = await loadUser(auth.id)
    if (!user) return reply.code(401).send({ ok: false, error: 'Session invalide.' })
    // Hors changement initial, le mot de passe actuel est exigé.
    if (auth.stage === 'full' && !(await verifyPassword(user.password_hash, body.data.currentPassword ?? '')))
      return reply.code(400).send({ ok: false, error: 'Mot de passe actuel incorrect.' })
    const problem = passwordProblem(body.data.newPassword, user.email)
    if (problem) return reply.code(400).send({ ok: false, error: problem })
    if (await verifyPassword(user.password_hash, body.data.newPassword))
      return reply.code(400).send({ ok: false, error: 'Le nouveau mot de passe doit être différent de l’actuel.' })
    await db.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [user.id, await hashPassword(body.data.newPassword)])
    // Les autres sessions de l'utilisateur sont fermées.
    await db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [user.id, auth.sessionId])
    const stage: Stage = auth.stage === 'full' ? 'full' : nextStage({ must_change_password: false, totp_enabled: user.totp_enabled })
    await setStage(auth.sessionId, stage)
    return { ok: true, stage }
  })

  app.get('/api/auth/totp/setup', async (req, reply) => {
    const auth = requireStage(req, reply, 'totp_enroll')
    if (!auth) return
    const user = await loadUser(auth.id)
    if (!user) return reply.code(401).send({ ok: false, error: 'Session invalide.' })
    let secret = user.totp_secret ? decryptSecret(config.appSecret, user.totp_secret) : null
    if (!secret) {
      secret = newTotpSecret()
      await db.query('UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1', [user.id, encryptSecret(config.appSecret, secret)])
    }
    const uri = totpFor(secret, config.totpIssuer, user.email).toString()
    return { ok: true, secret, otpauthUrl: uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) }
  })

  const codeBody = z.object({ code: z.string().max(10) })

  const acceptTotp = async (user: UserAuthRow, code: string): Promise<boolean> => {
    if (!user.totp_secret) return false
    const step = checkTotp(decryptSecret(config.appSecret, user.totp_secret), code)
    if (step === null) return false
    if (user.totp_last_step !== null && step <= Number(user.totp_last_step)) return false // code déjà utilisé
    await db.query('UPDATE users SET totp_last_step = $2 WHERE id = $1', [user.id, step])
    return true
  }

  const completeLogin = async (auth: SessionUser) => {
    await setStage(auth.sessionId, 'full')
    await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [auth.id])
  }

  app.post('/api/auth/totp/enroll', authRate, async (req, reply) => {
    const auth = requireStage(req, reply, 'totp_enroll')
    if (!auth) return
    const body = codeBody.safeParse(req.body)
    const user = await loadUser(auth.id)
    if (!body.success || !user || !(await acceptTotp(user, body.data.code)))
      return reply.code(400).send({ ok: false, error: 'Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.' })
    await db.query('UPDATE users SET totp_enabled = true WHERE id = $1', [user.id])
    await completeLogin(auth)
    return { ok: true, stage: 'full' }
  })

  app.post('/api/auth/totp/verify', authRate, async (req, reply) => {
    const auth = requireStage(req, reply, 'totp')
    if (!auth) return
    const body = codeBody.safeParse(req.body)
    const user = await loadUser(auth.id)
    if (!body.success || !user || !(await acceptTotp(user, body.data.code))) {
      req.log.warn({ userId: auth.id }, 'code TOTP refusé')
      return reply.code(400).send({ ok: false, error: 'Code incorrect.' })
    }
    await completeLogin(auth)
    return { ok: true, stage: 'full' }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) await db.query('DELETE FROM sessions WHERE id = $1', [req.auth.sessionId])
    clearSession(reply)
    return { ok: true }
  })
}

/** Garde : session complète d'un administrateur. */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const a = requireFull(req, reply)
  if (a && !a.isAdmin) {
    reply.code(403).send({ ok: false, error: 'Réservé à l’administrateur.' })
    return null
  }
  return a
}

/** Garde : session complète exigée (et rôle éventuel). */
export function requireFull(req: FastifyRequest, reply: FastifyReply, roles?: Role[]): SessionUser | null {
  const a = req.auth
  if (!a || a.stage !== 'full') {
    reply.code(401).send({ ok: false, error: 'Authentification requise.' })
    return null
  }
  if (roles && !roles.includes(a.role)) {
    reply.code(403).send({ ok: false, error: 'Droits insuffisants.' })
    return null
  }
  return a
}
