import { CRITICALITIES, CRITICALITY_BY_ID } from '../data/constants'
import { ISO_CONTROLS, THEMES, themeOfControls } from '../data/isoControls'
import type { CriticalityId, Evidence, Gap, ISODate, Remediation, Theme, ThemeId, User } from '../types'
import { addMonths, diffDays, today } from './dates'

/**
 * Avancement d'une lacune (0-100) selon son statut :
 *  - Non traitée : 0
 *  - En cours    : avancement moyen des remédiations, borné entre 10 et 75
 *  - Corrigée    : 80 (correction faite, en attente de preuve / validation)
 *  - Validée     : 100
 */
export const GAP_PROGRESS_RULES = {
  non_traitee: 0,
  en_cours_min: 10,
  en_cours_max: 75,
  corrigee: 80,
  validee: 100,
} as const

export const averageProgress = (remediations: Remediation[]): number => {
  if (!remediations.length) return 0
  return Math.round(remediations.reduce((s, r) => s + (r.progress ?? 0), 0) / remediations.length)
}

export const gapProgress = (gap: Gap, remediations: Remediation[] = []): number => {
  switch (gap.status) {
    case 'validee':
      return GAP_PROGRESS_RULES.validee
    case 'corrigee':
      return GAP_PROGRESS_RULES.corrigee
    case 'en_cours': {
      const own = remediations.filter((r) => r.gapId === gap.id)
      const avg = averageProgress(own)
      return Math.min(GAP_PROGRESS_RULES.en_cours_max, Math.max(GAP_PROGRESS_RULES.en_cours_min, avg))
    }
    default:
      return GAP_PROGRESS_RULES.non_traitee
  }
}

export const activeGaps = (gaps: Gap[]): Gap[] => gaps.filter((g) => !g.archived)
export const isOpen = (gap: Gap): boolean => gap.status !== 'validee'

/**
 * Score pondéré par criticité : Σ(poids × avancement) / Σ(poids).
 * Critique ×4, Haute ×3, Moyenne ×2, Basse ×1. 100 % si aucune lacune.
 */
export const weightedScore = (gaps: Gap[], remediations: Remediation[]): number => {
  const list = activeGaps(gaps)
  if (!list.length) return 100
  let num = 0
  let den = 0
  for (const g of list) {
    const w = CRITICALITY_BY_ID[g.criticality]?.weight ?? 1
    num += w * gapProgress(g, remediations)
    den += w
  }
  return Math.round(num / den)
}

export const themeOfGap = (gap: Gap): ThemeId => themeOfControls(gap.controlIds)

export interface ThemeScore extends Theme {
  score: number
  total: number
  open: number
}

export const scoreByTheme = (gaps: Gap[], remediations: Remediation[]): ThemeScore[] =>
  THEMES.map((t) => {
    const list = activeGaps(gaps).filter((g) => themeOfGap(g) === t.id)
    return {
      ...t,
      score: weightedScore(list, remediations),
      total: list.length,
      open: list.filter(isOpen).length,
    }
  })

/** Mesures ISO sans lacune ouverte (hypothèse de l'analyse d'écart). */
export const conformControls = (gaps: Gap[]) => {
  const nonConform = new Set(activeGaps(gaps).filter(isOpen).flatMap((g) => g.controlIds))
  return {
    conform: ISO_CONTROLS.length - nonConform.size,
    total: ISO_CONTROLS.length,
    nonConform,
  }
}

export const conformThemes = (gaps: Gap[]) => {
  const byTheme = scoreByTheme(gaps, [])
  return { conform: byTheme.filter((t) => t.open === 0).length, total: THEMES.length }
}

export const isGapOverdue = (gap: Gap, ref: ISODate = today()): boolean =>
  !gap.archived && isOpen(gap) && !!gap.dueDate && diffDays(gap.dueDate, ref) < 0

export const isRemediationOverdue = (r: Remediation, ref: ISODate = today()): boolean =>
  r.status !== 'valide' && !!r.targetDate && diffDays(r.targetDate, ref) < 0

export const reviewIntervalMonths = (gap: Gap): number => CRITICALITY_BY_ID[gap.criticality]?.reviewMonths ?? 12

export const nextReviewFrom = (gap: Gap, fromDate: ISODate): ISODate => addMonths(fromDate, reviewIntervalMonths(gap))

/** Revue périodique due (ou due dans `withinDays` jours) pour une lacune validée. */
export const isReviewDue = (gap: Gap, ref: ISODate = today(), withinDays = 0): boolean =>
  !gap.archived && gap.status === 'validee' && !!gap.nextReviewDate && diffDays(gap.nextReviewDate, ref) <= withinDays

export const countByCriticality = (gaps: Gap[]): Record<CriticalityId, number> =>
  Object.fromEntries(CRITICALITIES.map((c) => [c.id, gaps.filter((g) => g.criticality === c.id).length])) as Record<
    CriticalityId,
    number
  >

/** Vérifie qu'une lacune peut passer à « Validée ». Retourne la liste des blocages. */
export const validationBlockers = (gap: Gap, evidence: Evidence[], user: User | null | undefined): string[] => {
  const blockers: string[] = []
  if (user?.role !== 'responsable') blockers.push('Seul un responsable validant peut valider une lacune.')
  if (!evidence.some((e) => e.gapId === gap.id)) blockers.push('Au moins une preuve de conformité doit être jointe.')
  return blockers
}

export type AlertKind = 'overdue' | 'critical' | 'review' | 'remediation'

export interface PriorityAlert {
  kind: AlertKind
  gap: Gap
  remediation?: Remediation
  severity: number
  message: string
}

/** Alertes prioritaires : lacunes critiques ouvertes, retards, revues dues. */
export const priorityAlerts = (gaps: Gap[], remediations: Remediation[], ref: ISODate = today()): PriorityAlert[] => {
  const alerts: PriorityAlert[] = []
  const rank = (g: Gap) => CRITICALITY_BY_ID[g.criticality]?.weight ?? 0
  for (const g of activeGaps(gaps)) {
    if (isGapOverdue(g, ref)) {
      alerts.push({ kind: 'overdue', gap: g, severity: rank(g) + 10, message: `Échéance dépassée de ${-diffDays(g.dueDate, ref)} j` })
    } else if (isOpen(g) && g.criticality === 'critique') {
      alerts.push({ kind: 'critical', gap: g, severity: rank(g) + 5, message: 'Lacune critique non validée' })
    }
    if (g.nextReviewDate && isReviewDue(g, ref, 14)) {
      const n = diffDays(g.nextReviewDate, ref)
      alerts.push({
        kind: 'review',
        gap: g,
        severity: rank(g) + (n <= 0 ? 8 : 2),
        message: n <= 0 ? `Revue périodique due depuis ${-n} j` : `Revue périodique dans ${n} j`,
      })
    }
  }
  for (const r of remediations) {
    if (isRemediationOverdue(r, ref)) {
      const g = gaps.find((x) => x.id === r.gapId)
      if (g && !g.archived) {
        alerts.push({
          kind: 'remediation',
          gap: g,
          remediation: r,
          severity: rank(g) + 6,
          message: `${r.id} en retard de ${-diffDays(r.targetDate, ref)} j`,
        })
      }
    }
  }
  return alerts.sort((a, b) => b.severity - a.severity)
}
