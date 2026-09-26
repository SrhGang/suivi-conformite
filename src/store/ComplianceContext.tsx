import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { apiFetch, authApi, UnauthorizedError, type ApiError } from '../api/http'
import { buildDemoData } from '../data/demoData'
import { USE_API } from '../platform'
import type {
  ActionResult,
  ApiResult,
  ComplianceState,
  Evidence,
  EvidenceInput,
  EvidenceTypeId,
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
/** Taille maximale d'un fichier conservé dans le navigateur (mode démo). */
const MAX_INLINE = 1024 * 1024

export type LoadStatus = 'loading' | 'ready' | 'error'
export type ToastTone = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

type Async<T> = Promise<ApiResult<T>>

export interface ComplianceApi {
  createGap: (input: GapInput) => Async<Gap>
  updateGap: (id: string, changes: Partial<GapInput>) => Async<Gap>
  changeGapStatus: (id: string, status: GapStatusId, comment?: string) => Async<Gap>
  duplicateGap: (id: string) => Async<Gap>
  archiveGap: (id: string, reason?: string) => Async<Gap>
  restoreGap: (id: string) => Async<Gap>
  performReview: (id: string, outcome: ReviewOutcome, comment?: string) => Async<Gap>
  addRemediation: (gapId: string, input: RemediationInput) => Async<Remediation>
  updateRemediation: (id: string, changes: Partial<RemediationInput>) => Async<Remediation>
  deleteRemediation: (id: string) => Async<Remediation>
  /** Preuve sous forme de lien. */
  addEvidence: (gapId: string, input: EvidenceInput) => Async<Evidence>
  /** Preuve sous forme de fichier (stocké par le serveur, ou dans le navigateur en démo). */
  uploadEvidence: (gapId: string, file: File, type: EvidenceTypeId) => Async<Evidence>
  removeEvidence: (id: string) => Async<Evidence>
  updateMilestones: (milestones: Milestone[]) => Async<Milestone[]>
  /** Démo uniquement : simulation de connexion sous un autre compte. */
  switchUser: (userId: string) => void
  /** Démo uniquement. */
  resetDemo: () => void
  /** Démo uniquement. */
  importData: (data: unknown) => void
  retry: () => void
  logout: () => Promise<void>
}

interface ShellValue extends ComplianceApi {
  /** « api » : production (serveur) ; « local » : démonstration dans le navigateur. */
  mode: 'api' | 'local'
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

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

let toastSeq = 0

type ActionFn = (state: ComplianceState, user: User, ...args: never[]) => ActionResult<unknown>

/** Actions métier, sous les mêmes noms que l'API (server/src/actions.ts). */
const LOCAL_ACTIONS = {
  createGap: actions.createGap,
  updateGap: actions.updateGap,
  changeGapStatus: actions.changeGapStatus,
  duplicateGap: actions.duplicateGap,
  archiveGap: (s: ComplianceState, u: User, id: string, reason?: string) => actions.setArchived(s, u, id, true, reason),
  restoreGap: (s: ComplianceState, u: User, id: string) => actions.setArchived(s, u, id, false),
  performReview: actions.performReview,
  addRemediation: actions.addRemediation,
  updateRemediation: actions.updateRemediation,
  deleteRemediation: actions.deleteRemediation,
  addEvidence: actions.addEvidence,
  removeEvidence: actions.removeEvidence,
  updateMilestones: actions.updateMilestones,
} satisfies Record<string, ActionFn>

type ActionName = keyof typeof LOCAL_ACTIONS
type ArgsOf<N extends ActionName> = (typeof LOCAL_ACTIONS)[N] extends (s: ComplianceState, u: User, ...args: infer A) => unknown ? A : never
type ResultOf<N extends ActionName> = (typeof LOCAL_ACTIONS)[N] extends (...args: never[]) => ActionResult<infer T> ? T : never

interface ProviderProps {
  children: ReactNode
  /** Appelé quand le serveur signale une session expirée (mode API). */
  onSessionExpired?: () => void
}

export function ComplianceProvider({ children, onSessionExpired }: ProviderProps) {
  const [state, setState] = useState<ComplianceState | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const stateRef = useRef<ComplianceState | null>(null)
  const expiredRef = useRef(onSessionExpired)
  expiredRef.current = onSessionExpired

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const apply = useCallback((next: ComplianceState) => {
    stateRef.current = next
    setState(next)
  }, [])

  /** Gère une session expirée : retour à l'écran de connexion. */
  const guard = useCallback(async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        expiredRef.current?.()
        return fallback
      }
      throw e
    }
  }, [])

  const fetchRemoteState = useCallback(async () => {
    const res = await apiFetch<{ ok: true; state: ComplianceState }>('/api/state')
    if (!res.ok) throw new Error((res as ApiError).error)
    return res.state
  }, [])

  const load = useCallback(() => {
    setStatus('loading')
    let cancelled = false
    const done = (data: ComplianceState) => {
      if (cancelled) return
      apply(data)
      setStatus('ready')
    }
    const fail = (e: unknown) => {
      if (cancelled) return
      setLoadError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
    if (USE_API) {
      guard(fetchRemoteState, null).then((s) => s && done(s), fail)
      return () => {
        cancelled = true
      }
    }
    // Démo : léger délai simulant l'appel serveur, pour exposer les états de chargement.
    const timer = setTimeout(() => {
      try {
        done(readStorage())
      } catch (e) {
        fail(e)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [apply, guard, fetchRemoteState])

  useEffect(() => load(), [load])

  // Mode API : les modifications des autres utilisateurs sont récupérées au
  // retour sur l'onglet et toutes les minutes.
  useEffect(() => {
    if (!USE_API) return
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !stateRef.current) return
      guard(fetchRemoteState, null).then((s) => s && apply(s), () => {})
    }
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [apply, guard, fetchRemoteState])

  const commitLocal = useCallback(
    (next: ComplianceState) => {
      apply(next)
      if (!writeStorage(next))
        notify('Stockage local plein : les dernières modifications ne seront pas conservées après rechargement.', 'warning')
    },
    [apply, notify],
  )

  const currentUser = state?.users.find((u) => u.id === state.currentUserId) ?? null

  /** Exécute une action métier : sur le serveur (mode API) ou dans le navigateur (démo). */
  const run = useCallback(
    async <N extends ActionName>(name: N, ...args: ArgsOf<N>): Async<ResultOf<N>> => {
      if (USE_API) {
        return guard(async () => {
          const res = await apiFetch<{ ok: true; result: ResultOf<N>; state: ComplianceState }>(`/api/actions/${name}`, {
            method: 'POST',
            json: { args },
          })
          if (!res.ok) return res as ApiError
          apply(res.state)
          return { ok: true as const, result: res.result }
        }, { ok: false as const, error: 'Session expirée : reconnectez-vous.' })
      }
      const s = stateRef.current
      if (!s) return { ok: false, error: 'Données non chargées.' }
      const user = s.users.find((u) => u.id === s.currentUserId)
      if (!user) return { ok: false, error: 'Utilisateur inconnu.' }
      const fn = LOCAL_ACTIONS[name] as unknown as (s: ComplianceState, u: User, ...a: ArgsOf<N>) => ActionResult<ResultOf<N>>
      const out = fn(s, user, ...args)
      if (!out.ok) return out
      if (out.state !== s) commitLocal(out.state)
      return { ok: true, result: out.result }
    },
    [apply, commitLocal, guard],
  )

  const uploadEvidence = useCallback(
    async (gapId: string, file: File, type: EvidenceTypeId): Async<Evidence> => {
      if (USE_API) {
        return guard(async () => {
          const form = new FormData()
          form.append('type', type)
          form.append('file', file, file.name)
          const res = await apiFetch<{ ok: true; result: Evidence; state: ComplianceState }>(
            `/api/gaps/${encodeURIComponent(gapId)}/evidence`,
            { method: 'POST', body: form },
          )
          if (!res.ok) return res as ApiError
          apply(res.state)
          return { ok: true as const, result: res.result }
        }, { ok: false as const, error: 'Session expirée : reconnectez-vous.' })
      }
      const dataUrl = file.size <= MAX_INLINE ? await readAsDataUrl(file) : null
      return run('addEvidence', gapId, { name: file.name, size: file.size, type, dataUrl })
    },
    [apply, guard, run],
  )

  const logout = useCallback(async () => {
    if (USE_API) await authApi.logout().catch(() => {})
    expiredRef.current?.()
  }, [])

  const api = useMemo<ComplianceApi>(
    () => ({
      createGap: (input) => run('createGap', input),
      updateGap: (id, changes) => run('updateGap', id, changes),
      changeGapStatus: (id, st, comment) => run('changeGapStatus', id, st, comment),
      duplicateGap: (id) => run('duplicateGap', id),
      archiveGap: (id, reason) => run('archiveGap', id, reason),
      restoreGap: (id) => run('restoreGap', id),
      performReview: (id, outcome, comment) => run('performReview', id, outcome, comment),
      addRemediation: (gapId, input) => run('addRemediation', gapId, input),
      updateRemediation: (id, changes) => run('updateRemediation', id, changes),
      deleteRemediation: (id) => run('deleteRemediation', id),
      addEvidence: (gapId, input) => run('addEvidence', gapId, input),
      uploadEvidence,
      removeEvidence: (id) => run('removeEvidence', id),
      updateMilestones: (m) => run('updateMilestones', m),
      switchUser: (userId) => {
        if (!USE_API && stateRef.current) commitLocal({ ...stateRef.current, currentUserId: userId })
      },
      resetDemo: () => {
        if (USE_API) return
        const fresh = { ...buildDemoData(), currentUserId: stateRef.current?.currentUserId ?? 'u1' }
        commitLocal(fresh)
        setStatus('ready')
      },
      importData: (data) => {
        if (USE_API) throw new Error('Import indisponible : les données sont gérées par le serveur.')
        if (!isComplianceState(data)) throw new Error('Fichier de sauvegarde invalide.')
        commitLocal({ ...data, lastUpdated: new Date().toISOString() })
      },
      retry: load,
      logout,
    }),
    [run, uploadEvidence, commitLocal, load, logout],
  )

  const value: ShellValue = {
    mode: USE_API ? 'api' : 'local',
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
