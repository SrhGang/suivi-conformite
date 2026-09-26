import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildDemoData } from '../data/demoData.js'
import * as actions from './actions.js'

const STORAGE_KEY = 'suivi-conformite:v1'
const ComplianceContext = createContext(null)

const readStorage = () => {
  let raw = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : données de démonstration.
  }
  if (!raw) return buildDemoData()
  const parsed = JSON.parse(raw)
  if (!parsed?.gaps || !parsed?.users) throw new Error('Données locales invalides')
  return parsed
}

const writeStorage = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

let toastSeq = 0

export function ComplianceProvider({ children }) {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [loadError, setLoadError] = useState(null)
  const [toasts, setToasts] = useState([])
  const stateRef = useRef(null)

  const notify = useCallback((message, tone = 'success') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

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
        setLoadError(e.message)
        setStatus('error')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => load(), [load])

  const commit = useCallback(
    (next) => {
      stateRef.current = next
      setState(next)
      if (!writeStorage(next)) notify('Stockage local plein : les dernières modifications ne seront pas conservées après rechargement.', 'warning')
    },
    [notify],
  )

  const currentUser = state?.users.find((u) => u.id === state.currentUserId) ?? null

  /** Exécute une action métier ; retourne { result } ou { error }. */
  const run = useCallback(
    (fn, ...args) => {
      const s = stateRef.current
      const user = s.users.find((u) => u.id === s.currentUserId)
      const out = fn(s, user, ...args)
      if (out.error) return out
      if (out.state !== s) commit(out.state)
      return out
    },
    [commit],
  )

  const api = useMemo(
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
      switchUser: (userId) => commit({ ...stateRef.current, currentUserId: userId }),
      resetDemo: () => {
        const fresh = { ...buildDemoData(), currentUserId: stateRef.current?.currentUserId ?? 'u1' }
        commit(fresh)
        setStatus('ready')
      },
      importData: (data) => {
        if (!data?.gaps || !data?.users || !data?.history) throw new Error('Fichier de sauvegarde invalide.')
        commit({ ...data, lastUpdated: new Date().toISOString() })
      },
      retry: load,
    }),
    [run, commit, load],
  )

  const value = {
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

export function useCompliance() {
  const ctx = useContext(ComplianceContext)
  if (!ctx) throw new Error('useCompliance doit être utilisé dans <ComplianceProvider>')
  return ctx
}

export const userName = (state, id) => state?.users.find((u) => u.id === id)?.name ?? '—'
