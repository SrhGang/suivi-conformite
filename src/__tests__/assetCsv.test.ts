import { describe, expect, it } from 'vitest'
import { buildDemoData } from '../data/demoData'
import * as A from '../store/actions'
import type { ComplianceState } from '../types'
import { assetCsvTemplate, assetsToCsv, parseCsv, previewAssetImport } from '../utils/assetCsv'

const emptyInventory = (): ComplianceState => ({ ...buildDemoData(), assets: [], counters: { ...buildDemoData().counters, asset: 0 } })
const items = (preview: ReturnType<typeof previewAssetImport>) => preview.rows.map((r) => r.item!).filter(Boolean)

describe('parseCsv', () => {
  it('gère BOM, guillemets, retours à la ligne et séparateur « ; » ou « , »', () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"il dit ""oui"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'il dit "oui"'],
    ])
    expect(parseCsv('a,b\n"ligne\nsur deux",2\n\n')).toEqual([
      ['a', 'b'],
      ['ligne\nsur deux', '2'],
    ])
  })
})

describe('aperçu d’import', () => {
  it('reconnaît libellés et identifiants, sans tenir compte des accents ni de la casse', () => {
    const s = emptyInventory()
    const csv = 'nom;TYPE;zone;criticite;responsable;relie a\nPare-feu;Pare-feu;dmz;CRITIQUE;alice martin;\nWeb;serveur;DMZ;;;Pare-feu'
    const p = previewAssetImport(csv, s.users, s.assets, false)
    expect(p.fatal).toBeUndefined()
    expect(p.rows.map((r) => r.action)).toEqual(['create', 'create'])
    expect(p.rows[0]!.item).toMatchObject({ type: 'parefeu', zone: 'dmz', criticality: 'critique', owner: 'u1' })
    expect(p.rows[1]!.item).toMatchObject({ criticality: 'moyenne', links: ['Pare-feu'] })
  })

  it('signale les erreurs ligne par ligne et les colonnes manquantes', () => {
    const s = buildDemoData()
    expect(previewAssetImport('Nom;Type\nX;serveur', s.users, s.assets, false).fatal).toMatch(/Zone/)
    const p = previewAssetImport('Nom;Type;Zone;Responsable\n;serveur;dmz;\nA;ordinateur;dmz;\nB;poste;lune;\nC;poste;dmz;Inconnu\nD;poste;dmz;\nd;poste;dmz;', s.users, s.assets, false)
    expect(p.rows.map((r) => r.error ?? r.action)).toEqual([
      'Nom manquant.',
      expect.stringMatching(/Type inconnu/),
      expect.stringMatching(/Zone inconnue/),
      expect.stringMatching(/Responsable inconnu/),
      'create',
      expect.stringMatching(/plusieurs fois/),
    ])
  })

  it('actifs existants : ignorés par défaut, mis à jour sur demande', () => {
    const s = buildDemoData()
    const csv = 'Nom;Type;Zone\nPasserelle VPN;serveur;dmz'
    expect(previewAssetImport(csv, s.users, s.assets, false).rows[0]!.action).toBe('skip')
    expect(previewAssetImport(csv, s.users, s.assets, true).rows[0]!.action).toBe('update')
  })
})

describe('import d’actifs', () => {
  it('aller-retour : export de la démo puis import dans un inventaire vide', () => {
    const demo = buildDemoData()
    const target = emptyInventory()
    const p = previewAssetImport(assetsToCsv(demo), target.users, target.assets, false)
    expect(p.rows.every((r) => r.action === 'create')).toBe(true)
    const res = A.importAssets(target, target.users.find((u) => u.id === 'u2')!, items(p), false)
    if (!res.ok) throw new Error(res.error)
    expect(res.result).toMatchObject({ created: demo.assets.length, updated: 0, unresolvedLinks: [] })
    const linksByName = (s: ComplianceState) =>
      Object.fromEntries(s.assets.map((a) => [a.name, a.links.map((l) => s.assets.find((x) => x.id === l)!.name).sort()]))
    expect(linksByName(res.state)).toEqual(linksByName(demo))
    expect(res.state.history.at(-1)!.action).toBe('Import d’actifs')
  })

  it('mise à jour, liaisons ajoutées sans en retirer, noms introuvables signalés, droits', () => {
    const s = buildDemoData()
    const u2 = s.users.find((u) => u.id === 'u2')!
    const reader = s.users.find((u) => u.role === 'lecteur')!
    const p = previewAssetImport('Nom;Type;Zone;Criticité;Relié à\nPasserelle VPN;serveur;dmz;haute;Site web public | Inconnu', s.users, s.assets, true)
    expect(A.importAssets(s, reader, items(p), true).ok).toBe(false)
    const res = A.importAssets(s, u2, items(p), true)
    if (!res.ok) throw new Error(res.error)
    expect(res.result).toMatchObject({ created: 0, updated: 1, unresolvedLinks: ['Inconnu'] })
    const vpn = res.state.assets.find((a) => a.id === 'ACT-003')!
    expect(vpn.criticality).toBe('haute')
    expect(vpn.links).toEqual(expect.arrayContaining(['ACT-017', 'ACT-018', 'ACT-004']))
    expect(res.state.assets.find((a) => a.id === 'ACT-004')!.links).toContain('ACT-003')
  })

  it('le modèle CSV est importable tel quel', () => {
    const s = emptyInventory()
    const p = previewAssetImport(assetCsvTemplate(), s.users, s.assets, false)
    expect(p.rows.map((r) => r.error ?? r.action)).toEqual(['create', 'create'])
  })
})
