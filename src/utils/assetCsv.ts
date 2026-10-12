/**
 * Import et export CSV de l'inventaire des actifs (module cartographie).
 * Format compatible Excel : séparateur « ; » (ou « , »), UTF-8 avec BOM,
 * en-têtes en français. Les liaisons sont données par nom, séparées par « | ».
 */
import { ASSET_TYPES, ZONES } from '../data/assets'
import { CRITICALITIES } from '../data/constants'
import type { Asset, AssetImportItem, ComplianceState, User } from '../types'

export const CSV_COLUMNS = ['Nom', 'Type', 'Rôle', 'Zone', 'Criticité', 'Responsable', 'Description', 'Relié à'] as const
export const MAX_IMPORT_ROWS = 500

/** Minuscules, sans accents ni espaces superflus : pour comparer des libellés saisis à la main. */
export const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Découpe un texte CSV en lignes de cellules (guillemets, retours à la ligne dans les cellules, BOM). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  nom: 'Nom',
  name: 'Nom',
  type: 'Type',
  role: 'Rôle',
  zone: 'Zone',
  criticite: 'Criticité',
  responsable: 'Responsable',
  proprietaire: 'Responsable',
  description: 'Description',
  'relie a': 'Relié à',
  liaisons: 'Relié à',
  liens: 'Relié à',
}

const lookup = <Id extends string>(list: { id: Id; label: string }[], value: string): Id | undefined => {
  const v = normalize(value)
  return list.find((x) => normalize(x.id) === v || normalize(x.label) === v)?.id
}

export interface ImportRow {
  /** Numéro de ligne dans le fichier (en-tête = 1). */
  line: number
  item?: AssetImportItem
  error?: string
  /** Effet prévu : création, mise à jour d'un actif existant (même nom) ou ligne ignorée. */
  action?: 'create' | 'update' | 'skip'
}

export interface ImportPreview {
  rows: ImportRow[]
  /** Erreur bloquante (fichier vide, colonne obligatoire absente, trop de lignes). */
  fatal?: string
}

/** Analyse un CSV d'actifs : correspondance des libellés, contrôle des valeurs et effet prévu de chaque ligne. */
export function previewAssetImport(text: string, users: User[], assets: Asset[], updateExisting: boolean): ImportPreview {
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], fatal: 'Le fichier ne contient aucune ligne d’actif (en-tête puis une ligne par actif).' }
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], fatal: `Trop de lignes : ${MAX_IMPORT_ROWS} actifs au maximum par import.` }
  const header = table[0]!.map((h) => HEADER_ALIASES[normalize(h)])
  const col = (name: (typeof CSV_COLUMNS)[number]) => header.indexOf(name)
  for (const required of ['Nom', 'Type', 'Zone'] as const)
    if (col(required) < 0) return { rows: [], fatal: `Colonne « ${required} » introuvable. Partez du modèle CSV pour avoir les bons en-têtes.` }

  const existing = new Set(assets.map((a) => normalize(a.name)))
  const seen = new Set<string>()
  const rows = table.slice(1).map((cells, i): ImportRow => {
    const line = i + 2
    const get = (name: (typeof CSV_COLUMNS)[number]) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '')
    const name = get('Nom')
    if (!name) return { line, error: 'Nom manquant.' }
    if (name.length > 160) return { line, error: 'Nom trop long (160 caractères au maximum).' }
    const key = normalize(name)
    if (seen.has(key)) return { line, error: `« ${name} » apparaît plusieurs fois dans le fichier.` }
    seen.add(key)
    const type = lookup(ASSET_TYPES, get('Type'))
    if (!type) return { line, error: `Type inconnu : « ${get('Type')} ». Valeurs possibles : ${ASSET_TYPES.map((t) => t.id).join(', ')}.` }
    const zone = lookup(ZONES, get('Zone'))
    if (!zone) return { line, error: `Zone inconnue : « ${get('Zone')} ». Valeurs possibles : ${ZONES.map((z) => z.id).join(', ')}.` }
    const critRaw = get('Criticité')
    const criticality = critRaw ? lookup(CRITICALITIES, critRaw) : 'moyenne'
    if (!criticality) return { line, error: `Criticité inconnue : « ${critRaw} » (critique, haute, moyenne ou basse).` }
    const ownerRaw = get('Responsable')
    const owner = ownerRaw ? users.find((u) => normalize(u.name) === normalize(ownerRaw) || u.id === ownerRaw)?.id : ''
    if (owner === undefined) return { line, error: `Responsable inconnu : « ${ownerRaw} » (nom d’un utilisateur de l’application).` }
    const links = get('Relié à')
      .split(/[|\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const item: AssetImportItem = { name, type, zone, criticality, owner, role: get('Rôle'), description: get('Description'), links }
    const action = existing.has(key) ? (updateExisting ? 'update' : 'skip') : 'create'
    return { line, item, action }
  })
  return { rows }
}

const cell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`
const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')

export const assetCsvTemplate = (): string =>
  toCsv([
    [...CSV_COLUMNS],
    ['Pare-feu principal', 'Pare-feu', 'Filtrage Internet et DMZ', 'DMZ', 'Critique', '', 'Cluster de deux équipements', ''],
    ['Serveur de messagerie', 'serveur', 'Messagerie interne', 'serveurs', 'haute', '', '', 'Pare-feu principal'],
  ])

/** Export de l'inventaire (actifs non archivés) dans le format d'import. */
export function assetsToCsv(state: ComplianceState): string {
  const name = (id: string) => state.assets.find((a) => a.id === id)?.name ?? ''
  const rows = state.assets
    .filter((a) => !a.archived)
    .map((a) => [
      a.name,
      ASSET_TYPES.find((t) => t.id === a.type)?.label ?? a.type,
      a.role,
      ZONES.find((z) => z.id === a.zone)?.label ?? a.zone,
      CRITICALITIES.find((c) => c.id === a.criticality)?.label ?? a.criticality,
      state.users.find((u) => u.id === a.owner)?.name ?? '',
      a.description,
      a.links.map(name).filter(Boolean).join(' | '),
    ])
  return toCsv([[...CSV_COLUMNS], ...rows])
}
