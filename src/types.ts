/**
 * Modèle de données du suivi de conformité ISO 27001:2022 / NIS2-ANSSI.
 * Les identifiants métier (GAP-xxx, IMP-xxx, PRV-xxx, H-xxxx, REV-xxx)
 * sont des chaînes ; les dates « jour » sont au format AAAA-MM-JJ et les
 * horodatages au format ISO 8601.
 */

/** Date calendaire AAAA-MM-JJ. */
export type ISODate = string
/** Horodatage ISO 8601 complet. */
export type ISODateTime = string

export type ThemeId = 'org' | 'people' | 'physical' | 'tech'
export type Nis2Id =
  | '20'
  | '21.2.a'
  | '21.2.b'
  | '21.2.c'
  | '21.2.d'
  | '21.2.e'
  | '21.2.f'
  | '21.2.g'
  | '21.2.h'
  | '21.2.i'
  | '21.2.j'
  | '23'

export type CriticalityId = 'critique' | 'haute' | 'moyenne' | 'basse'
export type GapStatusId = 'non_traitee' | 'en_cours' | 'corrigee' | 'validee'
export type RemediationTypeId = 'bonne_pratique' | 'outil' | 'automatisation' | 'procedure' | 'formation'
export type RemediationStatusId = 'a_faire' | 'en_cours' | 'bloque' | 'valide'
export type EvidenceTypeId = 'capture' | 'certificat' | 'rapport' | 'procedure' | 'journal' | 'autre'
export type Role = 'responsable' | 'contributeur' | 'lecteur'
export type Permission = 'edit' | 'validate' | 'archive' | 'review' | 'admin'
export type ReviewOutcome = 'conforme' | 'non_conforme'

/** Ton visuel partagé par les badges et pastilles d'état. */
export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'error' | 'critical' | 'high' | 'medium' | 'low'

export interface Theme {
  id: ThemeId
  code: string
  label: string
  short: string
}

export interface IsoControl {
  id: string
  title: string
  theme: ThemeId
  nis2: Nis2Id[]
}

export interface Nis2Requirement {
  id: Nis2Id
  label: string
  description: string
}

export interface User {
  id: string
  name: string
  initials: string
  title: string
  role: Role
}

export interface Organization {
  name: string
  sector: string
}

export interface Validation {
  by: string
  date: ISODateTime
  comment: string
}

export interface Review {
  id: string
  date: ISODateTime
  by: string
  outcome: ReviewOutcome
  comment: string
}

export interface Gap {
  id: string
  title: string
  description: string
  controlIds: string[]
  nis2Refs: Nis2Id[]
  anssiRef: string
  criticality: CriticalityId
  status: GapStatusId
  impact: string
  dueDate: ISODate
  createdAt: ISODateTime
  createdBy: string
  assignee: string
  updatedAt: ISODateTime
  updatedBy: string
  archived: boolean
  validation: Validation | null
  nextReviewDate: ISODate | null
  reviews: Review[]
}

export interface Remediation {
  id: string
  gapId: string
  title: string
  type: RemediationTypeId
  status: RemediationStatusId
  progress: number
  startDate: ISODate
  targetDate: ISODate
  owner: string
  description: string
}

export interface Evidence {
  id: string
  gapId: string
  name: string
  type: EvidenceTypeId
  size: number | null
  url: string | null
  dataUrl: string | null
  /** Fichier stocké par le serveur (version production), téléchargeable via l'API. */
  fileKey?: string | null
  uploadedAt: ISODateTime
  uploadedBy: string
  demo?: boolean
}

export interface HistoryEntry {
  id: string
  gapId: string | null
  date: ISODateTime
  userId: string
  action: string
  details: string
}

export interface Milestone {
  id: string
  date: ISODate
  label: string
  target: number
}

export interface Counters {
  gap: number
  remediation: number
  evidence: number
  history: number
  review: number
}

export interface ComplianceState {
  version: number
  organization: Organization
  users: User[]
  currentUserId: string
  gaps: Gap[]
  remediations: Remediation[]
  evidence: Evidence[]
  history: HistoryEntry[]
  milestones: Milestone[]
  counters: Counters
  lastUpdated: ISODateTime
}

/** Saisie du formulaire de lacune (création ou modification). */
export interface GapInput {
  title: string
  description?: string
  controlIds: string[]
  nis2Refs?: Nis2Id[]
  anssiRef?: string
  criticality: CriticalityId
  impact?: string
  dueDate: ISODate
  assignee?: string
}

export interface RemediationInput {
  title: string
  type: RemediationTypeId
  status?: RemediationStatusId
  progress?: number
  startDate?: ISODate
  targetDate: ISODate
  owner?: string
  description?: string
}

export interface EvidenceInput {
  name: string
  type?: EvidenceTypeId
  size?: number | null
  url?: string | null
  dataUrl?: string | null
  fileKey?: string | null
}

export type FieldErrors = Partial<Record<string, string>>

/** Résultat d'une action métier : nouvel état + valeur, ou erreur. */
export type ActionResult<T = unknown> =
  | { ok: true; state: ComplianceState; result: T }
  | { ok: false; error: string; errors?: FieldErrors; blockers?: string[] }

/** Résultat renvoyé à l'interface (l'état est déjà enregistré). */
export type ApiResult<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string; errors?: FieldErrors; blockers?: string[] }
