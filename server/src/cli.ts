/**
 * Outils d'administration :
 *   migrate                                   applique les migrations
 *   init --email E --name N [--role R] [--title T] [--invite]
 *                                             crée le premier administrateur (refusé s'il en existe déjà un)
 *   create-user --email E --name N --role R [--title T] [--admin] [--invite]
 *                                             crée un compte (mot de passe temporaire affiché une fois)
 *
 * --invite : au lieu d'afficher un mot de passe temporaire, envoie par e-mail un
 * lien d'invitation (SMTP configuré, comme pour l'API : SMTP_HOST, SMTP_FROM…).
 *   grant-admin --email E                     rend un compte administrateur (secours)
 *   verify-history                            vérifie le chaînage du journal d'audit
 *   seed-demo                                 charge les données de démonstration (base vide, instance de test)
 *
 * Rôles métier (R) : responsable, contributeur, lecteur. Le rôle administrateur
 * (gestion des comptes) se cumule avec un rôle métier.
 */
import { buildDemoData } from '../../src/data/demoData'
import type { ComplianceState, Role } from '../../src/types'
import { isExternalEmail } from '../../src/utils/domains'
import { adminDatabaseUrl, loadConfig } from './config'
import { WRITE_LOCK_KEY, createPool, migrate, withTx } from './db'
import { logEvent, verifyHistory } from './history'
import { invitationMessage, issueToken } from './invitations'
import { createSmtpMailer } from './mailer'
import { hashPassword, initialsOf, newId, newToken, temporaryPassword } from './security'
import { completeSetup, ensureOrganization, getOrganization, loadState, persistChanges } from './state'

const [command, ...rest] = process.argv.slice(2)

const flag = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}

const need = (name: string): string => {
  const v = flag(name)
  if (!v) throw new Error(`Option obligatoire : --${name}`)
  return v
}

const has = (name: string): boolean => rest.includes(`--${name}`)

const ROLE_IDS: Role[] = ['responsable', 'contributeur', 'lecteur']
const roleOption = (fallback?: Role): Role => {
  const role = (flag('role') ?? fallback) as Role | undefined
  if (!role || !ROLE_IDS.includes(role)) throw new Error('Rôle invalide : responsable, contributeur ou lecteur.')
  return role
}

/**
 * Crée un compte et journalise l'opération. Renvoie le mot de passe temporaire,
 * ou null si une invitation a été envoyée par e-mail (--invite).
 */
