import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../data/demoData'
import { getControl } from '../data/isoControls'
import { STARTER_GAPS } from '../data/starterGaps'
import * as A from '../store/actions'
import type { ComplianceState, User } from '../types'

const empty = (): ComplianceState => ({ ...buildDemoData(), gaps: [], remediations: [], evidence: [], history: [], milestones: [] })
const admin: User = { id: 'adm', name: 'Admin', initials: 'AD', title: '', role: 'lecteur', isAdmin: true }
const contributor: User = { id: 'c', name: 'Contrib', initials: 'CO', title: '', role: 'contributeur' }
const responsable: User = { id: 'r', name: 'Resp', initials: 'RE', title: '', role: 'responsable' }

describe('rôle administrateur', () => {
  it('est distinct des rôles métier', () => {
    expect(A.can(admin, 'admin')).toBe(true)
    expect(A.can(admin, 'edit')).toBe(false)
    expect(A.can(responsable, 'admin')).toBe(false)
    expect(A.can(responsable, 'validate')).toBe(true)
    expect(A.can({ ...responsable, isAdmin: true }, 'admin')).toBe(true)
  })
})

describe('données de départ', () => {
  it('référencent des mesures ISO existantes', () => {
    for (const g of STARTER_GAPS) for (const c of g.controlIds) expect(getControl(c), `${g.title} : A.${c}`).toBeDefined()
    expect(STARTER_GAPS.map((g) => g.title).join(' ')).not.toMatch(/[—–]/)
  })

  it('sont chargées par un administrateur, à confirmer, sur une base vide uniquement', () => {
    expect(A.loadStarterGaps(empty(), contributor).ok).toBe(false)
    const res = A.loadStarterGaps(empty(), admin)
    if (!res.ok) throw new Error(res.error)
    expect(res.result).toBe(STARTER_GAPS.length)
    expect(res.state.gaps.every((g) => g.toConfirm && g.status === 'non_traitee' && g.assignee === '')).toBe(true)
    expect(res.state.history).toHaveLength(STARTER_GAPS.length)
    expect(A.loadStarterGaps(res.state, admin).ok).toBe(false)

    const gapId = res.state.gaps[0]!.id
    expect(A.confirmGap(res.state, admin, gapId).ok).toBe(false) // administrateur lecteur
    const confirmed = A.confirmGap(res.state, contributor, gapId)
    if (!confirmed.ok) throw new Error(confirmed.error)
    expect(confirmed.result.toConfirm).toBeUndefined()
    expect(confirmed.state.history.at(-1)?.action).toBe('Confirmation')
  })
})
