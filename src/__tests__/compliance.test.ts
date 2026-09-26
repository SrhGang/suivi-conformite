import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../data/demoData'
import { ISO_CONTROLS, THEMES } from '../data/isoControls'
import * as A from '../store/actions'
import type { ActionResult, ComplianceState, CriticalityId, Gap, GapStatusId, User } from '../types'
import { conformControls, gapProgress, isReviewDue, priorityAlerts, weightedScore } from '../utils/compliance'
import { addDays, today } from '../utils/dates'

const userById = (s: ComplianceState, id: string): User => {
  const u = s.users.find((x) => x.id === id)
  if (!u) throw new Error(`Utilisateur ${id} absent des données de démo`)
  return u
}
const reader = (s: ComplianceState): User => {
  const u = s.users.find((x) => x.role === 'lecteur')
  if (!u) throw new Error('Aucun lecteur dans les données de démo')
  return u
}

/** Vérifie qu'une action a réussi et renvoie son résultat typé. */
function expectOk<T>(res: ActionResult<T>): { state: ComplianceState; result: T } {
  if (!res.ok) throw new Error(`Action refusée : ${res.error}`)
  return res
}

/** Vérifie qu'une action a été refusée et renvoie le message d'erreur. */
function expectError<T>(res: ActionResult<T>): string {
  if (res.ok) throw new Error('Action acceptée alors qu’un refus était attendu')
  return res.error
}

/** Lacune minimale pour les calculs de score. */
const gap = (id: string, criticality: CriticalityId, status: GapStatusId, overrides: Partial<Gap> = {}): Gap => ({
  id,
  title: id,
  description: '',
  controlIds: ['5.1'],
  nis2Refs: [],
  anssiRef: '',
  criticality,
  status,
  impact: '',
  dueDate: today(),
  createdAt: new Date().toISOString(),
  createdBy: 'u1',
  assignee: 'u1',
  updatedAt: new Date().toISOString(),
  updatedBy: 'u1',
  archived: false,
  validation: null,
  nextReviewDate: null,
  reviews: [],
  ...overrides,
})

const remediation = (gapId: string, progress: number) => ({
  id: `IMP-${gapId}-${progress}`,
  gapId,
  title: 'Action',
  type: 'outil' as const,
  status: 'en_cours' as const,
  progress,
  startDate: today(),
  targetDate: today(),
  owner: 'u1',
  description: '',
})

describe('référentiel', () => {
  it('contient les 93 mesures ISO 27001:2022 réparties en 4 thèmes', () => {
    expect(ISO_CONTROLS).toHaveLength(93)
    expect(THEMES).toHaveLength(4)
    const counts = Object.fromEntries(THEMES.map((t) => [t.id, ISO_CONTROLS.filter((c) => c.theme === t.id).length]))
    expect(counts).toEqual({ org: 37, people: 8, physical: 14, tech: 34 })
    expect(new Set(ISO_CONTROLS.map((c) => c.id)).size).toBe(93)
  })
})

describe('score pondéré', () => {
  it('pondère par criticité (Critique ×4 … Basse ×1)', () => {
    const gaps = [gap('A', 'critique', 'validee'), gap('B', 'basse', 'non_traitee')]
    expect(weightedScore(gaps, [])).toBe(80) // (4×100 + 1×0) / 5
  })
  it('borne l’avancement « En cours » entre 10 et 75 %', () => {
    const g = gap('A', 'haute', 'en_cours')
    expect(gapProgress(g, [])).toBe(10)
    expect(gapProgress(g, [remediation('A', 100)])).toBe(75)
    expect(gapProgress(g, [remediation('A', 40), remediation('A', 60)])).toBe(50)
  })
  it('ignore les lacunes archivées et vaut 100 % sans lacune', () => {
    expect(weightedScore([gap('A', 'critique', 'non_traitee', { archived: true })], [])).toBe(100)
  })
  it('compte les mesures sans lacune ouverte', () => {
    const res = conformControls([gap('A', 'haute', 'en_cours'), gap('B', 'haute', 'validee', { controlIds: ['8.5'] })])
    expect(res.conform).toBe(92)
  })
})

describe('actions métier', () => {
  it('un lecteur ne peut rien modifier', () => {
    const s = buildDemoData()
    const err = expectError(A.createGap(s, reader(s), { title: 'x', controlIds: ['5.1'], criticality: 'haute', dueDate: today() }))
    expect(err).toMatch(/rôle/)
  })

  it('crée une lacune, l’historise et suggère les exigences NIS2', () => {
    const s = buildDemoData()
    const { state, result } = expectOk(
      A.createGap(s, userById(s, 'u2'), { title: 'Test', controlIds: ['8.5'], criticality: 'critique', dueDate: addDays(today(), 10) }),
    )
    expect(result.id).toBe('GAP-027')
    expect(result.nis2Refs).toEqual(['21.2.i', '21.2.j'])
    expect(state.history.at(-1)).toMatchObject({ gapId: 'GAP-027', action: 'Création', userId: 'u2' })
  })

  it('refuse la validation sans preuve ou sans responsable', () => {
    const s = buildDemoData()
    expect(expectError(A.changeGapStatus(s, userById(s, 'u1'), 'GAP-002', 'validee'))).toMatch(/preuve/)
    expect(expectError(A.changeGapStatus(s, userById(s, 'u2'), 'GAP-007', 'validee'))).toMatch(/responsable/)
  })

  it('valide avec preuve + responsable et planifie la revue', () => {
    const s = buildDemoData()
    const { result } = expectOk(A.changeGapStatus(s, userById(s, 'u1'), 'GAP-007', 'validee', 'OK'))
    expect(result.status).toBe('validee')
    expect(result.validation?.by).toBe('u1')
    expect(result.nextReviewDate && result.nextReviewDate > today()).toBe(true)
  })

  it('archive sans supprimer, réservé au responsable', () => {
    const s = buildDemoData()
    expectError(A.setArchived(s, userById(s, 'u2'), 'GAP-001', true))
    const { state } = expectOk(A.setArchived(s, userById(s, 'u1'), 'GAP-001', true))
    expect(state.gaps.find((g) => g.id === 'GAP-001')?.archived).toBe(true)
    expect(state.gaps).toHaveLength(s.gaps.length)
  })

  it('une revue non conforme rouvre la lacune', () => {
    const s = buildDemoData()
    const { result } = expectOk(A.performReview(s, userById(s, 'u1'), 'GAP-014', 'non_conforme', 'Écart'))
    expect(result.status).toBe('en_cours')
    expect(result.validation).toBeNull()
  })

  it('refuse de retirer la dernière preuve d’une lacune validée', () => {
    const s = buildDemoData()
    expectError(A.removeEvidence(s, userById(s, 'u1'), 'PRV-003'))
  })

  it('une remédiation à 100 % passe au statut Validé', () => {
    const s = buildDemoData()
    const { result } = expectOk(A.updateRemediation(s, userById(s, 'u2'), 'IMP-001', { progress: 100 }))
    expect(result.status).toBe('valide')
  })
})

describe('données de démonstration', () => {
  it('génèrent des alertes de retard et une revue due', () => {
    const s = buildDemoData()
    const alerts = priorityAlerts(s.gaps, s.remediations)
    expect(alerts.some((a) => a.kind === 'overdue')).toBe(true)
    expect(s.gaps.some((g) => isReviewDue(g))).toBe(true)
    expect(s.gaps.filter((g) => g.status === 'validee').every((g) => s.evidence.some((e) => e.gapId === g.id))).toBe(true)
  })
})