async function insertUser(email: string, name: string, role: Role, isAdmin: boolean, onlyIfNoAdmin = false): Promise<string | null> {
  const invite = has('invite')
  // Configuration complète (SMTP, origine publique) seulement pour une invitation.
  const config = invite ? loadConfig() : null
  if (config && !config.smtp) throw new Error('--invite : l’envoi d’e-mails n’est pas configuré (SMTP_HOST, SMTP_FROM, mot de passe SMTP).')
  const temp = invite ? null : temporaryPassword()
  const id = newId('usr')
  const db = createPool(dbUrl())
  try {
    const sent = await withTx(db, async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
      if (onlyIfNoAdmin) {
        const admins = Number((await tx.query<{ n: string }>('SELECT count(*) AS n FROM users WHERE is_admin')).rows[0]?.n ?? 0)
        if (admins > 0) throw new Error('Un administrateur existe déjà. Utilisez create-user, ou grant-admin en cas de perte d’accès.')
      }
      const org = await getOrganization(tx)
      const external = isExternalEmail(email, org.domains)
      await tx.query(
        `INSERT INTO users (id, email, name, initials, title, role, is_admin, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [id, email, name, initialsOf(name), flag('title') ?? '', role, isAdmin, await hashPassword(temp ?? newToken())],
      )
      await logEvent(
        tx,
        id,
        'Compte créé',
        `${name} <${email}>${external ? ' (externe)' : ''}, rôle ${role}${isAdmin ? ' + administrateur' : ''} (ligne de commande)`,
      )
      if (!config) return null
      const issued = await issueToken(tx, id, 'invite', id, config.inviteTtlHours)
      await logEvent(tx, id, 'Invitation envoyée', `${name} <${email}>, lien valable ${config.inviteTtlHours} h (ligne de commande)`)
      // Envoi dans la transaction : en cas d'échec SMTP, le compte n'est pas créé et la commande peut être relancée.
      await createSmtpMailer(config.smtp!).send(
        invitationMessage(config, {
          purpose: 'invite',
          to: email,
          name,
          invitedBy: 'L’administrateur de l’application',
          organization: org.name,
          ...issued,
        }),
      )
      return issued.expiresAt
    })
    if (sent) console.log(`Invitation envoyée à ${email}, lien valable jusqu’au ${sent.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`)
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new Error('Un compte existe déjà pour cet e-mail.')
    throw e
  } finally {
    await db.end()
  }
  return temp
}

const dbUrl = adminDatabaseUrl

async function main() {
  switch (command) {
    case 'migrate': {
      const applied = await migrate(dbUrl())
      console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base déjà à jour.')
      return
    }

    case 'init': {
      const email = need('email')
      const name = need('name')
      // Séparation des tâches : par défaut l'administrateur n'a que la consultation.
      const role = roleOption('lecteur')
      const temp = await insertUser(email, name, role, true, true)
      const origin = process.env.PUBLIC_ORIGIN
      console.log(`Administrateur créé : ${name} <${email}>, rôle métier ${role}.`)
      if (temp) console.log(`Mot de passe temporaire (affiché une seule fois) : ${temp}`)
      console.log('')
      console.log('Étapes suivantes :')
      console.log(
        temp
          ? `  1. Connectez-vous${origin ? ` sur ${origin}` : ''}, changez le mot de passe et activez la double authentification.`
          : '  1. Ouvrez le lien reçu par e-mail, choisissez le mot de passe et activez la double authentification.',
      )
      console.log('  2. L’assistant d’installation demande le nom de l’organisme et propose des données de départ.')
      console.log('  3. Créez les comptes de l’équipe (Administration > Utilisateurs) et attribuez les rôles.')
      return
    }

    case 'create-user': {
      const email = need('email')
      const name = need('name')
      const role = roleOption()
      const admin = has('admin')
      const temp = await insertUser(email, name, role, admin)
      console.log(`Compte créé pour ${name} <${email}> (${role}${admin ? ', administrateur' : ''}).`)
      if (temp) console.log(`Mot de passe temporaire (à changer à la première connexion) : ${temp}`)
      console.log('La double authentification (TOTP) sera configurée à la première connexion.')
      return
    }

    case 'grant-admin': {
      const email = need('email')
      const db = createPool(dbUrl())
      try {
        await withTx(db, async (tx) => {
          await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
          const user = (await tx.query<{ id: string; name: string }>('SELECT id, name FROM users WHERE lower(email) = lower($1)', [email])).rows[0]
          if (!user) throw new Error(`Aucun compte pour ${email}.`)
          await tx.query('UPDATE users SET is_admin = true, disabled = false WHERE id = $1', [user.id])
          await logEvent(tx, user.id, 'Compte modifié', `${user.name} : administrateur ajouté (ligne de commande)`)
          console.log(`${user.name} <${email}> est maintenant administrateur.`)
        })
      } finally {
        await db.end()
      }
      return
    }

    case 'verify-history': {
      const db = createPool(dbUrl())
      try {
        const report = await verifyHistory(db)
        if (report.ok) console.log(`Journal d'audit intègre : ${report.count} entrées vérifiées.`)
        else {
          console.error(`Journal d'audit ALTÉRÉ à l'entrée ${report.brokenAt?.id} (n° ${report.brokenAt?.seq}) : ${report.brokenAt?.reason}`)
          process.exitCode = 2
        }
      } finally {
        await db.end()
      }
      return
    }

    case 'seed-demo': {
      const db = createPool(dbUrl())
      try {
        await withTx(db, async (tx) => {
          await tx.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK_KEY])
          const count = Number((await tx.query<{ n: string }>('SELECT count(*) AS n FROM gaps')).rows[0]?.n ?? 0)
          if (count > 0) throw new Error('La base contient déjà des lacunes : chargement de la démo refusé.')
          const demo = buildDemoData()
          const passwords: string[] = []
          for (const u of demo.users) {
            const temp = temporaryPassword()
            const email = `${u.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}@demo.local`
            await tx.query(
              `INSERT INTO users (id, email, name, initials, title, role, is_admin, password_hash, must_change_password)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) ON CONFLICT (id) DO NOTHING`,
              [u.id, email, u.name, u.initials, u.title, u.role, u.isAdmin === true, await hashPassword(temp)],
            )
            passwords.push(`${email} (${u.role}${u.isAdmin ? ', administrateur' : ''}) : ${temp}`)
          }
          await ensureOrganization(tx, demo.organization)
          const empty: ComplianceState = { ...(await loadState(tx, 'u1')), gaps: [], remediations: [], evidence: [], history: [], milestones: [] }
          await persistChanges(tx, empty, { ...demo, users: empty.users })
          await completeSetup(tx, 'u1')
          console.log('Données de démonstration chargées. Comptes créés :')
          passwords.forEach((p) => console.log(`  ${p}`))
        })
      } finally {
        await db.end()
      }
      return
    }

    default:
      console.log(
        'Commandes : migrate | init --email E --name N [--role R] [--invite] | create-user --email E --name N --role R [--title T] [--admin] [--invite] | grant-admin --email E | verify-history | seed-demo',
      )
      process.exitCode = command ? 1 : 0
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
