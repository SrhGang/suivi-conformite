/**
 * Logique métier pure : chaque action reçoit (state, user, payload) et retourne
 * { state, result } ou { error }. Aucune dépendance à React : testable seule.
 */
import { CRITICALITY_BY_ID, GAP_STATUS_BY_ID, REMEDIATION_STATUS_BY_ID } from '../data/constants.js'
import { controlLabel, suggestNis2 } from '../data/isoControls.js'
import { nextReviewFrom, validationBlockers } from '../utils/compliance.js'
import { formatDate, today } from '../utils/dates.js'

export const can = (user, permission) => {
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

const pad = (n, len = 3) => String(n).padStart(len, '0')
const now = () => new Date().toISOString()

const nextId = (state, key, prefix, len = 3) => {
  const n = (state.counters[key] ?? 0) + 1
  return [`${prefix}-${pad(n, len)}`, { ...state.counters, [key]: n }]
}

const withHistory = (state, user, gapId, action, details) => {
  const [id, counters] = nextId(state, 'history', 'H', 4)
  return {
    ...state,
    counters,
    history: [...state.history, { id, gapId, date: now(), userId: user.id, action, details }],
    lastUpdated: now(),
  }
}

const deny = (message) => ({ error: message })

const GAP_FIELD_LABELS = {
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

const displayValue = (state, field, value) => {
  if (value == null || value === '') return '—'
  switch (field) {
    case 'criticality':
      return CRITICALITY_BY_ID[value]?.label ?? value
    case 'dueDate':
      return formatDate(value)
    case 'assignee':
      return state.users.find((u) => u.id === value)?.name ?? value
    case 'controlIds':
      return value.map((c) => `A.${c}`).join(', ')
    case 'nis2Refs':
      return value.join(', ')
    default:
      return String(value).length > 60 ? `${String(value).slice(0, 57)}…` : String(value)
  }
}

export const validateGapInput = (input) => {
  const errors = {}
  if (!input.title?.trim()) errors.title = 'Le titre est obligatoire.'
  if (!input.controlIds?.length) errors.controlIds = 'Sélectionnez au moins une mesure ISO 27001.'
  if (!input.criticality) errors.criticality = 'La criticité est obligatoire.'
  if (!input.dueDate) errors.dueDate = "L'échéance est obligatoire."
  return errors
}

/* ------------------------------------------------------------------ */
/* Lacunes                                                             */
/* ------------------------------------------------------------------ */

export function createGap(state, user, input) {
  if (!can(user, 'edit')) return deny("Votre rôle ne permet pas de créer une lacune.")
  const errors = validateGapInput(input)
  if (Object.keys(errors).length) return { error: 'Formulaire incomplet.', errors }
  const [id, counters] = nextId(state, 'gap', 'GAP')
  const gap = {
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
  return {
    state: withHistory(next, user, id, 'Création', `Lacune créée (criticité ${CRITICALITY_BY_ID[gap.criticality].label}).`),
    result: gap,
  }
}

export function updateGap(state, user, gapId, changes) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de modifier une lacune.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const merged = { ...gap, ...changes }
  const errors = validateGapInput(merged)
  if (Object.keys(errors).length) return { error: 'Formulaire incomplet.', errors }
  const diffs = Object.keys(GAP_FIELD_LABELS)
    .filter((f) => f in changes && JSON.stringify(changes[f]) !== JSON.stringify(gap[f]))
    .map((f) => `${GAP_FIELD_LABELS[f]} : ${displayValue(state, f, gap[f])} → ${displayValue(state, f, changes[f])}`)
  if (!diffs.length) return { state, result: gap }
  const updated = { ...merged, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, gaps: state.gaps.map((g) => (g.id === gapId ? updated : g)) }
  return { state: withHistory(next, user, gapId, 'Modification', diffs.join(' ; ')), result: updated }
}

export function changeGapStatus(state, user, gapId, status, comment = '') {
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (gap.status === status) return { state, result: gap }
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de changer le statut.')
  if (gap.archived) return deny('Une lacune archivée ne peut pas changer de statut.')
  if (gap.status === 'validee' && !can(user, 'validate'))
    return deny('Seul un responsable validant peut rouvrir une lacune validée.')

  let updated = { ...gap, status, updatedAt: now(), updatedBy: user.id }
  let action = 'Statut modifié'
  if (status === 'validee') {
    const blockers = validationBlockers(gap, state.evidence, user)
    if (blockers.length) return { error: blockers.join(' '), blockers }
    const date = today()
    updated = {
      ...updated,
      validation: { by: user.id, date: now(), comment },
      nextReviewDate: nextReviewFrom(gap, date),
    }
    action = 'Validation'
  } else if (gap.status === 'validee') {
    updated = { ...updated, validation: null, nextReviewDate: null }
    action = 'Réouverture'
  }
  const from = GAP_STATUS_BY_ID[gap.status].label
  const to = GAP_STATUS_BY_ID[status].label
  const next = { ...state, gaps: state.gaps.map((g) => (g.id === gapId ? updated : g)) }
  return {
    state: withHistory(next, user, gapId, action, `${from} → ${to}${comment ? `. ${comment}` : ''}`),
    result: updated,
  }
}

export function duplicateGap(state, user, gapId) {
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const res = createGap(state, user, { ...gap, title: `${gap.title} (copie)` })
  if (res.error) return res
  return {
    state: withHistory(res.state, user, res.result.id, 'Duplication', `Copie de ${gap.id}.`),
    result: res.result,
  }
}

export function setArchived(state, user, gapId, archived, reason = '') {
  if (!can(user, 'archive')) return deny('Seul un responsable validant peut archiver ou restaurer une lacune.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const updated = { ...gap, archived, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, gaps: state.gaps.map((g) => (g.id === gapId ? updated : g)) }
  return {
    state: withHistory(next, user, gapId, archived ? 'Archivage' : 'Restauration', reason || (archived ? 'Lacune archivée.' : 'Lacune restaurée.')),
    result: updated,
  }
}

export function performReview(state, user, gapId, outcome, comment = '') {
  if (!can(user, 'review')) return deny('Seul un responsable validant peut effectuer une revue périodique.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (gap.status !== 'validee') return deny('Seules les lacunes validées font l’objet d’une revue périodique.')
  const [reviewId, counters] = nextId(state, 'review', 'REV')
  const review = { id: reviewId, date: now(), by: user.id, outcome, comment }
  let updated = { ...gap, reviews: [...gap.reviews, review], updatedAt: now(), updatedBy: user.id }
  let details
  if (outcome === 'conforme') {
    updated.nextReviewDate = nextReviewFrom(gap, today())
    details = `Toujours conforme. Prochaine revue le ${formatDate(updated.nextReviewDate)}.`
  } else {
    updated = { ...updated, status: 'en_cours', validation: null, nextReviewDate: null }
    details = 'Non conforme : lacune rouverte (Validée → En cours).'
  }
  const next = { ...state, counters, gaps: state.gaps.map((g) => (g.id === gapId ? updated : g)) }
  return { state: withHistory(next, user, gapId, 'Revue périodique', `${details}${comment ? ` ${comment}` : ''}`), result: updated }
}

/* ------------------------------------------------------------------ */
/* Remédiations                                                        */
/* ------------------------------------------------------------------ */

export const validateRemediationInput = (input) => {
  const errors = {}
  if (!input.title?.trim()) errors.title = 'Le titre est obligatoire.'
  if (!input.type) errors.type = 'Le type est obligatoire.'
  if (!input.targetDate) errors.targetDate = 'La date cible est obligatoire.'
  if (input.startDate && input.targetDate && input.startDate > input.targetDate)
    errors.targetDate = 'La date cible doit être postérieure à la date de début.'
  const p = Number(input.progress)
  if (Number.isNaN(p) || p < 0 || p > 100) errors.progress = "L'avancement doit être compris entre 0 et 100."
  return errors
}

const normalizeRemediation = (r) => {
  let { status, progress } = r
  progress = Math.round(Number(progress) || 0)
  if (status === 'valide') progress = 100
  else if (progress === 100 && status !== 'bloque') status = 'valide'
  else if (status === 'a_faire' && progress > 0) status = 'en_cours'
  return { ...r, status, progress }
}

export function addRemediation(state, user, gapId, input) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’ajouter une remédiation.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  const errors = validateRemediationInput(input)
  if (Object.keys(errors).length) return { error: 'Formulaire incomplet.', errors }
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
  let next = { ...state, counters, remediations: [...state.remediations, rem] }
  next = withHistory(next, user, gapId, 'Remédiation ajoutée', `${id} — ${rem.title}`)
  // Démarrer une remédiation fait passer une lacune « Non traitée » à « En cours ».
  if (gap.status === 'non_traitee') {
    const r = changeGapStatus(next, user, gapId, 'en_cours', 'Passage automatique : remédiation planifiée.')
    if (!r.error) next = r.state
  }
  return { state: next, result: rem }
}

export function updateRemediation(state, user, remId, changes) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de modifier une remédiation.')
  const rem = state.remediations.find((r) => r.id === remId)
  if (!rem) return deny('Remédiation introuvable.')
  const merged = normalizeRemediation({ ...rem, ...changes })
  const errors = validateRemediationInput(merged)
  if (Object.keys(errors).length) return { error: Object.values(errors)[0], errors }
  const parts = []
  if (merged.status !== rem.status)
    parts.push(`Statut : ${REMEDIATION_STATUS_BY_ID[rem.status].label} → ${REMEDIATION_STATUS_BY_ID[merged.status].label}`)
  if (merged.progress !== rem.progress) parts.push(`Avancement : ${rem.progress} % → ${merged.progress} %`)
  if (merged.startDate !== rem.startDate) parts.push(`Début : ${formatDate(rem.startDate)} → ${formatDate(merged.startDate)}`)
  if (merged.targetDate !== rem.targetDate) parts.push(`Date cible : ${formatDate(rem.targetDate)} → ${formatDate(merged.targetDate)}`)
  if (merged.title !== rem.title) parts.push(`Titre : ${merged.title}`)
  if (merged.owner !== rem.owner) parts.push(`Responsable : ${state.users.find((u) => u.id === merged.owner)?.name ?? merged.owner}`)
  if (merged.type !== rem.type || merged.description !== rem.description) parts.push('Détails mis à jour')
  if (!parts.length) return { state, result: rem }
  const next = { ...state, remediations: state.remediations.map((r) => (r.id === remId ? merged : r)) }
  return { state: withHistory(next, user, rem.gapId, 'Remédiation modifiée', `${remId} — ${parts.join(' ; ')}`), result: merged }
}

export function deleteRemediation(state, user, remId) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de supprimer une remédiation.')
  const rem = state.remediations.find((r) => r.id === remId)
  if (!rem) return deny('Remédiation introuvable.')
  const next = { ...state, remediations: state.remediations.filter((r) => r.id !== remId) }
  return { state: withHistory(next, user, rem.gapId, 'Remédiation supprimée', `${remId} — ${rem.title}`), result: rem }
}

/* ------------------------------------------------------------------ */
/* Preuves                                                             */
/* ------------------------------------------------------------------ */

export function addEvidence(state, user, gapId, input) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’ajouter une preuve.')
  if (!state.gaps.some((g) => g.id === gapId)) return deny('Lacune introuvable.')
  if (!input.name?.trim()) return deny('Le nom de la preuve est obligatoire.')
  if (!input.dataUrl && !input.url && !input.size) return deny('Joignez un fichier ou indiquez un lien.')
  const [id, counters] = nextId(state, 'evidence', 'PRV')
  const ev = {
    id,
    gapId,
    name: input.name.trim(),
    type: input.type ?? 'autre',
    size: input.size ?? null,
    url: input.url?.trim() || null,
    dataUrl: input.dataUrl ?? null,
    uploadedAt: now(),
    uploadedBy: user.id,
  }
  const next = { ...state, counters, evidence: [...state.evidence, ev] }
  return { state: withHistory(next, user, gapId, 'Preuve ajoutée', ev.name), result: ev }
}

export function removeEvidence(state, user, evId) {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de retirer une preuve.')
  const ev = state.evidence.find((e) => e.id === evId)
  if (!ev) return deny('Preuve introuvable.')
  const gap = state.gaps.find((g) => g.id === ev.gapId)
  const remaining = state.evidence.filter((e) => e.gapId === ev.gapId && e.id !== evId)
  if (gap?.status === 'validee' && !remaining.length)
    return deny('Impossible de retirer la dernière preuve d’une lacune validée. Rouvrez la lacune au préalable.')
  const next = { ...state, evidence: state.evidence.filter((e) => e.id !== evId) }
  return { state: withHistory(next, user, ev.gapId, 'Preuve retirée', ev.name), result: ev }
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function updateMilestones(state, user, milestones) {
  if (!can(user, 'admin')) return deny('Seul un responsable validant peut modifier les jalons.')
  return { state: withHistory({ ...state, milestones }, user, null, 'Jalons modifiés', milestones.map((m) => `${m.label} (${formatDate(m.date)}, ${m.target} %)`).join(' ; ')) }
}

export const describeControls = (ids) => ids.map(controlLabel).join(' · ')
