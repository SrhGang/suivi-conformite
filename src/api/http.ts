/** Client HTTP de l'API (cookie de session HttpOnly, même origine). */

export class UnauthorizedError extends Error {
  constructor() {
    super('Session expirée : reconnectez-vous.')
  }
}

export interface ApiError {
  ok: false
  error: string
  errors?: Record<string, string>
  blockers?: string[]
}

/**
 * Appelle l'API et renvoie le JSON. Une réponse 401 lève `UnauthorizedError` ;
 * les autres erreurs HTTP renvoient le corps `{ ok: false, error }`.
 */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T | ApiError> {
  const { json, headers, ...rest } = init
  let res: Response
  try {
    res = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: { Accept: 'application/json', ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    })
  } catch {
    return { ok: false, error: 'Serveur injoignable. Vérifiez votre connexion et réessayez.' }
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) throw new UnauthorizedError()
  const body: unknown = await res.json().catch(() => null)
  if (!body || typeof body !== 'object') return { ok: false, error: `Erreur serveur (${res.status}).` }
  return body as T | ApiError
}

export type AuthStage = 'password_change' | 'totp_enroll' | 'totp' | 'full'

export interface MeResponse {
  ok: true
  stage: AuthStage | null
  user?: { id: string; email: string; name: string; role: string; isAdmin: boolean }
}

export const authApi = {
  me: () => apiFetch<MeResponse>('/api/auth/me'),
  login: (email: string, password: string) =>
    apiFetch<{ ok: true; stage: AuthStage }>('/api/auth/login', { method: 'POST', json: { email, password } }),
  changePassword: (newPassword: string, currentPassword?: string) =>
    apiFetch<{ ok: true; stage: AuthStage }>('/api/auth/password', { method: 'POST', json: { newPassword, currentPassword } }),
  totpSetup: () => apiFetch<{ ok: true; secret: string; otpauthUrl: string; qr: string }>('/api/auth/totp/setup'),
  totpEnroll: (code: string) => apiFetch<{ ok: true; stage: AuthStage }>('/api/auth/totp/enroll', { method: 'POST', json: { code } }),
  totpVerify: (code: string) => apiFetch<{ ok: true; stage: AuthStage }>('/api/auth/totp/verify', { method: 'POST', json: { code } }),
  logout: () => apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST', json: {} }),
  checkInvitation: (token: string) =>
    apiFetch<{ ok: true; name: string; email: string; purpose: 'invite' | 'reset' }>('/api/auth/invitation/check', { method: 'POST', json: { token } }),
  acceptInvitation: (token: string, newPassword: string) =>
    apiFetch<{ ok: true; stage: AuthStage }>('/api/auth/invitation/accept', { method: 'POST', json: { token, newPassword } }),
}

export interface ManagedUser {
  id: string
  email: string
  name: string
  initials: string
  title: string
  role: 'responsable' | 'contributeur' | 'lecteur'
  is_admin: boolean
  disabled: boolean
  totp_enabled: boolean
  must_change_password: boolean
  locked: boolean
  last_login_at: string | null
  created_at: string
  /** Expiration du lien d'invitation en attente, s'il y en a un. */
  invite_expires_at: string | null
}

/** Résultat d'un envoi d'invitation ou de réinitialisation par e-mail. */
export interface InvitationResult {
  email: string
  expiresAt: string
  sent: boolean
  error?: string
}

/** Avec SMTP : invitation par e-mail ; sans SMTP : mot de passe temporaire à transmettre. */
export type AccessResult = { ok: true; invitation: InvitationResult; temporaryPassword?: undefined } | { ok: true; temporaryPassword: string; invitation?: undefined }

export const usersApi = {
  list: () => apiFetch<{ ok: true; users: ManagedUser[]; smtpConfigured: boolean }>('/api/users'),
  create: (input: { email: string; name: string; title: string; role: ManagedUser['role']; isAdmin: boolean }) =>
    apiFetch<AccessResult & { id: string }>('/api/users', { method: 'POST', json: input }),
  update: (id: string, changes: Partial<Pick<ManagedUser, 'name' | 'title' | 'role' | 'disabled'> & { isAdmin: boolean }>) =>
    apiFetch<{ ok: true }>(`/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', json: changes }),
  reset: (id: string) => apiFetch<AccessResult>(`/api/users/${encodeURIComponent(id)}/reset`, { method: 'POST', json: {} }),
  invite: (id: string) =>
    apiFetch<{ ok: true; invitation: InvitationResult }>(`/api/users/${encodeURIComponent(id)}/invite`, { method: 'POST', json: {} }),
  testSmtp: () => apiFetch<{ ok: true; sentTo: string }>('/api/admin/smtp/test', { method: 'POST', json: {} }),
  verifyAudit: () =>
    apiFetch<{ ok: true; report: { ok: boolean; count: number; brokenAt?: { seq: number; id: string; reason: string } } }>('/api/audit/verify'),
}

/** Première installation et informations de l'organisme (administrateur). */
export const setupApi = {
  saveOrganization: (organization: { name: string; sector: string }) =>
    apiFetch<{ ok: true }>('/api/organization', { method: 'PUT', json: organization }),
  loadStarterGaps: () => apiFetch<{ ok: true; result: number }>('/api/setup/starter', { method: 'POST', json: {} }),
  complete: () => apiFetch<{ ok: true }>('/api/setup/complete', { method: 'POST', json: {} }),
}
