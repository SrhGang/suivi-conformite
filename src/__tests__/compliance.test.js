import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../data/demoData.js'
import { ISO_CONTROLS, THEMES } from '../data/isoControls.js'
import * as A from '../store/actions.js'
import { conformControls, gapProgress, isReviewDue, priorityAlerts, weightedScore } from '../utils/compliance.js'
import { addDays, today } from '../utils/dates.js'

const users = (s) => Object.fromEntries(s.users.map((u) => [u.role === 'lecteur' ? 'reader' : u.id, u]))

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
  const g = (id, criticality, status) => ({ id, criticality, status, controlIds: ['5.1'], archived: false })
  it('pondère par criticité (Critique ×4 … Basse ×1)', () => {
    const gaps = [g('A', 'critique', 'validee'), g('B', 'basse', 'non_traitee')]
    expect(weightedScore(gaps, [])).toBe(80) // (4×100 + 1×0) / 5
  })
  it('borne l’avancement « En cours » entre 10 et 75 %', () => {
    const gap = g('A', 'haute', 'en_cours')
    expect(gapProgress(gap, [])).toBe(10)
    expect(gapProgress(gap, [{ gapId: 'A', progress: 100 }])).toBe(75)
    expect(gapProgress(gap, [{ gapId: 'A', progress: 40 }, { gapId: 'A', progress: 60 }])).toBe(50)
  })
  it('ignore les lacunes archivées et vaut 100 % sans lacune', () => {
    expect(weightedScore([{ ...g('A', 'critique', 'non_traitee'), archived: true }], [])).toBe(100)
  })
  it('compte les mesures sans lacune ouverte', () => {
    const res = conformControls([g('A', 'haute', 'en_cours'), { ...g('B', 'haute', 'validee'), controlIds: ['8.5'] }])
    expect(res.conform).toBe(92)
  })
})

describe('actions métier', () => {
  it('un lecteur ne peut rien modifier', () => {
    const s = buildDemoData()
    const reader = users(s).reader
    expect(A.createGap(s, reader, { title: 'x', controlIds: ['5.1'], criticality: 'haute', dueDate: today() }).error).toBeTruthy()
  })

  it('crée une lacune, l’historise et suggère les exigences NIS2', () => {
    const s = buildDemoData()
    const res = A.createGap(s, users(s).u2, { title: 'Test', controlIds: ['8.5'], criticality: 'critique', dueDate: addDays(today(), 10) })
    expect(res.result.id).toBe('GAP-027')
    expect(res.result.nis2Refs).toEqual(['21.2.i', '21.2.j'])
    expect(res.state.history.at(-1)).toMatchObject({ gapId: 'GAP-027', action: 'Création', userId: 'u2' })
  })

  it('refuse la validation sans preuve ou sans responsable', () => {
    const s = buildDemoData()
    const noProof = A.changeGapStatus(s, users(s).u1, 'GAP-002', 'validee')
    expect(noProof.error).toMatch(/preuve/)
    const notResp = A.changeGapStatus(s, users(s).u2, 'GAP-007', 'validee')
    expect(notResp.error).toMatch(/responsable/)
  })

  it('valide avec preuve + responsable et planifie la revue', () => {
    const s = buildDemoData()
    const res = A.changeGapStatus(s, users(s).u1, 'GAP-007', 'validee', 'OK')
    expect(res.result.status).toBe('validee')
    expect(res.result.validation.by).toBe('u1')
    expect(res.result.nextReviewDate > today()).toBe(true)
  })

  it('archive sans supprimer, réservé au responsable', () => {
    const s = buildDemoData()
    expect(A.setArchived(s, users(s).u2, 'GAP-001', true).error).toBeTruthy()
    const res = A.setArchived(s, users(s).u1, 'GAP-001', true)
    expect(res.state.gaps.find((g) => g.id === 'GAP-001').archived).toBe(true)
    expect(res.state.gaps).toHaveLength(s.gaps.length)
  })

  it('une revue non conforme rouvre la lacune', () => {
    const s = buildDemoData()
    const res = A.performReview(s, users(s).u1, 'GAP-014', 'non_conforme', 'Écart')
    expect(res.result.status).toBe('en_cours')
    expect(res.result.validation).toBeNull()
  })

  it('refuse de retirer la dernière preuve d’une lacune validée', () => {
    const s = buildDemoData()
    expect(A.removeEvidence(s, users(s).u1, 'PRV-003').error).toBeTruthy()
  })

  it('une remédiation à 100 % passe au statut Validé', () => {
    const s = buildDemoData()
    const res = A.updateRemediation(s, users(s).u2, 'IMP-001', { progress: 100 })
    expect(res.result.status).toBe('valide')
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
