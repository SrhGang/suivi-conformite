/**
 * Référentiel ISO/IEC 27001:2022 — Annexe A (93 mesures, 4 thèmes)
 * et correspondance indicative avec l'article 21.2 de la directive NIS2
 * (déclinée en France par l'ANSSI).
 *
 * ⚠️ La correspondance ISO ↔ NIS2 est indicative : elle doit être revue
 * par le responsable de la conformité avant tout usage officiel.
 */
import type { IsoControl, Nis2Id, Nis2Requirement, Theme, ThemeId } from '../types'

export const THEMES: Theme[] = [
  { id: 'org', code: 'A.5', label: 'Organisationnel', short: 'Org.' },
  { id: 'people', code: 'A.6', label: 'Humain', short: 'Hum.' },
  { id: 'physical', code: 'A.7', label: 'Physique', short: 'Phys.' },
  { id: 'tech', code: 'A.8', label: 'Technologique', short: 'Tech.' },
]

export const NIS2_REQUIREMENTS: Nis2Requirement[] = [
  { id: '20', label: 'Art. 20 — Gouvernance', description: "Approbation et supervision des mesures de gestion des risques par les organes de direction ; formation des dirigeants." },
  { id: '21.2.a', label: 'Art. 21.2 a) — Analyse des risques', description: "Politiques relatives à l'analyse des risques et à la sécurité des systèmes d'information." },
  { id: '21.2.b', label: 'Art. 21.2 b) — Gestion des incidents', description: 'Gestion des incidents.' },
  { id: '21.2.c', label: 'Art. 21.2 c) — Continuité', description: "Continuité des activités, gestion des sauvegardes, reprise après sinistre et gestion des crises." },
  { id: '21.2.d', label: "Art. 21.2 d) — Chaîne d'approvisionnement", description: "Sécurité de la chaîne d'approvisionnement, y compris les relations avec les fournisseurs." },
  { id: '21.2.e', label: 'Art. 21.2 e) — Acquisition, développement, maintenance', description: "Sécurité de l'acquisition, du développement et de la maintenance des SI, y compris le traitement et la divulgation des vulnérabilités." },
  { id: '21.2.f', label: 'Art. 21.2 f) — Évaluation de l’efficacité', description: "Politiques et procédures pour évaluer l'efficacité des mesures de gestion des risques." },
  { id: '21.2.g', label: 'Art. 21.2 g) — Hygiène & formation', description: "Pratiques de base en matière de cyberhygiène et formation à la cybersécurité." },
  { id: '21.2.h', label: 'Art. 21.2 h) — Cryptographie', description: 'Politiques et procédures relatives à la cryptographie et au chiffrement.' },
  { id: '21.2.i', label: 'Art. 21.2 i) — RH, accès, actifs', description: "Sécurité des ressources humaines, politiques de contrôle d'accès et gestion des actifs." },
  { id: '21.2.j', label: 'Art. 21.2 j) — MFA & communications sécurisées', description: "Authentification multifacteur ou continue, communications vocales, vidéo et textuelles sécurisées, communications d'urgence sécurisées." },
  { id: '23', label: 'Art. 23 — Notification des incidents', description: "Obligations d'information (alerte précoce 24 h, notification 72 h, rapport final 1 mois)." },
]

