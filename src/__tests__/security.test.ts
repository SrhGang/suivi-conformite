/** Règles de droits et d'export. */
import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../data/demoData'
import * as A from '../store/actions'
import type { ActionResult, ComplianceState, User } from '../types'
import { buildCsv, buildReportHtml } from '../utils/report'

const user = (s: ComplianceState, id: string): User => s.users.find((u) => u.id === id)!
const ok = <T>(r: ActionResult<T>) => {
  if (!r.ok) throw new Error(`Action refusée : ${r.error}`)
  return r
}

/** Lacune validée (avec preuve) et un contributeur qui n'a pas le droit de valider. */
function validatedGap() {
  const s = buildDemoData()
  const gap = s.gaps.find((g) => g.status === 'validee' && !g.archived && s.evidence.some((e) => e.gapId === g.id))!
  const contrib = user(s, 'u3')
  expect(contrib.role).toBe('contributeur')
  return { s, gap, contrib, resp: user(s, 'u1') }
}

describe('Séparation des tâches sur une lacune validée', () => {
  it('un contributeur ne peut pas modifier le contenu d’une lacune validée', () => {
    const { s, gap, contrib } = validatedGap()
    const r = A.updateGap(s, contrib, gap.id, { criticality: 'basse', title: 'Contenu non approuvé' })
    expect(r.ok).toBe(false)
  })

  it('un responsable validant le peut toujours', () => {
    const { s, gap, resp } = validatedGap()
    expect(A.updateGap(s, resp, gap.id, { title: 'Titre revu' }).ok).toBe(true)
  })

  it('un contributeur ne peut pas remplacer les preuves d’une lacune validée', () => {
    const { s, gap, contrib } = validatedGap()
    const added = A.addEvidence(s, contrib, gap.id, { name: 'Autre preuve', url: 'https://exemple.fr' })
    expect(added.ok).toBe(false)
    const ev = s.evidence.find((e) => e.gapId === gap.id)!
    // Même s'il reste une autre preuve, le retrait est réservé au responsable.
    const withExtra = ok(A.addEvidence(s, user(s, 'u1'), gap.id, { name: 'Autre', url: 'https://exemple.fr' })).state
    expect(A.removeEvidence(withExtra, contrib, ev.id).ok).toBe(false)
  })
})

describe('Remédiations d’une lacune validée', () => {
  it('un contributeur ne peut pas ajouter, modifier ni supprimer une remédiation d’une lacune validée', () => {
    const { s, gap, contrib } = validatedGap()
    expect(A.addRemediation(s, contrib, gap.id, { title: 'x', type: 'outil', targetDate: '2030-01-01' }).ok).toBe(false)
    const rem = s.remediations.find((r) => r.gapId === gap.id)
    if (rem) {
      expect(A.updateRemediation(s, contrib, rem.id, { progress: 10 }).ok).toBe(false)
      expect(A.deleteRemediation(s, contrib, rem.id).ok).toBe(false)
    }
  })
})

describe('Lacunes archivées en lecture seule', () => {
  it('refuse modifications, remédiations et preuves sur une lacune archivée', () => {
    const s0 = buildDemoData()
    const resp = user(s0, 'u1')
    const contrib = user(s0, 'u3')
    const target = s0.gaps.find((g) => !g.archived && g.status !== 'validee')!
    const s = ok(A.setArchived(s0, resp, target.id, true, 'test')).state
    expect(A.updateGap(s, contrib, target.id, { title: 'x' }).ok).toBe(false)
    expect(
      A.addRemediation(s, contrib, target.id, { title: 'x', type: 'outil', targetDate: '2030-01-01' }).ok,
    ).toBe(false)
    expect(A.addEvidence(s, contrib, target.id, { name: 'x', url: 'https://exemple.fr' }).ok).toBe(false)
    expect(A.confirmGap(s, contrib, target.id).ok).toBe(false)
    const rem = s.remediations.find((r) => r.gapId === target.id)
    if (rem) {
      expect(A.updateRemediation(s, contrib, rem.id, { progress: 50 }).ok).toBe(false)
      expect(A.deleteRemediation(s, contrib, rem.id).ok).toBe(false)
    }
  })
})

describe('Exports', () => {
  it('préfixe les valeurs commençant par = + - @ dans l’export CSV', () => {
    const s = buildDemoData()
    s.gaps[0] = { ...s.gaps[0]!, title: '=1+1', anssiRef: '+2' }
    const csv = buildCsv(s)
    expect(csv).not.toContain(';"=1+1')
    expect(csv).not.toContain(';"+2')
    expect(csv).toContain(`;"'=1+1`)
  })

  it('échappe tous les champs du rapport HTML', () => {
    const s = buildDemoData()
    const rem = s.remediations[0]!
    s.remediations[0] = { ...rem, id: '<b>id</b>', progress: '<i>50</i>' as unknown as number }
    const html = buildReportHtml(s)
    expect(html).not.toContain('<b>id')
    expect(html).not.toContain('<i>50')
  })
})
