/**
 * Outils d'administration :
 *   migrate                                   applique les migrations
 *   create-user --email E --name N --role R [--title T]
 *                                             crée un compte (mot de passe temporaire affiché une fois)
 *   verify-history                            vérifie le chaînage du journal d'audit
 *   seed-demo                                 charge les données de démonstration (base vide uniquement)
 */
import { buildDemoData } from '../../src/data/demoData'
import type { ComplianceState, Role } from '../../src/types'
import { WRITE_LOCK_KEY, createPool, migrate, withTx } from './db'
import { verifyHistory } from './history'
import { hashPassword, initialsOf, newId, temporaryPassword } from './security'
import { ensureOrganization, loadState, persistChanges } from './state'

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

const dbUrl = () => {
  const url = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL (ou DATABASE_ADMIN_URL) doit être défini.')
  return url
}

async function main() {
  switch (command) {
    case 'migrate': {
      const applied = await migrate(dbUrl())
      console.log(applied.length ? `Migrations appliquées : ${applied.join(', ')}` : 'Base déjà à jour.')
      return
    }

    case 'create-user': {
      const role = need('role') as Role
      if (!['responsable', 'contributeur', 'lecteur'].includes(role)) throw new Error('Rôle invalide (responsable, contributeur ou lecteur).')
      const email = need('email')
      const name = need('name')
      const temp = temporaryPassword()
      const db = createPool(dbUrl())
      try {
        await db.query(
          `INSERT INTO users (id, email, name, initials, title, role, password_hash, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
          [newId('usr'), email, name, initialsOf(name), flag('title') ?? '', role, await hashPassword(temp)],
        )
      } finally {
        await db.end()
      }
      console.log(`Compte créé pour ${name} <${email}> (${role}).`)
      console.log(`Mot de passe temporaire (à changer à la première connexion) : ${temp}`)
      console.log('La double authentification (TOTP) sera configurée à la première connexion.')
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
              `INSERT INTO users (id, email, name, initials, title, role, password_hash, must_change_password)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT (id) DO NOTHING`,
              [u.id, email, u.name, u.initials, u.title, u.role, await hashPassword(temp)],
            )
            passwords.push(`${email} (${u.role}) : ${temp}`)
          }
          await ensureOrganization(tx, demo.organization)
          const empty: ComplianceState = { ...(await loadState(tx, 'u1')), gaps: [], remediations: [], evidence: [], history: [], milestones: [] }
          await persistChanges(tx, empty, { ...demo, users: empty.users })
          console.log('Données de démonstration chargées. Comptes créés :')
          passwords.forEach((p) => console.log(`  ${p}`))
        })
      } finally {
        await db.end()
      }
      return
    }

    default:
      console.log(`Commandes : migrate | create-user --email E --name N --role R [--title T] | verify-history | seed-demo`)
      process.exitCode = command ? 1 : 0
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
