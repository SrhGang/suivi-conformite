import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildDemoData } from '../data/demoData'
import type {
  ActionResult,
  ApiResult,
  ComplianceState,
  Evidence,
  EvidenceInput,
  Gap,
  GapInput,
  GapStatusId,
  Milestone,
  Permission,
  Remediation,
  RemediationInput,
  ReviewOutcome,
  User,
} from '../types'
import * as actions from './actions'

const STORAGE_KEY = 'suivi-conformite:v1'

export type LoadStatus = 'loading' | 'ready' | 'error'
export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export interface ComplianceApi {
  createGap: (input: GapInput) => ApiResult<Gap>
  updateGap: (id: string, changes: Partial<GapInput>) => ApiResult<Gap>
  changeGapStatus: (id: string, status: GapStatusId, comment?: string) => ApiResult<Gap>
  duplicateGap: (id: string) => ApiResult<Gap>
  archiveGap: (id: string, reason?: string) => ApiResult<Gap>
  restoreGap: (id: string) => ApiResult<Gap>
  performReview: (id: string, outcome: ReviewOutcome, comment?: string) => ApiResult<Gap>
  addRemediation: (gapId: string, input: RemediationInput) => ApiResult<Remediation>
  updateRemediation: (id: string, changes: Partial<RemediationInput>) => ApiResult<Remediation>
  deleteRemediation: (id: string) => ApiResult<Remediation>
  addEvidence: (gapId: string, input: EvidenceInput) => ApiResult<Evidence>
  removeEvidence: (id: string) => ApiResult<Evidence>
  updateMilestones: (milestones: Milestone[]) => ApiResult<Milestone[]>
  switchUser: (userId: string) => void
  resetDemo: () => void
  importData: (data: unknown) => void
  retry: () => void
}

interface ShellValue extends ComplianceApi {
  state: ComplianceState | null
  status: LoadStatus
  loadError: string | null
  currentUser: User | null
  can: (permission: Permission) => boolean
  notify: (message: string, tone?: ToastTone) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
}

/** Valeur exposée une fois les données chargées (état et utilisateur garantis). */
export interface ComplianceValue extends ShellValue {
  state: ComplianceState
  currentUser: User
}

const ComplianceContext = createContext<ShellValue | null>(null)

const isComplianceState = (data: unknown): data is ComplianceState => {
  if (!data || typeof data !== 'object') return false
  const d = data as Partial<ComplianceState>
  return Array.isArray(d.gaps) && Array.isArray(d.users) && Array.isArray(d.history) && Array.isArray(d.remediations)
}

const readStorage = (): ComplianceState => {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : données de démonstration.
  }
  if (!raw) return buildDemoData()
  const parsed: unknown = JSON.parse(raw)
  if (!isComplianceState(parsed)) throw new Error('Données locales invalides')
  return parsed
}

const writeStorage = (state: ComplianceState): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

let toastSeq = 0

type ActionFn<A extends unknown[], T> = (state: ComplianceState, user: User, ...args: A) => ActionResult<T>

export function ComplianceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ComplianceState | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const stateRef = useRef<ComplianceState | null>(null)

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const load = useCallback(() => {
    setStatus('loading')
    // Léger délai simulant l'appel serveur, pour exposer les états de chargement.
    const timer = setTimeout(() => {
      try {
        const data = readStorage()
        stateRef.current = data
        setState(data)
        setStatus('ready')
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => load(), [load])

  const commit = useCallback(
    (next: ComplianceState) => {
      stateRef.current = next
      setState(next)
      if (!writeStorage(next))
        notify('Stockage local plein : les dernières modifications ne seront pas conservées après rechargement.', 'warning')
    },
    [notify],
  )

  const currentUser = state?.users.find((u) => u.id === state.currentUserId) ?? null

  /** Exécute une action métier pour l'utilisateur courant et enregistre le nouvel état. */
  const run = useCallback(
    <A extends unknown[], T>(fn: ActionFn<A, T>, ...args: A): ApiResult<T> => {
      const s = stateRef.current
      if (!s) return { ok: false, error: 'Données non chargées.' }
      const user = s.users.find((u) => u.id === s.currentUserId)
      if (!user) return { ok: false, error: 'Utilisateur inconnu.' }
      const out = fn(s, user, ...args)
      if (!out.ok) return out
      if (out.state !== s) commit(out.state)
      return { ok: true, result: out.result }
    },
    [commit],
  )

  const api = useMemo<ComplianceApi>(
    () => ({
      createGap: (input) => run(actions.createGap, input),
      updateGap: (id, changes) => run(actions.updateGap, id, changes),
      changeGapStatus: (id, st, comment) => run(actions.changeGapStatus, id, st, comment),
      duplicateGap: (id) => run(actions.duplicateGap, id),
      archiveGap: (id, reason) => run(actions.setArchived, id, true, reason),
      restoreGap: (id) => run(actions.setArchived, id, false),
      performReview: (id, outcome, comment) => run(actions.performReview, id, outcome, comment),
      addRemediation: (gapId, input) => run(actions.addRemediation, gapId, input),
      updateRemediation: (id, changes) => run(actions.updateRemediation, id, changes),
      deleteRemediation: (id) => run(actions.deleteRemediation, id),
      addEvidence: (gapId, input) => run(actions.addEvidence, gapId, input),
      removeEvidence: (id) => run(actions.removeEvidence, id),
      updateMilestones: (m) => run(actions.updateMilestones, m),
      switchUser: (userId) => {
        if (stateRef.current) commit({ ...stateRef.current, currentUserId: userId })
      },
      resetDemo: () => {
        const fresh = { ...buildDemoData(), currentUserId: stateRef.current?.currentUserId ?? 'u1' }
        commit(fresh)
        setStatus('ready')
      },
      importData: (data) => {
        if (!isComplianceState(data)) throw new Error('Fichier de sauvegarde invalide.')
        commit({ ...data, lastUpdated: new Date().toISOString() })
      },
      retry: load,
    }),
    [run, commit, load],
  )

  const value: ShellValue = {
    state,
    status,
    loadError,
    currentUser,
    can: (perm) => actions.can(currentUser, perm),
    notify,
    toasts,
    dismissToast,
    ...api,
  }

  return <ComplianceContext.Provider value={value}>{children}</ComplianceContext.Provider>
}

/** Accès au contexte, y compris pendant le chargement (mise en page). */
export function useComplianceShell(): ShellValue {
  const ctx = useContext(ComplianceContext)
  if (!ctx) throw new Error('useComplianceShell doit être utilisé dans <ComplianceProvider>')
  return ctx
}

/** Accès au contexte dans les pages : les données sont chargées. */
export function useCompliance(): ComplianceValue {
  const ctx = useComplianceShell()
  if (!ctx.state || !ctx.currentUser) throw new Error('useCompliance appelé avant le chargement des données')
  return ctx as ComplianceValue
}
