import { describe, expect, it } from 'vitest'
import { ASSET_TYPE_BY_ID, ZONE_BY_ID } from '../data/assets'
import { buildDemoData } from '../data/demoData'
import * as A from '../store/actions'
import type { ActionResult, ComplianceState, User } from '../types'
import { assetHealth, gapsOfAsset } from '../utils/compliance'

const ok = <T,>(res: ActionResult<T>) => {
  if (!res.ok) throw new Error(res.error)
  return res
}
const demo = () => buildDemoData()
const user = (s: ComplianceState, id: string): User => s.users.find((u) => u.id === id)!

describe('données de démonstration (cartographie)', () => {
  it('sont cohérentes : types, zones, liaisons réciproques et lacunes reliées', () => {
    const s = demo()
    expect(s.settings.modules.cartographie).toBe(true)
    expect(s.counters.asset).toBe(s.assets.length)
    for (const a of s.assets) {
      expect(ASSET_TYPE_BY_ID[a.type]).toBeDefined()
      expect(ZONE_BY_ID[a.zone]).toBeDefined()
      for (const l of a.links) expect(s.assets.find((x) => x.id === l)?.links, `${a.id} ↔ ${l}`).toContain(a.id)
    }
    for (const g of s.gaps) for (const id of g.assetIds ?? []) expect(s.assets.some((a) => a.id === id)).toBe(true)
  })
})

describe('actifs', () => {
  it('création, liaisons réciproques et historique', () => {
    const s = demo()
    const res = ok(A.createAsset(s, user(s, 'u2'), { name: 'Proxy web', type: 'serveur', zone: 'dmz', criticality: 'moyenne', links: ['ACT-002'] }))
    expect(res.result.id).toBe(`ACT-${String(s.assets.length + 1).padStart(3, '0')}`)
    expect(res.state.assets.find((a) => a.id === 'ACT-002')!.links).toContain(res.result.id)
    expect(res.state.history.at(-1)!.action).toBe('Actif créé')
  })

  it('modification des liaisons : retrait réciproque, diff journalisé', () => {
    const s = demo()
    const res = ok(A.updateAsset(s, user(s, 'u2'), 'ACT-003', { links: ['ACT-017'] }))
    expect(res.state.assets.find((a) => a.id === 'ACT-018')!.links).not.toContain('ACT-003')
    expect(res.state.history.at(-1)!.details).toMatch(/Liaisons/)
  })

  it('un lecteur ne peut rien modifier ; le déplacement n’est pas journalisé', () => {
    const s = demo()
    expect(A.createAsset(s, user(s, 'u4'), { name: 'X', type: 'poste', zone: 'bureautique', criticality: 'basse' }).ok).toBe(false)
    const moved = ok(A.moveAsset(s, user(s, 'u2'), 'ACT-001', { x: 10.6, y: 20.2 }))
    expect(moved.result.position).toEqual({ x: 11, y: 20 })
    expect(moved.state.history.length).toBe(s.history.length)
  })

  it('lien lacune ↔ actif et état de l’actif', () => {
    const s = demo()
    const vpn = s.assets.find((a) => a.id === 'ACT-003')!
    expect(gapsOfAsset(vpn, s.gaps).map((g) => g.id)).toEqual(expect.arrayContaining(['GAP-007', 'GAP-025']))
    expect(assetHealth(vpn, s.gaps)).toBe('warning') // GAP-025 critique en cours, GAP-007 corrigée
    const web = s.assets.find((a) => a.id === 'ACT-004')!
    expect(assetHealth(web, s.gaps)).toBe('unknown')
    const linked = ok(A.linkGapAsset(s, user(s, 'u1'), 'GAP-005', 'ACT-004', true))
    expect(linked.result.assetIds).toEqual(['ACT-004'])
    expect(assetHealth(web, linked.state.gaps)).toBe('critical') // GAP-005 critique non traitée
    expect(linked.state.history.at(-1)!.details).toMatch(/Actifs concernés : \(vide\) → Site web public/)
  })

  it('module activé ou désactivé par l’administrateur uniquement', () => {
    const s = demo()
    expect(A.setModules(s, user(s, 'u1'), { cartographie: false }).ok).toBe(false) // responsable non administrateur
    const off = ok(A.setModules(s, user(s, 'u2'), { cartographie: false }))
    expect(off.state.settings.modules.cartographie).toBe(false)
    expect(off.state.assets.length).toBe(s.assets.length) // aucune donnée supprimée
  })
})