// [id, titre, exigences NIS2 associées]
const RAW: Record<ThemeId, [string, string, Nis2Id[]][]> = {
  org: [
    ['5.1', "Politiques de sécurité de l'information", ['20', '21.2.a']],
    ['5.2', "Fonctions et responsabilités liées à la sécurité de l'information", ['20', '21.2.a']],
    ['5.3', 'Séparation des tâches', ['21.2.i']],
    ['5.4', 'Responsabilités de la direction', ['20']],
    ['5.5', 'Contacts avec les autorités', ['23']],
    ['5.6', 'Contacts avec des groupes de travail spécialisés', ['21.2.b']],
    ['5.7', 'Renseignement sur les menaces', ['21.2.a', '21.2.b']],
    ['5.8', "Sécurité de l'information dans la gestion de projet", ['21.2.e']],
    ['5.9', 'Inventaire des informations et autres actifs associés', ['21.2.i']],
    ['5.10', 'Utilisation correcte des informations et autres actifs associés', ['21.2.i']],
    ['5.11', 'Restitution des actifs', ['21.2.i']],
    ['5.12', 'Classification des informations', ['21.2.i']],
    ['5.13', 'Marquage des informations', ['21.2.i']],
    ['5.14', 'Transfert des informations', ['21.2.h', '21.2.j']],
    ['5.15', "Contrôle d'accès", ['21.2.i']],
    ['5.16', 'Gestion des identités', ['21.2.i']],
    ['5.17', "Informations d'authentification", ['21.2.i', '21.2.j']],
    ['5.18', "Droits d'accès", ['21.2.i']],
    ['5.19', "Sécurité de l'information dans les relations avec les fournisseurs", ['21.2.d']],
    ['5.20', "Prise en compte de la sécurité dans les accords conclus avec les fournisseurs", ['21.2.d']],
    ['5.21', "Gestion de la sécurité dans la chaîne d'approvisionnement TIC", ['21.2.d']],
    ['5.22', 'Surveillance, révision et gestion des changements des services fournisseurs', ['21.2.d']],
    ['5.23', "Sécurité de l'information dans l'utilisation de services en nuage", ['21.2.d', '21.2.e']],
    ['5.24', 'Planification et préparation de la gestion des incidents', ['21.2.b']],
    ['5.25', "Évaluation des événements de sécurité et prise de décision", ['21.2.b']],
    ['5.26', 'Réponse aux incidents de sécurité', ['21.2.b', '23']],
    ['5.27', 'Tirer des enseignements des incidents', ['21.2.b', '21.2.f']],
    ['5.28', 'Collecte des preuves', ['21.2.b']],
    ['5.29', 'Sécurité de l\'information durant une perturbation', ['21.2.c']],
    ['5.30', 'Préparation des TIC pour la continuité d\'activité', ['21.2.c']],
    ['5.31', 'Exigences légales, statutaires, réglementaires et contractuelles', ['20']],
    ['5.32', 'Droits de propriété intellectuelle', ['20']],
    ['5.33', 'Protection des enregistrements', ['21.2.i']],
    ['5.34', 'Vie privée et protection des DCP', ['21.2.i']],
    ['5.35', "Revue indépendante de la sécurité de l'information", ['21.2.f']],
    ['5.36', 'Conformité aux politiques, règles et normes de sécurité', ['21.2.f']],
    ['5.37', "Procédures d'exploitation documentées", ['21.2.a']],
  ],
  people: [
    ['6.1', 'Sélection des candidats', ['21.2.i']],
    ['6.2', "Termes et conditions du contrat de travail", ['21.2.i']],
    ['6.3', "Sensibilisation, enseignement et formation en sécurité de l'information", ['21.2.g', '20']],
    ['6.4', 'Processus disciplinaire', ['21.2.i']],
    ['6.5', "Responsabilités après la fin ou le changement d'un emploi", ['21.2.i']],
    ['6.6', 'Accords de confidentialité ou de non-divulgation', ['21.2.i']],
    ['6.7', 'Travail à distance', ['21.2.g', '21.2.j']],
    ['6.8', "Déclaration des événements de sécurité de l'information", ['21.2.b', '23']],
  ],
  physical: [
    ['7.1', 'Périmètres de sécurité physique', ['21.2.i']],
    ['7.2', 'Les entrées physiques', ['21.2.i']],
    ['7.3', 'Sécurisation des bureaux, des salles et des installations', ['21.2.i']],
    ['7.4', 'Surveillance de la sécurité physique', ['21.2.i']],
    ['7.5', 'Protection contre les menaces physiques et environnementales', ['21.2.c']],
    ['7.6', 'Travail dans les zones sécurisées', ['21.2.i']],
    ['7.7', 'Bureau propre et écran vide', ['21.2.g']],
    ['7.8', 'Emplacement et protection du matériel', ['21.2.i']],
    ['7.9', 'Sécurité des actifs hors des locaux', ['21.2.i']],
    ['7.10', 'Supports de stockage', ['21.2.i', '21.2.h']],
    ['7.11', 'Services supports', ['21.2.c']],
    ['7.12', 'Sécurité du câblage', ['21.2.i']],
    ['7.13', 'Maintenance du matériel', ['21.2.e']],
    ['7.14', 'Élimination ou recyclage sécurisé du matériel', ['21.2.i']],
  ],
  tech: [
    ['8.1', 'Terminaux finaux des utilisateurs', ['21.2.g', '21.2.i']],
    ['8.2', "Droits d'accès privilégiés", ['21.2.i']],
    ['8.3', "Restriction d'accès aux informations", ['21.2.i']],
    ['8.4', 'Accès aux codes source', ['21.2.e']],
    ['8.5', 'Authentification sécurisée', ['21.2.j', '21.2.i']],
    ['8.6', 'Dimensionnement', ['21.2.c']],
    ['8.7', 'Protection contre les programmes malveillants', ['21.2.g']],
    ['8.8', 'Gestion des vulnérabilités techniques', ['21.2.e']],
    ['8.9', 'Gestion des configurations', ['21.2.e']],
    ['8.10', 'Suppression des informations', ['21.2.i']],
    ['8.11', 'Masquage des données', ['21.2.h']],
    ['8.12', 'Prévention de la fuite de données', ['21.2.i']],
    ['8.13', 'Sauvegarde des informations', ['21.2.c']],
    ['8.14', 'Redondance des moyens de traitement', ['21.2.c']],
    ['8.15', 'Journalisation', ['21.2.b']],
    ['8.16', 'Activités de surveillance', ['21.2.b']],
    ['8.17', 'Synchronisation des horloges', ['21.2.b']],
    ['8.18', "Utilisation de programmes utilitaires à privilèges", ['21.2.i']],
    ['8.19', 'Installation de logiciels sur des systèmes opérationnels', ['21.2.e']],
    ['8.20', 'Sécurité des réseaux', ['21.2.e']],
    ['8.21', 'Sécurité des services réseau', ['21.2.e', '21.2.d']],
    ['8.22', 'Cloisonnement des réseaux', ['21.2.e']],
    ['8.23', 'Filtrage web', ['21.2.g']],
    ['8.24', 'Utilisation de la cryptographie', ['21.2.h']],
    ['8.25', 'Cycle de développement sécurisé', ['21.2.e']],
    ['8.26', 'Exigences de sécurité des applications', ['21.2.e']],
    ['8.27', "Principes d'ingénierie et d'architecture des systèmes sécurisés", ['21.2.e']],
    ['8.28', 'Codage sécurisé', ['21.2.e']],
    ['8.29', 'Tests de sécurité dans le développement et l\'acceptation', ['21.2.e', '21.2.f']],
    ['8.30', 'Développement externalisé', ['21.2.d', '21.2.e']],
    ['8.31', 'Séparation des environnements de développement, de test et de production', ['21.2.e']],
    ['8.32', 'Gestion des changements', ['21.2.e']],
    ['8.33', 'Informations de test', ['21.2.e']],
    ['8.34', "Protection des SI en cours d'audit et de test", ['21.2.f']],
  ],
}

