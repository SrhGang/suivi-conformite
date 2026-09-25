import { CRITICALITY_BY_ID, CRITICALITIES } from '../data/constants.js'
import { ISO_CONTROLS, THEMES, themeOfControls } from '../data/isoControls.js'
import { addMonths, diffDays, today } from './dates.js'

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
}

export const averageProgress = (remediations) => {
  if (!remediations.length) return 0
  return Math.round(remediations.reduce((s, r) => s + (r.progress ?? 0), 0) / remediations.length)
}

export const gapProgress = (gap, remediations = []) => {
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

export const activeGaps = (gaps) => gaps.filter((g) => !g.archived)
export const isOpen = (gap) => gap.status !== 'validee'

/**
 * Score pondéré par criticité : Σ(poids × avancement) / Σ(poids).
 * Critique ×4, Haute ×3, Moyenne ×2, Basse ×1. 100 % si aucune lacune.
 */
export const weightedScore = (gaps, remediations) => {
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

export const themeOfGap = (gap) => themeOfControls(gap.controlIds)

export const scoreByTheme = (gaps, remediations) =>
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
export const conformControls = (gaps) => {
  const nonConform = new Set(activeGaps(gaps).filter(isOpen).flatMap((g) => g.controlIds))
  return {
    conform: ISO_CONTROLS.length - nonConform.size,
    total: ISO_CONTROLS.length,
    nonConform,
  }
}

export const conformThemes = (gaps) => {
  const byTheme = scoreByTheme(gaps, [])
  return { conform: byTheme.filter((t) => t.open === 0).length, total: THEMES.length }
}

export const isGapOverdue = (gap, ref = today()) =>
  !gap.archived && isOpen(gap) && gap.dueDate && diffDays(gap.dueDate, ref) < 0

export const isRemediationOverdue = (r, ref = today()) =>
  r.status !== 'valide' && r.targetDate && diffDays(r.targetDate, ref) < 0

export const reviewIntervalMonths = (gap) => CRITICALITY_BY_ID[gap.criticality]?.reviewMonths ?? 12

export const nextReviewFrom = (gap, fromDate) => addMonths(fromDate, reviewIntervalMonths(gap))

/** Revue périodique due (ou due dans `withinDays` jours) pour une lacune validée. */
export const isReviewDue = (gap, ref = today(), withinDays = 0) =>
  !gap.archived && gap.status === 'validee' && gap.nextReviewDate && diffDays(gap.nextReviewDate, ref) <= withinDays

export const countByCriticality = (gaps) =>
  Object.fromEntries(CRITICALITIES.map((c) => [c.id, gaps.filter((g) => g.criticality === c.id).length]))

/** Vérifie qu'une lacune peut passer à « Validée ». Retourne la liste des blocages. */
export const validationBlockers = (gap, evidence, user) => {
  const blockers = []
  if (user?.role !== 'responsable') blockers.push('Seul un responsable validant peut valider une lacune.')
  if (!evidence.some((e) => e.gapId === gap.id)) blockers.push('Au moins une preuve de conformité doit être jointe.')
  return blockers
}

/** Alertes prioritaires : lacunes critiques ouvertes, retards, revues dues. */
export const priorityAlerts = (gaps, remediations, ref = today()) => {
  const alerts = []
  const rank = (g) => CRITICALITY_BY_ID[g.criticality]?.weight ?? 0
  for (const g of activeGaps(gaps)) {
    if (isGapOverdue(g, ref)) {
      alerts.push({ kind: 'overdue', gap: g, severity: rank(g) + 10, message: `Échéance dépassée de ${-diffDays(g.dueDate, ref)} j` })
    } else if (isOpen(g) && g.criticality === 'critique') {
      alerts.push({ kind: 'critical', gap: g, severity: rank(g) + 5, message: 'Lacune critique non validée' })
    }
    if (isReviewDue(g, ref, 14)) {
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
