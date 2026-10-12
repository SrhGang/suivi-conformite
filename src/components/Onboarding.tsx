import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupApi } from '../api/http'
import { ADMIN_ROLE, ROLES } from '../data/constants'
import { STARTER_GAPS } from '../data/starterGaps'
import { useCompliance } from '../store/ComplianceContext'
import type { User } from '../types'
import { OrganizationFields, RolesHelp } from './admin'
import { Modal } from './ui'

const guideKey = (mode: 'api' | 'local', userId: string) => `suivi-conformite:guide:${mode === 'api' ? userId : 'demo'}`

const readSeen = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

const writeSeen = (key: string) => {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Stockage indisponible : le guide réapparaîtra au prochain chargement.
  }
}

interface OnboardingProps {
  /** Le guide a été rouvert depuis l'en-tête. */
  guideRequested: boolean
  onGuideClosed: () => void
}

/**
 * Accueil : assistant de première installation (administrateur, version
 * serveur), puis guide de démarrage affiché une fois par utilisateur.
 */
export default function Onboarding({ guideRequested, onGuideClosed }: OnboardingProps) {
  const { mode, state, currentUser, can } = useCompliance()
  const key = guideKey(mode, currentUser.id)
  const [seen, setSeen] = useState(() => readSeen(key))
  const [setupLater, setSetupLater] = useState(false)
  const onLater = useCallback(() => setSetupLater(true), [])

  useEffect(() => setSeen(readSeen(key)), [key])

  const closeGuide = useCallback(() => {
    writeSeen(key)
    setSeen(true)
    onGuideClosed()
  }, [key, onGuideClosed])

  if (mode === 'api' && state.setupPending && can('admin') && !setupLater) return <SetupWizard onLater={onLater} />
  if (guideRequested || !seen) return <WelcomeGuide user={currentUser} onClose={closeGuide} />
  return null
}

/* ------------------------------------------------------------------ */
/* Assistant de première installation                                  */
/* ------------------------------------------------------------------ */

const SETUP_STEPS = ['Organisme', 'Données de départ', 'Équipe']

