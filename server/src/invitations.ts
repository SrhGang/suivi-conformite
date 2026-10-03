/**
 * Invitations et réinitialisations par e-mail : lien à usage unique, valable
 * `inviteTtlHours`, qui permet à l'utilisateur de choisir lui-même son mot de
 * passe. Seul le condensé du jeton est stocké ; le jeton n'apparaît que dans
 * l'e-mail, dans le fragment de l'URL (jamais envoyé au serveur ni journalisé).
 */
import type { Config } from './config'
import type { Tx } from './db'
import type { MailMessage } from './mailer'
import { newToken, tokenId } from './security'

export type TokenPurpose = 'invite' | 'reset'

/** Crée un jeton pour `userId` et invalide ses jetons précédents non utilisés. */
export async function issueToken(
  tx: Tx,
  userId: string,
  purpose: TokenPurpose,
  createdBy: string,
  ttlHours: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken()
  await tx.query('DELETE FROM user_tokens WHERE user_id = $1 AND used_at IS NULL', [userId])
  const { rows } = await tx.query<{ expires_at: Date }>(
    `INSERT INTO user_tokens (id, user_id, purpose, created_by, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5::int)) RETURNING expires_at`,
    [tokenId(token), userId, purpose, createdBy, ttlHours],
  )
  return { token, expiresAt: new Date(rows[0]!.expires_at) }
}

export interface ValidToken {
  id: string
  purpose: TokenPurpose
  userId: string
  email: string
  name: string
  totpEnabled: boolean
}

/** Jeton valable (non utilisé, non expiré, compte actif), verrouillé jusqu'à la fin de la transaction. */
export async function findValidToken(tx: Tx, token: string): Promise<ValidToken | null> {
  const { rows } = await tx.query<{ id: string; purpose: TokenPurpose; user_id: string; email: string; name: string; totp_enabled: boolean }>(
    `SELECT t.id, t.purpose, t.user_id, u.email, u.name, u.totp_enabled
     FROM user_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.id = $1 AND t.used_at IS NULL AND t.expires_at > now() AND NOT u.disabled
     FOR UPDATE OF t`,
    [tokenId(token)],
  )
  const r = rows[0]
  return r ? { id: r.id, purpose: r.purpose, userId: r.user_id, email: r.email, name: r.name, totpEnabled: r.totp_enabled } : null
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const formatExpiry = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d)

/** Lien d'invitation : le jeton est dans le fragment (#), jamais transmis au serveur par le navigateur. */
export const invitationLink = (config: Config, token: string) => `${config.publicOrigin}/invitation#${token}`

export function invitationMessage(
  config: Config,
  input: { purpose: TokenPurpose; to: string; name: string; invitedBy: string; organization: string; token: string; expiresAt: Date },
): MailMessage {
  const link = invitationLink(config, input.token)
  const expiry = formatExpiry(input.expiresAt)
  const invite = input.purpose === 'invite'
  const subject = invite ? `Invitation : suivi de conformité ${input.organization}` : `Réinitialisation de votre accès : ${input.organization}`
  const intro = invite
    ? `${input.invitedBy} vous a créé un compte sur l'outil de suivi de conformité ISO 27001 / NIS2 de ${input.organization}.`
    : `${input.invitedBy} a réinitialisé votre accès à l'outil de suivi de conformité de ${input.organization}.`
  const steps = invite
    ? 'Ce lien vous permet de choisir votre mot de passe, puis de configurer la double authentification avec une application (Google Authenticator, Microsoft Authenticator, FreeOTP…).'
    : 'Ce lien vous permet de choisir un nouveau mot de passe, puis de configurer à nouveau la double authentification.'
  const warning = "Si vous n'attendiez pas ce message, ignorez-le : aucun accès ne sera ouvert sans ce lien. Ne le transférez à personne."
  const note = config.inviteAccessNote.trim()

  const text = [
    `Bonjour ${input.name},`,
    '',
    intro,
    steps,
    '',
    note,
    note ? '' : null,
    `Lien (valable jusqu'au ${expiry}, utilisable une seule fois) :`,
    link,
    '',
    warning,
  ]
    .filter((l) => l !== null)
    .join('\n')

  const p = (s: string) => `<p style="margin:0 0 16px">${escapeHtml(s)}</p>`
  const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
${p(`Bonjour ${input.name},`)}
${p(intro)}
${p(steps)}
${note ? `<p style="margin:0 0 16px;padding:12px;background:#f3f4f6;border-radius:6px">${escapeHtml(note)}</p>` : ''}
<p style="margin:0 0 16px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px">${invite ? 'Activer mon compte' : 'Choisir un nouveau mot de passe'}</a></p>
${p(`Ce lien est valable jusqu'au ${expiry} et ne peut servir qu'une fois.`)}
<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${escapeHtml(warning)}</p>
</body></html>`

  return { to: input.to, subject, text, html }
}

export function testMessage(to: string, organization: string): MailMessage {
  const text = `Ce message confirme que l'outil de suivi de conformité de ${organization} peut envoyer des e-mails.`
  return {
    to,
    subject: `Test d'envoi : suivi de conformité ${organization}`,
    text,
    html: `<!doctype html><html lang="fr"><body style="font-family:Arial,Helvetica,sans-serif"><p>${escapeHtml(text)}</p></body></html>`,
  }
}
