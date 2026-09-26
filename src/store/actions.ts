/**
 * Logique métier pure : chaque action reçoit (state, user, payload) et retourne
 * un `ActionResult` — `{ ok: true, state, result }` ou `{ ok: false, error }`.
 * Aucune dépendance à React : testable seule.
 */
import { CRITICALITY_BY_ID, GAP_STATUS_BY_ID, REMEDIATION_STATUS_BY_ID } from '../data/constants'
import { controlLabel, suggestNis2 } from '../data/isoControls'
import type {
  ActionResult,
  ComplianceState,
  Counters,
  Evidence,
  EvidenceInput,
  FieldErrors,
  Gap,
  GapInput,
  GapStatusId,
  Milestone,
  Permission,
  Remediation,
  RemediationInput,
  Review,
  ReviewOutcome,
  User,
} from '../types'
import { nextReviewFrom, validationBlockers } from '../utils/compliance'
import { formatDate, today } from '../utils/dates'

export const can = (user: User | null | undefined, permission: Permission): boolean => {
  const role = user?.role
  switch (permission) {
    case 'edit':
      return role === 'responsable' || role === 'contributeur'
    case 'validate':
    case 'archive':
    case 'review':
    case 'admin':
      return role === 'responsable'
    default:
      return false
  }
}

const pad = (n: number, len = 3) => String(n).padStart(len, '0')
const now = () => new Date().toISOString()

const nextId = (state: ComplianceState, key: keyof Counters, prefix: string, len = 3): [string, Counters] => {
  const n = (state.counters[key] ?? 0) + 1
  return [`${prefix}-${pad(n, len)}`, { ...state.counters, [key]: n }]
}

const withHistory = (
  state: ComplianceState,
  user: User,
  gapId: string | null,
  action: string,
  details: string,
): ComplianceState => {
  const [id, counters] = nextId(state, 'history', 'H', 4)
  return {
    ...state,
    counters,
    history: [...state.history, { id, gapId, date: now(), userId: user.id, action, details }],
    lastUpdated: now(),
  }
}

const ok = <T>(state: ComplianceState, result: T): ActionResult<T> => ({ ok: true, state, result })
const deny = (error: string, extra: { errors?: FieldErrors; blockers?: string[] } = {}): ActionResult<never> => ({
  ok: false,
  error,
  ...extra,
})

const replaceGap = (state: ComplianceState, updated: Gap): Gap[] =>
  state.gaps.map((g) => (g.id === updated.id ? updated : g))

type TrackedField = 'title' | 'description' | 'controlIds' | 'nis2Refs' | 'anssiRef' | 'criticality' | 'impact' | 'dueDate' | 'assignee'

const GAP_FIELD_LABELS: Record<TrackedField, string> = {
  title: 'Titre',
  description: 'Description',
  controlIds: 'Mesures ISO',
  nis2Refs: 'Exigences NIS2',
  anssiRef: 'Référence ANSSI',
  criticality: 'Criticité',
  impact: 'Impact',
  dueDate: 'Échéance',
  assignee: 'Assigné à',
}

const displayValue = (state: ComplianceState, field: TrackedField, value: Gap[TrackedField] | undefined): string => {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return field === 'controlIds' ? value.map((c) => `A.${c}`).join(', ') : value.join(', ')
  switch (field) {
    case 'criticality':
      return CRITICALITY_BY_ID[value as Gap['criticality']]?.label ?? value
    case 'dueDate':
      return formatDate(value)
    case 'assignee':
      return state.users.find((u) => u.id === value)?.name ?? value
    default:
      return value.length > 60 ? `${value.slice(0, 57)}…` : value
  }
}

export const validateGapInput = (input: Partial<GapInput>): FieldErrors => {
  const errors: FieldErrors = {}
  if (!input.title?.trim()) errors.title = 'Le titre est obligatoire.'
  if (!input.controlIds?.length) errors.controlIds = 'Sélectionnez au moins une mesure ISO 27001.'
  if (!input.criticality) errors.criticality = 'La criticité est obligatoire.'
  if (!input.dueDate) errors.dueDate = "L'échéance est obligatoire."
  return errors
}

const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0

/* ------------------------------------------------------------------ */
/* Lacunes                                                             */
/* ------------------------------------------------------------------ */

