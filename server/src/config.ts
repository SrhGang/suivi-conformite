/** Configuration de l'API, lue dans les variables d'environnement. */

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
}

export function loadConfig(): Config {
  const databaseUrl = env('DATABASE_URL')
  if ((process.env.APP_SECRET ?? '').length < 32) throw new Error('APP_SECRET doit contenir au moins 32 caractères (ex. : openssl rand -base64 48).')
  return {
    port: int('PORT', 3000),
    host: env('HOST', '0.0.0.0'),
    databaseUrl,
    databaseAdminUrl: process.env.DATABASE_ADMIN_URL || databaseUrl,
    publicOrigin: env('PUBLIC_ORIGIN', 'http://localhost:5173').replace(/\/$/, ''),
    cookieSecure: bool('COOKIE_SECURE', true),
    sessionIdleMinutes: int('SESSION_IDLE_MINUTES', 120),
    sessionMaxHours: int('SESSION_MAX_HOURS', 12),
    uploadDir: env('UPLOAD_DIR', './data/uploads'),
    maxUploadMb: int('MAX_UPLOAD_MB', 20),
    organizationName: env('ORG_NAME', 'Mon organisme'),
    organizationSector: env('ORG_SECTOR', ''),
    totpIssuer: env('TOTP_ISSUER', 'Conformité ISO 27001'),
    trustProxy: bool('TRUST_PROXY', true),
    appSecret: env('APP_SECRET'),
  }
}
