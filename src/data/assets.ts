/** Référentiels du module cartographie : types d'actifs et zones réseau. */
import type { AssetTypeId, ZoneId } from '../types'

export interface AssetType {
  id: AssetTypeId
  label: string
  /** Tracé de l'icône (grille 24 × 24, trait). */
  icon: string
}

export const ASSET_TYPES: AssetType[] = [
  { id: 'serveur', label: 'Serveur', icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01M12 7h5M12 17h5' },
  { id: 'application', label: 'Application', icon: 'M4 5h16v14H4zM4 9h16M7 7h.01M10 7h.01M8 13l2 2-2 2M13 17h3' },
  { id: 'poste', label: 'Postes de travail', icon: 'M3 5h18v11H3zM8 20h8M12 16v4' },
  { id: 'switch', label: 'Switch', icon: 'M3 8h18v8H3zM6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01' },
  { id: 'routeur', label: 'Routeur', icon: 'M4 14h16v6H4zM8 17h.01M12 17h.01M8 10a6 6 0 0 1 8 0M5.5 7.5a10 10 0 0 1 13 0' },
  { id: 'parefeu', label: 'Pare-feu', icon: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 10v5M9 15v4' },
  { id: 'wifi', label: 'Borne Wi-Fi', icon: 'M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0M12 19h.01M2 9a14 14 0 0 1 20 0' },
  { id: 'stockage', label: 'Stockage / sauvegarde', icon: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' },
  { id: 'cloud', label: 'Service en nuage', icon: 'M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.6 1.5A3.5 3.5 0 0 1 17.5 18z' },
  { id: 'industriel', label: 'Équipement industriel', icon: 'M3 20V10l5 3V10l5 3V6h4l1 14zM3 20h18M15 3v3' },
  { id: 'fournisseur', label: 'Fournisseur / tiers', icon: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M14 14.5A6 6 0 0 1 22 20' },
]

export interface Zone {
  id: ZoneId
  label: string
  description: string
}

/** Zones affichées de gauche à droite sur la carte. */
export const ZONES: Zone[] = [
  { id: 'internet', label: 'Internet', description: 'Accès externes, opérateurs' },
  { id: 'dmz', label: 'DMZ', description: 'Services exposés' },
  { id: 'serveurs', label: 'Serveurs', description: 'Cœur du SI' },
  { id: 'bureautique', label: 'Bureautique', description: 'Postes et utilisateurs' },
  { id: 'industriel', label: 'Industriel (OT)', description: 'Supervision et automates' },
  { id: 'cloud', label: 'Cloud', description: 'Services en ligne' },
  { id: 'tiers', label: 'Tiers', description: 'Fournisseurs et prestataires' },
]

const index = <Id extends string, T extends { id: Id }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x])) as Record<Id, T>

export const ASSET_TYPE_BY_ID = index(ASSET_TYPES)
export const ZONE_BY_ID = index(ZONES)