export function createGap(state: ComplianceState, user: User, input: GapInput): ActionResult<Gap> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de créer une lacune.')
  const errors = validateGapInput(input)
  if (hasErrors(errors)) return deny('Formulaire incomplet.', { errors })
  const [id, counters] = nextId(state, 'gap', 'GAP')
  const gap: Gap = {
    id,
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    controlIds: input.controlIds,
    nis2Refs: input.nis2Refs?.length ? input.nis2Refs : suggestNis2(input.controlIds),
    anssiRef: input.anssiRef?.trim() ?? '',
    criticality: input.criticality,
    status: 'non_traitee',
    impact: input.impact?.trim() ?? '',
    dueDate: input.dueDate,
    createdAt: now(),
    createdBy: user.id,
    assignee: input.assignee || user.id,
    updatedAt: now(),
    updatedBy: user.id,
    archived: false,
    validation: null,
    nextReviewDate: null,
    reviews: [],
  }
  const next = { ...state, counters, gaps: [...state.gaps, gap] }
  return ok(withHistory(next, user, id, 'Création', `Lacune créée (criticité ${CRITICALITY_BY_ID[gap.criticality].label}).`), gap)
}

export function updateGap(state: ComplianceState, user: User, gapId: string, changes: Partial<GapInput>): ActionResult<Gap> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de modifier une lacune.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const merged: Gap = { ...gap, ...changes }
  const errors = validateGapInput(merged)
  if (hasErrors(errors)) return deny('Formulaire incomplet.', { errors })
  const fields = Object.keys(GAP_FIELD_LABELS) as TrackedField[]
  const diffs = fields
    .filter((f) => f in changes && JSON.stringify(changes[f]) !== JSON.stringify(gap[f]))
    .map((f) => `${GAP_FIELD_LABELS[f]} : ${displayValue(state, f, gap[f])} → ${displayValue(state, f, merged[f])}`)
  if (!diffs.length) return ok(state, gap)
  const updated: Gap = { ...merged, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, gaps: replaceGap(state, updated) }
  return ok(withHistory(next, user, gapId, 'Modification', diffs.join(' ; ')), updated)
}

export function changeGapStatus(
  state: ComplianceState,
  user: User,
  gapId: string,
  status: GapStatusId,
  comment = '',
): ActionResult<Gap> {
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (gap.status === status) return ok(state, gap)
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de changer le statut.')
  if (gap.archived) return deny('Une lacune archivée ne peut pas changer de statut.')
  if (gap.status === 'validee' && !can(user, 'validate'))
    return deny('Seul un responsable validant peut rouvrir une lacune validée.')

  let updated: Gap = { ...gap, status, updatedAt: now(), updatedBy: user.id }
  let action = 'Statut modifié'
  if (status === 'validee') {
    const blockers = validationBlockers(gap, state.evidence, user)
    if (blockers.length) return deny(blockers.join(' '), { blockers })
    updated = {
      ...updated,
      validation: { by: user.id, date: now(), comment },
      nextReviewDate: nextReviewFrom(gap, today()),
    }
    action = 'Validation'
  } else if (gap.status === 'validee') {
    updated = { ...updated, validation: null, nextReviewDate: null }
    action = 'Réouverture'
  }
  const from = GAP_STATUS_BY_ID[gap.status].label
  const to = GAP_STATUS_BY_ID[status].label
  const next = { ...state, gaps: replaceGap(state, updated) }
  return ok(withHistory(next, user, gapId, action, `${from} → ${to}${comment ? `. ${comment}` : ''}`), updated)
}

export function duplicateGap(state: ComplianceState, user: User, gapId: string): ActionResult<Gap> {
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const res = createGap(state, user, { ...gap, title: `${gap.title} (copie)` })
  if (!res.ok) return res
  return ok(withHistory(res.state, user, res.result.id, 'Duplication', `Copie de ${gap.id}.`), res.result)
}

