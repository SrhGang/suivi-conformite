/**
 * Logique métier pure : chaque action reçoit (state, user, payload) et retourne
 * un `ActionResult` : `{ ok: true, state, result }` ou `{ ok: false, error }`.
 * Aucune dépendance à React : testable seule.
 */
import { CRITICALITY_BY_ID, GAP_STATUS_BY_ID, REMEDIATION_STATUS_BY_ID } from '../data/constants'
import { controlLabel, suggestNis2 } from '../data/isoControls'
import { STARTER_DUE_MONTHS, STARTER_GAPS } from '../data/starterGaps'
import type {
  ActionResult,
  Asset,
  AssetImportItem,
  AssetImportResult,
  AssetInput,
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
  Settings,
  ReviewOutcome,
  User,
} from '../types'
import { nextReviewFrom, validationBlockers } from '../utils/compliance'
import { addMonths, formatDate, today } from '../utils/dates'

export const can = (user: User | null | undefined, permission: Permission): boolean => {
  const role = user?.role
  switch (permission) {
    case 'edit':
      return role === 'responsable' || role === 'contributeur'
    case 'validate':
    case 'archive':
    case 'review':
      return role === 'responsable'
    case 'admin':
      return user?.isAdmin === true
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

type TrackedField = 'title' | 'description' | 'controlIds' | 'nis2Refs' | 'anssiRef' | 'criticality' | 'impact' | 'dueDate' | 'assignee' | 'assetIds'

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
  assetIds: 'Actifs concernés',
}

const displayValue = (state: ComplianceState, field: TrackedField, value: Gap[TrackedField] | undefined): string => {
  if (value == null || value === '') return '(vide)'
  if (Array.isArray(value)) {
    if (!value.length) return '(vide)'
    if (field === 'controlIds') return value.map((c) => `A.${c}`).join(', ')
    if (field === 'assetIds') return value.map((id) => state.assets.find((a) => a.id === id)?.name ?? id).join(', ')
    return value.join(', ')
  }
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
    ...(input.assetIds?.length ? { assetIds: input.assetIds } : {}),
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

/** Confirme une lacune issue des données de départ : elle concerne bien l'organisme. */
export function confirmGap(state: ComplianceState, user: User, gapId: string): ActionResult<Gap> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de confirmer une lacune.')
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (!gap.toConfirm) return ok(state, gap)
  const { toConfirm: _, ...rest } = gap
  const updated: Gap = { ...rest, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, gaps: replaceGap(state, updated) }
  return ok(withHistory(next, user, gapId, 'Confirmation', 'Lacune de départ confirmée : elle concerne l’organisme.'), updated)
}

/**
 * Charge les lacunes de départ (première installation, administrateur).
 * Refusé si des lacunes existent déjà. Chaque lacune est créée « à confirmer ».
 */
export function loadStarterGaps(state: ComplianceState, user: User): ActionResult<number> {
  if (!can(user, 'admin')) return deny('Seul un administrateur peut charger les données de départ.')
  if (state.gaps.length) return deny('Des lacunes existent déjà : les données de départ ne peuvent être chargées que sur une base vide.')
  let next = state
  for (const s of STARTER_GAPS) {
    const [id, counters] = nextId(next, 'gap', 'GAP')
    const gap: Gap = {
      id,
      title: s.title,
      description: s.description,
      controlIds: s.controlIds,
      nis2Refs: s.nis2Refs ?? suggestNis2(s.controlIds),
      anssiRef: s.anssiRef,
      criticality: s.criticality,
      status: 'non_traitee',
      impact: s.impact,
      dueDate: addMonths(today(), STARTER_DUE_MONTHS[s.criticality]),
      createdAt: now(),
      createdBy: user.id,
      assignee: '',
      updatedAt: now(),
      updatedBy: user.id,
      archived: false,
      validation: null,
      nextReviewDate: null,
      reviews: [],
      toConfirm: true,
    }
    next = withHistory({ ...next, counters, gaps: [...next.gaps, gap] }, user, id, 'Création', 'Lacune de départ ajoutée à l’installation, à confirmer.')
  }
  return ok(next, STARTER_GAPS.length)
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
  next = withHistory(next, user, gapId, 'Remédiation ajoutée', `${id} : ${rem.title}`)
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
  return ok(withHistory(next, user, rem.gapId, 'Remédiation modifiée', `${remId} : ${parts.join(' ; ')}`), merged)
}

export function deleteRemediation(state: ComplianceState, user: User, remId: string): ActionResult<Remediation> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de supprimer une remédiation.')
  const rem = state.remediations.find((r) => r.id === remId)
  if (!rem) return deny('Remédiation introuvable.')
  const next = { ...state, remediations: state.remediations.filter((r) => r.id !== remId) }
  return ok(withHistory(next, user, rem.gapId, 'Remédiation supprimée', `${remId} : ${rem.title}`), rem)
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
/* Cartographie : actifs de l'infrastructure                           */
/* ------------------------------------------------------------------ */

export const validateAssetInput = (input: Partial<AssetInput>): FieldErrors => {
  const errors: FieldErrors = {}
  if (!input.name?.trim()) errors.name = 'Le nom est obligatoire.'
  if (!input.type) errors.type = 'Le type est obligatoire.'
  if (!input.zone) errors.zone = 'La zone est obligatoire.'
  if (!input.criticality) errors.criticality = 'La criticité est obligatoire.'
  return errors
}

/** Applique la réciprocité des liaisons : `asset` est relié exactement à `links`. */
const syncLinks = (assets: Asset[], assetId: string, links: string[]): Asset[] =>
  assets.map((a) => {
    if (a.id === assetId) return a
    const has = a.links.includes(assetId)
    const should = links.includes(a.id)
    if (has === should) return a
    return { ...a, links: should ? [...a.links, assetId] : a.links.filter((l) => l !== assetId) }
  })

const assetName = (state: ComplianceState, id: string) => state.assets.find((a) => a.id === id)?.name ?? id

export function createAsset(state: ComplianceState, user: User, input: AssetInput): ActionResult<Asset> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’ajouter un actif.')
  const errors = validateAssetInput(input)
  if (hasErrors(errors)) return deny('Formulaire incomplet.', { errors })
  const links = [...new Set(input.links ?? [])].filter((id) => state.assets.some((a) => a.id === id))
  const [id, counters] = nextId(state, 'asset', 'ACT')
  const asset: Asset = {
    id,
    name: input.name.trim(),
    type: input.type,
    role: input.role?.trim() ?? '',
    zone: input.zone,
    criticality: input.criticality,
    owner: input.owner ?? '',
    description: input.description?.trim() ?? '',
    links,
    position: null,
    createdAt: now(),
    createdBy: user.id,
    updatedAt: now(),
    updatedBy: user.id,
    archived: false,
  }
  const assets = syncLinks([...state.assets, asset], id, links)
  return ok(withHistory({ ...state, counters, assets }, user, null, 'Actif créé', `${id} : ${asset.name}`), asset)
}

