/**
 * Configuration de l'API, lue dans les variables d'environnement.
 * Les secrets peuvent aussi être lus dans des fichiers (variable `NOM_FILE`),
 * par exemple des secrets Docker déchiffrés par systemd-creds.
 */
import { readFileSync } from 'node:fs'

/** Valeur de `name`, ou contenu du fichier désigné par `name_FILE`. */
const secret = (name: string): string | undefined => {
  const file = process.env[`${name}_FILE`]
  if (file) return readFileSync(file, 'utf8').trim()
  return process.env[name]
}

/** Ajoute à une URL PostgreSQL le mot de passe lu dans `passwordVar_FILE`, s'il est fourni. */
const withPassword = (url: string, passwordVar: string): string => {
  const password = secret(passwordVar)
  if (!password) return url
  const u = new URL(url)
  u.password = encodeURIComponent(password)
  return u.toString()
}

const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback
  if (v === undefined || v === '') throw new Error(`Variable d'environnement manquante : ${name}`)
  return v
}

const bool = (name: string, fallback: boolean): boolean => {
  const v = process.env[name]
  if (v === undefined || v === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

const int = (name: string, fallback: number): number => {
  const v = process.env[name]
  const n = v ? Number.parseInt(v, 10) : fallback
  if (!Number.isFinite(n)) throw new Error(`Valeur invalide pour ${name}`)
  return n
}

export interface Config {
  port: number
  host: string
  /** Connexion applicative (droits restreints : pas d'UPDATE/DELETE sur le journal). */
  databaseUrl: string
  /** Connexion propriétaire utilisée pour les migrations (facultative). */
  databaseAdminUrl: string
  /** Origine publique de l'application (contrôle CSRF sur l'en-tête Origin). */
  publicOrigin: string
  cookieSecure: boolean
  sessionIdleMinutes: number
  sessionMaxHours: number
  uploadDir: string
  maxUploadMb: number
  organizationName: string
  organizationSector: string
  /** Nom affiché dans l'application d'authentification (TOTP). */
  totpIssuer: string
  trustProxy: boolean
  /** Secret applicatif : chiffre les secrets TOTP stockés en base (AES-256-GCM). */
  appSecret: string
  /** Relais SMTP des invitations ; null : mot de passe temporaire affiché à l'administrateur. */
  smtp: SmtpConfig | null
  /** Durée de validité d'un lien d'invitation ou de réinitialisation. */
  inviteTtlHours: number
  /** Texte ajouté aux e-mails : comment joindre l'application (VPN, réseau interne…). */
  inviteAccessNote: string
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  /** Expéditeur, par exemple « Conformité <no-reply@exemple.fr> ». */
  from: string
}

/** URL propriétaire (migrations, CLI), ou à défaut l'URL applicative. */
export function adminDatabaseUrl(): string {
  const adminUrl = process.env.DATABASE_ADMIN_URL
  return adminUrl ? withPassword(adminUrl, 'DATABASE_ADMIN_PASSWORD') : withPassword(env('DATABASE_URL'), 'DATABASE_PASSWORD')
}

/** Relais SMTP, activé dès que SMTP_HOST est renseigné. */
function loadSmtp(): SmtpConfig | null {
  const host = process.env.SMTP_HOST ?? ''
  if (!host) return null
  return {
    host,
    port: int('SMTP_PORT', 587),
    user: process.env.SMTP_USER ?? '',
    password: secret('SMTP_PASSWORD') ?? '',
    from: env('SMTP_FROM'),
  }
}

export function loadConfig(): Config {
  const databaseUrl = withPassword(env('DATABASE_URL'), 'DATABASE_PASSWORD')
  const appSecret = secret('APP_SECRET') ?? ''
  if (appSecret.length < 32) throw new Error('APP_SECRET doit contenir au moins 32 caractères (ex. : openssl rand -hex 32).')
  return {
    port: int('PORT', 3000),
    host: env('HOST', '0.0.0.0'),
    databaseUrl,
    databaseAdminUrl: adminDatabaseUrl(),
    publicOrigin: env('PUBLIC_ORIGIN', 'http://localhost:5173').replace(/\/$/, ''),
    cookieSecure: bool('COOKIE_SECURE', true),
    sessionIdleMinutes: int('SESSION_IDLE_MINUTES', 120),
    sessionMaxHours: int('SESSION_MAX_HOURS', 12),
    uploadDir: env('UPLOAD_DIR', './data/uploads'),
    maxUploadMb: int('MAX_UPLOAD_MB', 20),
    organizationName: env('ORG_NAME', 'Mon organisme'),
    organizationSector: process.env.ORG_SECTOR ?? '',
    totpIssuer: env('TOTP_ISSUER', 'Conformité ISO 27001'),
    trustProxy: bool('TRUST_PROXY', true),
    appSecret,
    smtp: loadSmtp(),
    inviteTtlHours: int('INVITE_TTL_HOURS', 24),
    inviteAccessNote: process.env.INVITE_ACCESS_NOTE ?? '',
  }
}
