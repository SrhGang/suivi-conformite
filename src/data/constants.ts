import type {
  CriticalityId,
  EvidenceTypeId,
  GapStatusId,
  RemediationStatusId,
  RemediationTypeId,
  Role,
  Tone,
} from '../types'

export interface Criticality {
  id: CriticalityId
  label: string
  /** Poids dans le score global pondéré. */
  weight: number
  tone: Tone
  /** Périodicité de la revue après validation, en mois. */
  reviewMonths: number
}

export interface Labelled<Id extends string> {
  id: Id
  label: string
}

export interface Toned<Id extends string> extends Labelled<Id> {
  tone: Tone
}

export const CRITICALITIES: Criticality[] = [
  { id: 'critique', label: 'Critique', weight: 4, tone: 'critical', reviewMonths: 3 },
  { id: 'haute', label: 'Haute', weight: 3, tone: 'high', reviewMonths: 6 },
  { id: 'moyenne', label: 'Moyenne', weight: 2, tone: 'medium', reviewMonths: 12 },
  { id: 'basse', label: 'Basse', weight: 1, tone: 'low', reviewMonths: 12 },
]

export const GAP_STATUSES: Toned<GapStatusId>[] = [
  { id: 'non_traitee', label: 'Non traitée', tone: 'neutral' },
  { id: 'en_cours', label: 'En cours', tone: 'info' },
  { id: 'corrigee', label: 'Corrigée', tone: 'warning' },
  { id: 'validee', label: 'Validée', tone: 'success' },
]

export const REMEDIATION_TYPES: Labelled<RemediationTypeId>[] = [
  { id: 'bonne_pratique', label: 'Bonne pratique' },
  { id: 'outil', label: 'Outil' },
  { id: 'automatisation', label: 'Automatisation' },
  { id: 'procedure', label: 'Procédure' },
  { id: 'formation', label: 'Formation' },
]

export const REMEDIATION_STATUSES: Toned<RemediationStatusId>[] = [
  { id: 'a_faire', label: 'À faire', tone: 'neutral' },
  { id: 'en_cours', label: 'En cours', tone: 'info' },
  { id: 'bloque', label: 'Bloqué', tone: 'error' },
  { id: 'valide', label: 'Validé', tone: 'success' },
]

export const EVIDENCE_TYPES: Labelled<EvidenceTypeId>[] = [
  { id: 'capture', label: "Capture d'écran" },
  { id: 'certificat', label: 'Certificat' },
  { id: 'rapport', label: "Rapport d'audit" },
  { id: 'procedure', label: 'Procédure / politique' },
  { id: 'journal', label: 'Extrait de journal' },
  { id: 'autre', label: 'Autre' },
]

export const ROLES: Record<Role, { label: string; description: string }> = {
  responsable: {
    label: 'Responsable validant',
    description: 'Tous les droits, y compris valider les lacunes, archiver et effectuer les revues périodiques.',
  },
  contributeur: {
    label: 'Contributeur',
    description: 'Crée et met à jour les lacunes, les remédiations et les preuves. Ne peut pas valider.',
  },
  lecteur: {
    label: 'Lecteur',
    description: 'Consultation et export uniquement.',
  },
}

export const PAGE_SIZE = 20

const index = <Id extends string, T extends { id: Id }>(list: T[]) =>
  Object.fromEntries(list.map((x) => [x.id, x])) as Record<Id, T>

export const CRITICALITY_BY_ID = index(CRITICALITIES)
export const GAP_STATUS_BY_ID = index(GAP_STATUSES)
export const REMEDIATION_TYPE_BY_ID = index(REMEDIATION_TYPES)
export const REMEDIATION_STATUS_BY_ID = index(REMEDIATION_STATUSES)
export const EVIDENCE_TYPE_BY_ID = index(EVIDENCE_TYPES)