export function setArchived(
  state: ComplianceState,
  user: User,
  gapId: string,
  archived: boolean,
  reason = '',
): ActionResult<Gap> {
  if (!can(user, 'archive')) return deny('Seul un responsable validant peut archiver ou restaurer une lacune.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const updated: Gap = { ...gap, archived, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, gaps: replaceGap(state, updated) }
  const details = reason || (archived ? 'Lacune archivée.' : 'Lacune restaurée.')
  return ok(withHistory(next, user, gapId, archived ? 'Archivage' : 'Restauration', details), updated)
}

export function performReview(
  state: ComplianceState,
  user: User,
  gapId: string,
  outcome: ReviewOutcome,
  comment = '',
): ActionResult<Gap> {
  if (!can(user, 'review')) return deny('Seul un responsable validant peut effectuer une revue périodique.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (gap.status !== 'validee') return deny('Seules les lacunes validées font l’objet d’une revue périodique.')
  const [reviewId, counters] = nextId(state, 'review', 'REV')
  const review: Review = { id: reviewId, date: now(), by: user.id, outcome, comment }
  let updated: Gap = { ...gap, reviews: [...gap.reviews, review], updatedAt: now(), updatedBy: user.id }
  let details: string
  if (outcome === 'conforme') {
    updated.nextReviewDate = nextReviewFrom(gap, today())
    details = `Toujours conforme. Prochaine revue le ${formatDate(updated.nextReviewDate)}.`
  } else {
    updated = { ...updated, status: 'en_cours', validation: null, nextReviewDate: null }
    details = 'Non conforme : lacune rouverte (Validée → En cours).'
  }
  const next = { ...state, counters, gaps: replaceGap(state, updated) }
  return ok(withHistory(next, user, gapId, 'Revue périodique', `${details}${comment ? ` ${comment}` : ''}`), updated)
}

/* ------------------------------------------------------------------ */
/* Remédiations                                                        */
/* ------------------------------------------------------------------ */

export const validateRemediationInput = (input: Partial<RemediationInput>): FieldErrors => {
  const errors: FieldErrors = {}
  if (!input.title?.trim()) errors.title = 'Le titre est obligatoire.'
  if (!input.type) errors.type = 'Le type est obligatoire.'
  if (!input.targetDate) errors.targetDate = 'La date cible est obligatoire.'
  if (input.startDate && input.targetDate && input.startDate > input.targetDate)
    errors.targetDate = 'La date cible doit être postérieure à la date de début.'
  const p = Number(input.progress ?? 0)
  if (Number.isNaN(p) || p < 0 || p > 100) errors.progress = "L'avancement doit être compris entre 0 et 100."
  return errors
}

/** Cohérence statut ↔ avancement : « Validé » = 100 %, 100 % = « Validé », etc. */
const normalizeRemediation = (r: Remediation): Remediation => {
  let { status } = r
  let progress = Math.round(Number(r.progress) || 0)
  if (status === 'valide') progress = 100
  else if (progress === 100 && status !== 'bloque') status = 'valide'
  else if (status === 'a_faire' && progress > 0) status = 'en_cours'
  return { ...r, status, progress }
}

export function addRemediation(
  state: ComplianceState,
  user: User,
  gapId: string,
  input: RemediationInput,
): ActionResult<Remediation> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’ajouter une remédiation.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const errors = validateRemediationInput(input)
  if (hasErrors(errors)) return deny('Formulaire incomplet.', { errors })
  const [id, counters] = nextId(state, 'remediation', 'IMP')
  const rem = normalizeRemediation({
    id,
    gapId,
    title: input.title.trim(),
    type: input.type,
    status: input.status ?? 'a_faire',
    progress: input.progress ?? 0,
    startDate: input.startDate || today(),
    targetDate: input.targetDate,
    owner: input.owner || user.id,
    description: input.description?.trim() ?? '',
  })
  let next: ComplianceState = { ...state, counters, remediations: [...state.remediations, rem] }
  next = withHistory(next, user, gapId, 'Remédiation ajoutée', `${id} — ${rem.title}`)
  // Démarrer une remédiation fait passer une lacune « Non traitée » à « En cours ».
  if (gap.status === 'non_traitee') {
    const r = changeGapStatus(next, user, gapId, 'en_cours', 'Passage automatique : remédiation planifiée.')
    if (r.ok) next = r.state
  }
  return ok(next, rem)
}

export function updateRemediation(
  state: ComplianceState,
  user: User,
  remId: string,
  changes: Partial<RemediationInput>,
): ActionResult<Remediation> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de modifier une remédiation.')
  const rem = state.remediations.find((r) => r.id === remId)
  if (!rem) return deny('Remédiation introuvable.')
  const merged = normalizeRemediation({ ...rem, ...changes })
  const errors = validateRemediationInput(merged)
  if (hasErrors(errors)) return deny(Object.values(errors)[0] ?? 'Formulaire incomplet.', { errors })
  const parts: string[] = []
  if (merged.status !== rem.status)
    parts.push(`Statut : ${REMEDIATION_STATUS_BY_ID[rem.status].label} → ${REMEDIATION_STATUS_BY_ID[merged.status].label}`)
  if (merged.progress !== rem.progress) parts.push(`Avancement : ${rem.progress} % → ${merged.progress} %`)
  if (merged.startDate !== rem.startDate) parts.push(`Début : ${formatDate(rem.startDate)} → ${formatDate(merged.startDate)}`)
  if (merged.targetDate !== rem.targetDate) parts.push(`Date cible : ${formatDate(rem.targetDate)} → ${formatDate(merged.targetDate)}`)
  if (merged.title !== rem.title) parts.push(`Titre : ${merged.title}`)
  if (merged.owner !== rem.owner) parts.push(`Responsable : ${state.users.find((u) => u.id === merged.owner)?.name ?? merged.owner}`)
  if (merged.type !== rem.type || merged.description !== rem.description) parts.push('Détails mis à jour')
  if (!parts.length) return ok(state, rem)
  const next = { ...state, remediations: state.remediations.map((r) => (r.id === remId ? merged : r)) }
  return ok(withHistory(next, user, rem.gapId, 'Remédiation modifiée', `${remId} — ${parts.join(' ; ')}`), merged)
}

