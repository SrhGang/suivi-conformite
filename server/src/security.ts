/** Primitives de sécurité : mots de passe, jetons, TOTP, chiffrement des secrets. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import * as OTPAuth from 'otpauth'

/* ---------------------------------------------------------------- */
/* Mots de passe (argon2id, paramètres par défaut de @node-rs/argon2) */
/* ---------------------------------------------------------------- */

export const hashPassword = (password: string): Promise<string> => argonHash(password)

export const verifyPassword = async (hash: string, password: string): Promise<boolean> => {
  try {
    return await argonVerify(hash, password)
  } catch {
    return false
  }
}

/** Condensé factice : vérifié quand le compte n'existe pas, pour ne pas révéler son existence par le temps de réponse. */
let dummyHash: Promise<string> | null = null
export const dummyVerify = async (password: string) => {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(await dummyHash, password)
}

const COMMON = ['motdepasse', 'password', 'azerty', 'qwerty', '123456', 'admin', 'conformite', 'bienvenue', 'soleil']

/** Politique de mot de passe (recommandations ANSSI : longueur avant complexité). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 12) return 'Le mot de passe doit contenir au moins 12 caractères.'
  if (password.length > 256) return 'Le mot de passe est trop long (256 caractères maximum).'
  const lower = password.toLowerCase()
  if (email && lower.includes(email.split('@')[0].toLowerCase())) return 'Le mot de passe ne doit pas contenir votre identifiant.'
  if (COMMON.some((w) => lower.includes(w)) && new Set(lower).size < 8) return 'Ce mot de passe est trop courant.'
  if (new Set(password).size < 5) return 'Le mot de passe est trop répétitif.'
  return null
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
/** Mot de passe temporaire (18 caractères, ~104 bits d'entropie). */
export const temporaryPassword = (): string => Array.from({ length: 18 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')

/* ---------------------------------------------------------------- */
/* Jetons de session                                                */
/* ---------------------------------------------------------------- */

export const newToken = (): string => randomBytes(32).toString('base64url')
export const tokenId = (token: string): string => createHash('sha256').update(token).digest('hex')
export const newId = (prefix: string): string => `${prefix}_${randomBytes(6).toString('hex')}`

/* ---------------------------------------------------------------- */
/* Chiffrement des secrets TOTP au repos (AES-256-GCM)              */
/* ---------------------------------------------------------------- */

const keyFrom = (appSecret: string) => createHash('sha256').update(`totp:${appSecret}`).digest()

export function encryptSecret(appSecret: string, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(appSecret: string, stored: string): string {
  const [v, iv, tag, data] = stored.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Secret TOTP illisible')
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(appSecret), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/* ---------------------------------------------------------------- */
/* TOTP (RFC 6238 : SHA-1, 6 chiffres, 30 s)                        */
/* ---------------------------------------------------------------- */

export const newTotpSecret = (): string => new OTPAuth.Secret({ size: 20 }).base32

export const totpFor = (secretBase32: string, issuer: string, label: string) =>
  new OTPAuth.TOTP({ issuer, label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) })

/**
 * Vérifie un code TOTP (tolérance ±1 période) et renvoie le numéro de
 * période utilisé, ou null. L'appelant refuse une période déjà utilisée
 * (protection contre le rejeu).
 */
export function checkTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const totp = totpFor(secretBase32, 'x', 'x')
  const delta = totp.validate({ token: clean, timestamp: now, window: 1 })
  if (delta === null) return null
  return Math.floor(now / 1000 / 30) + delta
}

export const initialsOf = (name: string): string =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('') || '?'