const ASSET_FIELD_LABELS = { name: 'Nom', type: 'Type', role: 'Rôle', zone: 'Zone', criticality: 'Criticité', owner: 'Responsable', description: 'Description', links: 'Liaisons' }
type AssetField = keyof typeof ASSET_FIELD_LABELS

export function updateAsset(state: ComplianceState, user: User, assetId: string, changes: Partial<AssetInput>): ActionResult<Asset> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de modifier un actif.')
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return deny('Actif introuvable.')
  const links = changes.links ? [...new Set(changes.links)].filter((id) => id !== assetId && state.assets.some((a) => a.id === id)) : asset.links
  const merged: Asset = { ...asset, ...changes, links }
  const errors = validateAssetInput(merged)
  if (hasErrors(errors)) return deny('Formulaire incomplet.', { errors })
  const shown = (f: AssetField, v: unknown) => {
    if (f === 'links') return (v as string[]).map((id) => assetName(state, id)).join(', ') || '(vide)'
    if (f === 'owner') return state.users.find((u) => u.id === v)?.name ?? '(vide)'
    if (f === 'criticality') return CRITICALITY_BY_ID[v as Asset['criticality']]?.label ?? String(v)
    return String(v ?? '') || '(vide)'
  }
  const diffs = (Object.keys(ASSET_FIELD_LABELS) as AssetField[])
    .filter((f) => (f === 'links' ? 'links' in changes : f in changes) && JSON.stringify(merged[f]) !== JSON.stringify(asset[f]))
    .map((f) => `${ASSET_FIELD_LABELS[f]} : ${shown(f, asset[f])} → ${shown(f, merged[f])}`)
  if (!diffs.length) return ok(state, asset)
  const updated: Asset = { ...merged, name: merged.name.trim(), updatedAt: now(), updatedBy: user.id }
  const assets = syncLinks(state.assets.map((a) => (a.id === assetId ? updated : a)), assetId, links)
  return ok(withHistory({ ...state, assets }, user, null, 'Actif modifié', `${assetId} : ${diffs.join(' ; ')}`), updated)
}