export const ISO_CONTROLS: IsoControl[] = (Object.entries(RAW) as [ThemeId, [string, string, Nis2Id[]][]][]).flatMap(
  ([theme, list]) => list.map(([id, title, nis2]) => ({ id, title, theme, nis2 })),
)

const CONTROL_INDEX = new Map(ISO_CONTROLS.map((c) => [c.id, c]))
const THEME_INDEX = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, Theme>
const NIS2_INDEX = new Map(NIS2_REQUIREMENTS.map((n) => [n.id, n]))

export const getControl = (id: string): IsoControl | undefined => CONTROL_INDEX.get(id)
export const getTheme = (id: ThemeId): Theme => THEME_INDEX[id]
export const getNis2 = (id: string): Nis2Requirement | undefined => NIS2_INDEX.get(id as Nis2Id)

/** Thème d'une lacune = thème de sa première mesure ISO. */
export const themeOfControls = (controlIds: string[] = []): ThemeId => getControl(controlIds[0])?.theme ?? 'org'

/** Exigences NIS2 suggérées pour une liste de mesures (union, ordonnée). */
export const suggestNis2 = (controlIds: string[] = []): Nis2Id[] => {
  const set = new Set(controlIds.flatMap((id) => getControl(id)?.nis2 ?? []))
  return NIS2_REQUIREMENTS.map((n) => n.id).filter((id) => set.has(id))
}

export const controlLabel = (id: string): string => {
  const c = getControl(id)
  return c ? `A.${c.id} — ${c.title}` : id
}