function SetupWizard({ onLater }: { onLater: () => void }) {
  const { state, refresh, notify } = useCompliance()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [org, setOrg] = useState(state.organization)
  const [start, setStart] = useState<'empty' | 'starter' | null>(state.gaps.length ? 'empty' : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const later = onLater

  /** Exécute une étape côté serveur puis passe à la suivante. */
  const perform = async (fn: () => Promise<{ ok: boolean; error?: string }>, next: () => void) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await fn().catch(() => ({ ok: false, error: 'Serveur injoignable ou session expirée.' }))
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Erreur inattendue.')
    await refresh()
    next()
  }

  const submitOrganization = (e: FormEvent) => {
    e.preventDefault()
    void perform(
      () => setupApi.saveOrganization(org),
      () => setStep(1),
    )
  }

  const submitStart = (e: FormEvent) => {
    e.preventDefault()
    if (!start) return setError('Choisissez comment démarrer.')
    if (start === 'empty') {
      setError(null)
      return setStep(2)
    }
    void perform(setupApi.loadStarterGaps, () => {
      notify(`${STARTER_GAPS.length} lacunes de départ ajoutées, à confirmer.`)
      setStep(2)
    })
  }

  const finish = (target: string) => void perform(setupApi.complete, () => navigate(target))

  return (
    <Modal title={`Installation : étape ${step + 1} sur ${SETUP_STEPS.length}`} onClose={later}>
      <ol className="stepper" aria-label="Étapes de l’installation">
        {SETUP_STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="stepper__num">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      {step === 0 && (
        <form onSubmit={submitOrganization}>
          <p className="small" style={{ marginBottom: 16 }}>
            Bienvenue. Ces informations apparaissent dans l’application et dans les rapports exportés. Vous pourrez les modifier plus tard dans
            Administration › Utilisateurs.
          </p>
          <OrganizationFields value={org} onChange={setOrg} />
          <WizardActions busy={busy} onLater={later} submitLabel="Continuer" />
        </form>
      )}

      {step === 1 && (
        <form onSubmit={submitStart}>
          <p className="small" style={{ marginBottom: 16 }}>
            Comment voulez-vous démarrer votre inventaire des lacunes ?
          </p>
          <div className="choice-list" role="radiogroup" aria-label="Données de départ">
            <label className={`choice ${start === 'empty' ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name="start"
                checked={start === 'empty'}
                onChange={() => {
                  setStart('empty')
                  setError(null)
                }}
              />
              <span>
                <strong>Partir de zéro</strong>
                <span className="small muted">Vous saisissez vous-même les lacunes relevées dans votre organisme.</span>
              </span>
            </label>
            <label className={`choice ${start === 'starter' ? 'is-selected' : ''} ${state.gaps.length ? 'is-disabled' : ''}`}>
              <input
                type="radio"
                name="start"
                checked={start === 'starter'}
                disabled={state.gaps.length > 0}
                onChange={() => {
                  setStart('starter')
                  setError(null)
                }}
              />
              <span>
                <strong>Partir des lacunes courantes ({STARTER_GAPS.length})</strong>
                <span className="small muted">
                  Lacunes fréquentes dans une entité soumise à NIS2 (MFA, sauvegardes, correctifs, gestion des incidents…), reliées aux mesures ISO
                  27001. Elles sont marquées « à confirmer » : gardez celles qui vous concernent et archivez les autres.
                  {state.gaps.length > 0 && ' Indisponible : l’inventaire contient déjà des lacunes.'}
                </span>
              </span>
            </label>
          </div>
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Les données de démonstration fictives ne sont pas proposées ici : elles resteraient pour toujours dans le journal d’audit. Réservez-les à
            une instance de test.
          </p>
          <WizardActions busy={busy} onLater={later} onBack={() => setStep(0)} submitLabel="Continuer" />
        </form>
      )}

      {step === 2 && (
        <div>
          <p className="small" style={{ marginBottom: 16 }}>
            Dernière étape : créez les comptes de l’équipe et attribuez un rôle à chacun. Chaque personne reçoit un mot de passe temporaire et active
            la double authentification à sa première connexion.
          </p>
          <RolesHelp />
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setStep(1)} disabled={busy}>
              Retour
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => finish('/')} disabled={busy}>
              Terminer
            </button>
            <button type="button" className="btn btn--primary" onClick={() => finish('/utilisateurs')} disabled={busy}>
              Terminer et créer les comptes
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function WizardActions({ busy, onLater, onBack, submitLabel }: { busy: boolean; onLater: () => void; onBack?: () => void; submitLabel: string }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn btn--ghost" onClick={onLater} disabled={busy}>
        Plus tard
      </button>
      {onBack && (
        <button type="button" className="btn btn--secondary" onClick={onBack} disabled={busy}>
          Retour
        </button>
      )}
      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Enregistrement…' : submitLabel}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Guide de démarrage                                                  */
/* ------------------------------------------------------------------ */

interface Slide {
  title: string
  body: ReactNode
}

function guideSlides(user: User, mode: 'api' | 'local', toConfirm: number): Slide[] {
  const slides: Slide[] = [
    {
      title: 'Bienvenue',
      body: (
        <>
          <p>
            Cet outil recense les mesures de cybersécurité qui ne sont pas encore appliquées dans votre organisme (les <strong>lacunes</strong>) et
            suit leur correction jusqu’à la validation, selon l’ISO 27001:2022 et la directive NIS2.
          </p>
          <p>Chaque lacune suit le même parcours :</p>
          <ol className="guide-flow">
            <li>Non traitée</li>
            <li>En cours (des remédiations sont planifiées)</li>
            <li>Corrigée (une preuve est jointe)</li>
            <li>Validée par un responsable, puis revue périodiquement</li>
          </ol>
        </>
      ),
    },
    {
      title: 'Les pages',
      body: (
        <dl className="guide-pages">
          <dt>Tableau de bord</dt>
          <dd>Score de conformité pondéré par la criticité, alertes prioritaires et activité récente.</dd>
          <dt>Lacunes</dt>
          <dd>L’inventaire complet, avec recherche, filtres et export CSV. Cliquez sur une lacune pour ses remédiations, preuves et historique.</dd>
          <dt>Roadmap</dt>
          <dd>Le plan d’action en vue Gantt ou Kanban.</dd>
          <dt>Référentiel</dt>
          <dd>Les 93 mesures de l’annexe A de l’ISO 27001 et la couverture des exigences NIS2.</dd>
        </dl>
      ),
    },
    {
      title: `Votre rôle : ${ROLES[user.role].label}`,
      body: (
        <>
          <p>{ROLE_GUIDE[user.role]}</p>
          {user.isAdmin && (
            <p>
              <strong>{ADMIN_ROLE.label}.</strong> Vous gérez aussi les comptes, les rôles et les informations de l’organisme, dans Administration ›
              Utilisateurs. Vous ne pouvez pas modifier vos propres droits : un autre administrateur doit le faire.
            </p>
          )}
          <p className="small muted">Toutes les actions sont enregistrées dans un journal d’audit qui ne peut être ni modifié ni effacé.</p>
        </>
      ),
    },
  ]
  if (toConfirm > 0 && user.role !== 'lecteur')
    slides.push({
      title: 'Lacunes de départ à confirmer',
      body: (
        <p>
          {toConfirm} lacune{toConfirm > 1 ? 's ont été proposées' : ' a été proposée'} à l’installation. Ouvrez-les avec le filtre « À confirmer » de
          la page Lacunes : confirmez celles qui concernent votre organisme ; un responsable validant archive les autres.
        </p>
      ),
    })
  if (mode === 'local')
    slides.push({
      title: 'Version de démonstration',
      body: (
        <p>
          Les données sont fictives et restent dans votre navigateur. Changez d’utilisateur en haut à droite pour essayer chaque rôle. Le menu Gestion
          des données permet de réinitialiser la démonstration.
        </p>
      ),
    })
  return slides
}

const ROLE_GUIDE: Record<User['role'], string> = {
  responsable:
    'Vous créez et mettez à jour les lacunes, et vous seul pouvez les valider : il faut au moins une preuve, et votre commentaire de validation fait office de signature. Vous archivez les lacunes qui ne s’appliquent plus et réalisez les revues périodiques.',
  contributeur:
    'Vous créez les lacunes, planifiez les remédiations, joignez les preuves et faites avancer les statuts jusqu’à « Corrigée ». La validation finale revient à un responsable validant.',
  lecteur: 'Vous consultez l’ensemble du suivi, exportez le rapport de conformité et le CSV, et pouvez vérifier l’intégrité du journal d’audit.',
}

function WelcomeGuide({ user, onClose }: { user: User; onClose: () => void }) {
  const { mode, state } = useCompliance()
  const toConfirm = state.gaps.filter((g) => g.toConfirm && !g.archived).length
  const slides = guideSlides(user, mode, toConfirm)
  const [i, setI] = useState(0)
  const slide = slides[Math.min(i, slides.length - 1)]!
  const last = i >= slides.length - 1

  return (
    <Modal title="Guide de démarrage" onClose={onClose} size="sm">
      <div className="guide">
        <h4 className="guide__title">{slide.title}</h4>
        <div className="guide__body small">{slide.body}</div>
        <div className="guide__dots" aria-hidden="true">
          {slides.map((s, k) => (
            <span key={s.title} className={k === i ? 'is-current' : ''} />
          ))}
        </div>
        <div className="form-actions">
          {!last && (
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Passer
            </button>
          )}
          {i > 0 && (
            <button type="button" className="btn btn--secondary" onClick={() => setI(i - 1)}>
              Précédent
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Commencer' : 'Suivant'}
          </button>
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Étape {i + 1} sur {slides.length}. Ce guide reste accessible avec le bouton « ? » de l’en-tête.
        </p>
      </div>
    </Modal>
  )
}