/** Déplacement sur la carte : simple mise en page, non journalisée. */
export function moveAsset(state: ComplianceState, user: User, assetId: string, position: { x: number; y: number } | null): ActionResult<Asset> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas de réorganiser la carte.')
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return deny('Actif introuvable.')
  const moved: Asset = { ...asset, position: position && { x: Math.round(position.x), y: Math.round(position.y) } }
  return ok({ ...state, assets: state.assets.map((a) => (a.id === assetId ? moved : a)), lastUpdated: now() }, moved)
}

export function setAssetArchived(state: ComplianceState, user: User, assetId: string, archived: boolean): ActionResult<Asset> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’archiver un actif.')
  const asset = state.assets.find((a) => a.id === assetId)
  if (!asset) return deny('Actif introuvable.')
  if (asset.archived === archived) return ok(state, asset)
  const updated: Asset = { ...asset, archived, updatedAt: now(), updatedBy: user.id }
  const next = { ...state, assets: state.assets.map((a) => (a.id === assetId ? updated : a)) }
  return ok(withHistory(next, user, null, archived ? 'Actif archivé' : 'Actif restauré', `${assetId} : ${asset.name}`), updated)
}

/** Ajoute ou retire un actif de la liste des actifs concernés par une lacune. */
export function linkGapAsset(state: ComplianceState, user: User, gapId: string, assetId: string, linked: boolean): ActionResult<Gap> {
  const gap = state.gaps.find((g) => g.id === gapId)
  if (!gap) return deny('Lacune introuvable.')
  if (!state.assets.some((a) => a.id === assetId)) return deny('Actif introuvable.')
  const current = gap.assetIds ?? []
  const assetIds = linked ? [...new Set([...current, assetId])] : current.filter((id) => id !== assetId)
  return updateGap(state, user, gapId, { assetIds })
}

const sameName = (a: string, b: string) =>
  a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === b.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * Import d'actifs (CSV) en une seule opération : création, ou mise à jour des
 * actifs de même nom si `updateExisting`, puis ajout des liaisons données par
 * nom. Les liaisons existantes ne sont jamais retirées. Tout est refusé si une
 * ligne est invalide.
 */