export function deleteRemediation(state: ComplianceState, user: User, remId: string): ActionResult<Remediation> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de supprimer une remédiation.')
  const rem = state.remediations.find((r) => r.id === remId)
  if (!rem) return deny('Remédiation introuvable.')
  const next = { ...state, remediations: state.remediations.filter((r) => r.id !== remId) }
  return ok(withHistory(next, user, rem.gapId, 'Remédiation supprimée', `${remId} — ${rem.title}`), rem)
}

/* ------------------------------------------------------------------ */
/* Preuves                                                             */
/* ------------------------------------------------------------------ */

export function addEvidence(state: ComplianceState, user: User, gapId: string, input: EvidenceInput): ActionResult<Evidence> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’ajouter une preuve.')
  if (!state.gaps.some((g) => g.id === gapId)) return deny('Lacune introuvable.')
  if (!input.name?.trim()) return deny('Le nom de la preuve est obligatoire.')
  if (!input.dataUrl && !input.url && !input.size && !input.fileKey) return deny('Joignez un fichier ou indiquez un lien.')
  const [id, counters] = nextId(state, 'evidence', 'PRV')
  const ev: Evidence = {
    id,
    gapId,
    name: input.name.trim(),
    type: input.type ?? 'autre',
    size: input.size ?? null,
    url: input.url?.trim() || null,
    dataUrl: input.dataUrl ?? null,
    ...(input.fileKey ? { fileKey: input.fileKey } : {}),
    uploadedAt: now(),
    uploadedBy: user.id,
  }
  const next = { ...state, counters, evidence: [...state.evidence, ev] }
  return ok(withHistory(next, user, gapId, 'Preuve ajoutée', ev.name), ev)
}

export function removeEvidence(state: ComplianceState, user: User, evId: string): ActionResult<Evidence> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de retirer une preuve.')
  const ev = state.evidence.find((e) => e.id === evId)
  if (!ev) return deny('Preuve introuvable.')
  const gap = state.gaps.find((g) => g.id === ev.gapId)
  const remaining = state.evidence.filter((e) => e.gapId === ev.gapId && e.id !== evId)
  if (gap?.status === 'validee' && !remaining.length)
    return deny('Impossible de retirer la dernière preuve d’une lacune validée. Rouvrez la lacune au préalable.')
  const next = { ...state, evidence: state.evidence.filter((e) => e.id !== evId) }
  return ok(withHistory(next, user, ev.gapId, 'Preuve retirée', ev.name), ev)
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function updateMilestones(state: ComplianceState, user: User, milestones: Milestone[]): ActionResult<Milestone[]> {
  if (!can(user, 'admin')) return deny('Seul un responsable validant peut modifier les jalons.')
  const details = milestones.map((m) => `${m.label} (${formatDate(m.date)}, ${m.target} %)`).join(' ; ')
  return ok(withHistory({ ...state, milestones }, user, null, 'Jalons modifiés', details), milestones)
}

export const describeControls = (ids: string[]): string => ids.map(controlLabel).join(' · ')