export function importAssets(state: ComplianceState, user: User, items: AssetImportItem[], updateExisting: boolean): ActionResult<AssetImportResult> {
  if (!can(user, 'edit')) return deny('Votre rôle ne permet pas d’importer des actifs.')
  if (!items.length) return deny('Aucun actif à importer.')
  for (const [i, item] of items.entries()) {
    const errors = validateAssetInput(item)
    if (hasErrors(errors)) return deny(`Ligne ${i + 1} invalide : ${Object.values(errors).join(' ')}`)
    if (items.findIndex((x) => sameName(x.name, item.name)) !== i) return deny(`« ${item.name} » apparaît plusieurs fois dans l’import.`)
  }
  let assets = [...state.assets]
  let counters = state.counters
  const result: AssetImportResult = { created: 0, updated: 0, skipped: 0, unresolvedLinks: [] }
  const touched: string[] = []
  for (const item of items) {
    const existing = assets.find((a) => sameName(a.name, item.name))
    const fields = {
      name: item.name.trim(),
      type: item.type,
      role: item.role?.trim() ?? '',
      zone: item.zone,
      criticality: item.criticality,
      owner: item.owner ?? '',
      description: item.description?.trim() ?? '',
    }
    if (existing) {
      if (!updateExisting) {
        result.skipped++
        continue
      }
      assets = assets.map((a) => (a.id === existing.id ? { ...a, ...fields, updatedAt: now(), updatedBy: user.id } : a))
      touched.push(existing.id)
      result.updated++
    } else {
      const [id, next] = nextId({ ...state, counters }, 'asset', 'ACT')
      counters = next
      assets.push({ id, ...fields, links: [], position: null, createdAt: now(), createdBy: user.id, updatedAt: now(), updatedBy: user.id, archived: false })
      touched.push(id)
      result.created++
    }
  }
  // Liaisons par nom, réciproques, ajoutées aux liaisons existantes.
  for (const item of items) {
    const self = assets.find((a) => sameName(a.name, item.name))
    if (!self || !touched.includes(self.id)) continue
    for (const linkName of item.links) {
      const other = assets.find((a) => sameName(a.name, linkName))
      if (!other || other.id === self.id) {
        if (!other && !result.unresolvedLinks.includes(linkName)) result.unresolvedLinks.push(linkName)
        continue
      }
      assets = assets.map((a) =>
        a.id === self.id && !a.links.includes(other.id)
          ? { ...a, links: [...a.links, other.id] }
          : a.id === other.id && !a.links.includes(self.id)
            ? { ...a, links: [...a.links, self.id] }
            : a,
      )
    }
  }
  if (!result.created && !result.updated) return ok(state, result)
  const parts = [`${result.created} créé${result.created > 1 ? 's' : ''}`, `${result.updated} mis à jour`]
  if (result.skipped) parts.push(`${result.skipped} ignoré${result.skipped > 1 ? 's' : ''} (déjà présents)`)
  return ok(withHistory({ ...state, counters, assets }, user, null, 'Import d’actifs', `${parts.join(', ')}.`), result)
}

/** Active ou désactive les modules (administrateur). Désactiver ne supprime aucune donnée. */
export function setModules(state: ComplianceState, user: User, modules: Settings['modules']): ActionResult<Settings> {
  if (!can(user, 'admin')) return deny('Seul un administrateur peut choisir les modules.')
  if (state.settings.modules.cartographie === modules.cartographie) return ok(state, state.settings)
  const settings: Settings = { ...state.settings, modules: { ...state.settings.modules, ...modules } }
  const details = `Cartographie interactive ${modules.cartographie ? 'activée' : 'désactivée'}.`
  return ok(withHistory({ ...state, settings }, user, null, 'Modules modifiés', details), settings)
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function updateMilestones(state: ComplianceState, user: User, milestones: Milestone[]): ActionResult<Milestone[]> {
  if (!can(user, 'validate')) return deny('Seul un responsable validant peut modifier les jalons.')
  const details = milestones.map((m) => `${m.label} (${formatDate(m.date)}, ${m.target} %)`).join(' ; ')
  return ok(withHistory({ ...state, milestones }, user, null, 'Jalons modifiés', details), milestones)
}

export const describeControls = (ids: string[]): string => ids.map(controlLabel).join(' · ')
