/**
 * Données de démonstration réalistes pour un organisme fictif soumis à NIS2
 * (entité essentielle, secteur de l'eau). Les dates sont calculées
 * relativement à la date du jour pour que retards et revues restent parlants.
 */
import { suggestNis2 } from './isoControls'
import { CRITICALITY_BY_ID } from './constants'
import { addDays, addMonths, today } from '../utils/dates'
import type {
  ComplianceState,
  CriticalityId,
  Evidence,
  EvidenceTypeId,
  Gap,
  GapStatusId,
  HistoryEntry,
  Milestone,
  Nis2Id,
  Organization,
  Remediation,
  RemediationStatusId,
  RemediationTypeId,
  User,
} from '../types'

export const ORGANIZATION: Organization = {
  name: 'Eaux du Val de Loire (fictif)',
  sector: "Eau potable, entité essentielle NIS2",
}

export const DEMO_USERS: User[] = [
  { id: 'u1', name: 'Alice Martin', initials: 'AM', title: 'RSSI', role: 'responsable' },
  { id: 'u2', name: 'Bruno Leroy', initials: 'BL', title: 'Administrateur systèmes & réseaux', role: 'contributeur', isAdmin: true },
  { id: 'u3', name: 'Chloé Dubois', initials: 'CD', title: 'DSI adjointe', role: 'contributeur' },
  { id: 'u4', name: 'David Bernard', initials: 'DB', title: 'Auditeur interne', role: 'lecteur' },
  { id: 'u5', name: 'Emma Petit', initials: 'EP', title: 'Responsable RH', role: 'contributeur' },
  { id: 'u6', name: 'Farid Benali', initials: 'FB', title: 'Directeur général', role: 'responsable' },
]

const ANSSI = {
  mfa: "ANSSI : Recommandations relatives à l'authentification multifacteur et aux mots de passe",
  hygiene: "ANSSI : Guide d'hygiène informatique",
  admin: "ANSSI : Recommandations relatives à l'administration sécurisée des SI",
  logs: 'ANSSI : Recommandations de sécurité pour la mise en œuvre d’un système de journalisation',
  backup: 'ANSSI : Fondamentaux de la sauvegarde des systèmes d’information',
  crise: 'ANSSI : Guide « Crise d’origine cyber, les clés d’une gestion opérationnelle et stratégique »',
  ebios: 'ANSSI : Méthode EBIOS Risk Manager',
  ics: 'ANSSI : Cybersécurité des systèmes industriels : mesures détaillées',
  tls: 'ANSSI : Recommandations de sécurité relatives à TLS',
  ad: 'ANSSI : Points de contrôle Active Directory',
  mail: 'ANSSI : Recommandations pour la sécurisation de la messagerie',
  externe: "ANSSI : Maîtriser les risques de l'infogérance",
  nis2: 'ANSSI : Référentiel des mesures de sécurité NIS2 (à confirmer selon la version publiée)',
}

// [id, titre, description, mesures ISO, réf. ANSSI, criticité, statut, impact,
//  échéance (j), création (j), créateur, assigné, extra]
interface GapExtra {
  validatedDays?: number
  validatedBy?: string
  archived?: boolean
  nis2?: Nis2Id[]
}

type GapRow = [
  id: string,
  title: string,
  description: string,
  controlIds: string[],
  anssiRef: string,
  criticality: CriticalityId,
  status: GapStatusId,
  impact: string,
  dueDays: number,
  createdDays: number,
  createdBy: string,
  assignee: string,
  extra?: GapExtra,
]

const GAPS: GapRow[] = [
  ['GAP-001', "MFA non configurée sur le portail d'administration", "Le portail d'administration de l'hyperviseur et la console de supervision SCADA ne disposent pas d'authentification multifacteur. Les comptes administrateurs sont exposés au hameçonnage et au bourrage d'identifiants.", ['8.5', '5.17'], ANSSI.mfa, 'critique', 'en_cours', "Accès non autorisé aux fonctions d'administration, compromission de l'infrastructure de production d'eau.", 20, -95, 'u1', 'u2'],
  ['GAP-002', 'Flux internes non chiffrés entre applications métier', "Les échanges entre l'ERP, la GMAO et la base clients transitent en clair (HTTP, LDAP non signé).", ['8.24', '5.14'], ANSSI.tls, 'haute', 'non_traitee', 'Interception de données clients et d’identifiants sur le réseau interne.', 45, -90, 'u1', 'u3'],
  ['GAP-003', 'Restauration des sauvegardes jamais testée', "Les sauvegardes quotidiennes sont réalisées mais aucun test de restauration n'a été conduit depuis 2 ans. Aucune copie hors ligne n'existe.", ['8.13', '5.30'], ANSSI.backup, 'critique', 'en_cours', 'Impossibilité de reprendre l’activité après un rançongiciel ; perte de données de facturation.', -5, -88, 'u1', 'u2'],
  ['GAP-004', 'Journaux non centralisés (absence de SIEM)', 'Les journaux des pare-feu, AD et serveurs restent en local, avec une rétention de 7 jours. Aucune corrélation ni alerte.', ['8.15', '8.16'], ANSSI.logs, 'haute', 'en_cours', 'Détection tardive des intrusions, impossibilité d’investiguer un incident.', 60, -85, 'u1', 'u2'],
  ['GAP-005', "Procédure de notification des incidents à l'ANSSI absente", "Aucune procédure ne décrit l'alerte précoce (24 h), la notification (72 h) et le rapport final (1 mois) exigés par NIS2.", ['5.26', '5.5', '6.8'], ANSSI.crise, 'critique', 'non_traitee', 'Non-respect des obligations légales, sanctions administratives.', -2, -80, 'u1', 'u1'],
  ['GAP-006', 'Inventaire des actifs incomplet', "L'inventaire CMDB ne couvre pas les automates industriels ni les équipements réseau des stations de pompage.", ['5.9'], ANSSI.hygiene, 'haute', 'en_cours', 'Actifs non protégés car non connus ; surface d’attaque sous-estimée.', 30, -78, 'u3', 'u3'],
  ['GAP-007', "Comptes d'anciens salariés toujours actifs", "La revue de l'annuaire a identifié 27 comptes de personnes parties depuis plus de 3 mois, dont 2 avec des droits VPN.", ['5.18', '6.5'], ANSSI.ad, 'critique', 'corrigee', 'Accès illégitime au SI par d’anciens collaborateurs.', 7, -75, 'u1', 'u5'],
  ['GAP-008', 'Absence de processus de gestion des vulnérabilités', 'Les correctifs sont appliqués au cas par cas, sans veille, priorisation ni suivi des délais.', ['8.8'], ANSSI.hygiene, 'haute', 'en_cours', 'Exploitation de vulnérabilités connues (CVE publiques).', 40, -70, 'u2', 'u2'],
  ['GAP-009', 'Politique de sécurité non approuvée par la direction', "La PSSI date de 2017 et n'a jamais été validée formellement par le comité de direction.", ['5.1', '5.4'], ANSSI.nis2, 'haute', 'validee', 'Manque de légitimité des mesures ; non-conformité à l’article 20 NIS2.', -40, -120, 'u1', 'u1', { validatedDays: -60, validatedBy: 'u6' }],
  ['GAP-010', 'Pas de programme de sensibilisation à la cybersécurité', "Aucune action de sensibilisation n'a été menée ; les dirigeants n'ont pas suivi la formation exigée par NIS2.", ['6.3'], ANSSI.hygiene, 'moyenne', 'en_cours', 'Erreurs humaines, hameçonnage réussi.', 90, -65, 'u1', 'u5'],
  ['GAP-011', 'Réseau industriel (OT) non cloisonné du réseau bureautique', 'Les automates de traitement de l’eau sont joignables depuis le réseau bureautique sans filtrage.', ['8.22', '8.20'], ANSSI.ics, 'critique', 'en_cours', 'Propagation d’un rançongiciel vers la production ; risque sanitaire.', 75, -60, 'u1', 'u3'],
  ['GAP-012', 'Clauses de sécurité absentes des contrats fournisseurs', 'Les contrats d’infogérance et de maintenance SCADA ne comportent ni clause de sécurité, ni droit d’audit.', ['5.19', '5.20'], ANSSI.externe, 'moyenne', 'non_traitee', 'Compromission via un prestataire ; absence de recours.', 120, -55, 'u1', 'u1'],
  ['GAP-013', "Plan de continuité d'activité non formalisé", "Pas de PCA/PRA documenté ni d'exercice de crise.", ['5.29', '5.30'], ANSSI.crise, 'haute', 'non_traitee', 'Interruption prolongée de la distribution d’eau en cas de sinistre.', 150, -50, 'u1', 'u3'],
  ['GAP-014', 'Comptes administrateurs utilisés pour la bureautique', 'Les administrateurs utilisaient leur compte à privilèges pour la messagerie et la navigation web.', ['8.2'], ANSSI.admin, 'haute', 'validee', 'Vol des identifiants à privilèges par un simple hameçonnage.', -210, -260, 'u2', 'u2', { validatedDays: -200, validatedBy: 'u1' }],
  ['GAP-015', 'Salle serveur sans contrôle d’accès journalisé', "L'accès à la salle serveur se fait par clé physique, sans traçabilité.", ['7.2', '7.4'], ANSSI.hygiene, 'moyenne', 'corrigee', 'Intrusion physique non détectée.', 10, -48, 'u3', 'u3'],
  ['GAP-016', 'Antivirus non déployé sur 15 % des postes', "Une quarantaine de postes (principalement en stations) n'avaient pas d'EDR.", ['8.7', '8.1'], ANSSI.hygiene, 'haute', 'validee', 'Infection par logiciel malveillant non détectée.', -35, -110, 'u2', 'u2', { validatedDays: -30, validatedBy: 'u1' }],
  ['GAP-017', 'Horloges des serveurs non synchronisées', 'Plusieurs serveurs dérivaient de plusieurs minutes, rendant les journaux inexploitables.', ['8.17'], ANSSI.logs, 'basse', 'validee', 'Corrélation d’événements impossible lors d’une investigation.', -105, -130, 'u2', 'u2', { validatedDays: -100, validatedBy: 'u1' }],
  ['GAP-018', 'Aucune analyse de risques formalisée', "Aucune analyse de risques n'a été conduite sur le périmètre NIS2 (méthode EBIOS RM recommandée).", ['5.1', '5.7'], ANSSI.ebios, 'haute', 'non_traitee', 'Mesures de sécurité non priorisées selon les risques réels.', 60, -45, 'u1', 'u1', { nis2: ['20', '21.2.a'] }],
  ['GAP-019', 'Politique de mots de passe non conforme', 'Mots de passe de 8 caractères sans complexité, jamais renouvelés en cas de compromission.', ['5.17'], ANSSI.mfa, 'moyenne', 'validee', 'Cassage de mots de passe par force brute.', -20, -100, 'u2', 'u2', { validatedDays: -15, validatedBy: 'u1' }],
  ['GAP-020', 'Environnements de test alimentés avec des données de production', 'La recette de la facturation utilise une copie complète de la base clients.', ['8.31', '8.33'], ANSSI.hygiene, 'moyenne', 'non_traitee', 'Fuite de données personnelles depuis un environnement moins protégé.', 100, -40, 'u3', 'u3'],
  ['GAP-021', 'Supports amovibles USB non contrôlés', 'Les clés USB sont utilisées librement, y compris sur les postes de supervision industrielle.', ['7.10', '8.12'], ANSSI.ics, 'moyenne', 'en_cours', 'Introduction de logiciels malveillants, exfiltration de données.', -10, -58, 'u2', 'u2'],
  ['GAP-022', 'Messagerie sans protection anti-usurpation (SPF/DKIM/DMARC)', "Le domaine de messagerie n'a pas de politique DMARC ; des courriels usurpant la direction ont été reçus.", ['5.14', '8.21'], ANSSI.mail, 'moyenne', 'en_cours', 'Fraude au président, hameçonnage ciblé.', 25, -35, 'u2', 'u2'],
  ['GAP-023', 'Aucune revue indépendante de la sécurité', "Aucun audit externe de la sécurité n'a été réalisé depuis 5 ans.", ['5.35'], ANSSI.nis2, 'basse', 'non_traitee', 'Mauvaise appréciation du niveau de sécurité réel.', 200, -30, 'u1', 'u4'],
  ['GAP-024', 'Mise au rebut des disques sans effacement sécurisé', 'Les disques des postes réformés sont remis au recycleur sans effacement certifié.', ['7.14', '8.10'], ANSSI.hygiene, 'basse', 'corrigee', 'Récupération de données sur du matériel réformé.', 5, -28, 'u3', 'u3'],
  ['GAP-025', 'Accès VPN des prestataires sans MFA', "Les 4 prestataires de maintenance accèdent au SI par VPN avec un simple identifiant/mot de passe partagé.", ['8.5', '5.21'], ANSSI.mfa, 'critique', 'en_cours', 'Compromission via un compte prestataire partagé.', 15, -25, 'u1', 'u2'],
  ['GAP-026', 'Doublon : MFA VPN prestataires', 'Lacune créée en double de GAP-025, archivée.', ['8.5'], ANSSI.mfa, 'critique', 'non_traitee', '', 15, -24, 'u2', 'u2', { archived: true }],
]

// [id, gapId, titre, type, statut, avancement, début (j), cible (j), responsable, description]
type RemediationRow = [
  id: string,
  gapId: string,
  title: string,
  type: RemediationTypeId,
  status: RemediationStatusId,
  progress: number,
  startDays: number,
  targetDays: number,
  owner: string,
  description: string,
]

const REMEDIATIONS: RemediationRow[] = [
  ['IMP-001', 'GAP-001', 'Déployer une solution MFA (TOTP + clés FIDO2) pour les administrateurs', 'outil', 'en_cours', 60, -40, 15, 'u2', 'Clés FIDO2 commandées ; intégration à l’hyperviseur faite, reste la console SCADA.'],
  ['IMP-002', 'GAP-001', 'Rédiger la procédure d’enrôlement et de perte de facteur MFA', 'procedure', 'a_faire', 0, 0, 25, 'u1', ''],
  ['IMP-003', 'GAP-003', 'Mettre en place une sauvegarde hors ligne (bande / stockage immuable)', 'outil', 'en_cours', 70, -60, -5, 'u2', 'Stockage objet immuable en cours de configuration.'],
  ['IMP-004', 'GAP-003', 'Test de restauration trimestriel automatisé', 'automatisation', 'bloque', 20, -30, 10, 'u2', 'Bloqué : attente du serveur de test.'],
  ['IMP-005', 'GAP-004', 'Déployer un SIEM (Wazuh) et raccorder les sources critiques', 'outil', 'en_cours', 35, -20, 60, 'u2', 'Pare-feu et AD raccordés.'],
  ['IMP-006', 'GAP-004', 'Définir la politique de journalisation et la rétention (1 an)', 'procedure', 'valide', 100, -50, -20, 'u1', ''],
  ['IMP-007', 'GAP-005', 'Rédiger la procédure de notification ANSSI (24 h / 72 h / 1 mois)', 'procedure', 'a_faire', 0, -10, -2, 'u1', ''],
  ['IMP-008', 'GAP-005', 'Exercice de crise cyber avec la direction', 'formation', 'a_faire', 0, 20, 45, 'u1', ''],
  ['IMP-009', 'GAP-006', 'Découverte réseau automatisée et import CMDB', 'automatisation', 'en_cours', 55, -45, 30, 'u3', 'Scan passif OT en cours.'],
  ['IMP-010', 'GAP-007', 'Désactivation des comptes orphelins', 'bonne_pratique', 'valide', 100, -30, -10, 'u2', '27 comptes désactivés.'],
  ['IMP-011', 'GAP-007', 'Automatiser la désactivation à la sortie (SIRH → AD)', 'automatisation', 'en_cours', 80, -25, 7, 'u5', ''],
  ['IMP-012', 'GAP-008', 'Mettre en place un scanner de vulnérabilités hebdomadaire', 'outil', 'en_cours', 45, -30, 20, 'u2', ''],
  ['IMP-013', 'GAP-008', 'Procédure de gestion des correctifs avec délais par criticité', 'procedure', 'en_cours', 30, -15, 40, 'u2', ''],
  ['IMP-014', 'GAP-009', 'Refonte et approbation de la PSSI en comité de direction', 'procedure', 'valide', 100, -110, -60, 'u1', ''],
  ['IMP-015', 'GAP-010', 'Campagne de sensibilisation au hameçonnage (e-learning + simulation)', 'formation', 'en_cours', 40, -20, 60, 'u5', ''],
  ['IMP-016', 'GAP-010', 'Formation NIS2 des membres de la direction', 'formation', 'a_faire', 0, 30, 90, 'u1', ''],
  ['IMP-017', 'GAP-011', 'Installer un pare-feu industriel entre IT et OT', 'outil', 'en_cours', 25, -15, 75, 'u3', 'Matrice de flux validée.'],
  ['IMP-018', 'GAP-011', 'Cartographie des flux IT/OT', 'bonne_pratique', 'valide', 100, -55, -20, 'u3', ''],
  ['IMP-019', 'GAP-012', 'Annexe sécurité type pour les contrats fournisseurs', 'procedure', 'a_faire', 0, 30, 120, 'u1', ''],
  ['IMP-020', 'GAP-013', 'Rédiger le PCA/PRA et planifier un exercice annuel', 'procedure', 'a_faire', 0, 40, 150, 'u3', ''],
  ['IMP-021', 'GAP-014', 'Création de comptes d’administration dédiés + postes d’admin', 'bonne_pratique', 'valide', 100, -250, -210, 'u2', ''],
  ['IMP-022', 'GAP-015', 'Installer un contrôle d’accès par badge journalisé', 'outil', 'valide', 100, -40, -5, 'u3', ''],
  ['IMP-023', 'GAP-016', 'Déploiement de l’EDR sur l’ensemble du parc', 'outil', 'valide', 100, -100, -35, 'u2', ''],
  ['IMP-024', 'GAP-016', 'Alerte automatique sur les postes sans agent EDR', 'automatisation', 'valide', 100, -60, -35, 'u2', ''],
  ['IMP-025', 'GAP-017', 'Configurer NTP sur tous les serveurs', 'bonne_pratique', 'valide', 100, -125, -105, 'u2', ''],
  ['IMP-026', 'GAP-018', 'Conduire un atelier EBIOS RM sur le périmètre NIS2', 'bonne_pratique', 'a_faire', 0, 10, 60, 'u1', ''],
  ['IMP-027', 'GAP-019', 'Nouvelle politique : 12 caractères minimum + filtrage des mots de passe compromis', 'procedure', 'valide', 100, -90, -20, 'u2', ''],
  ['IMP-028', 'GAP-021', 'Bloquer les ports USB sur les postes de supervision (GPO)', 'automatisation', 'en_cours', 50, -40, -10, 'u2', ''],
  ['IMP-029', 'GAP-021', 'Installer une station blanche de décontamination', 'outil', 'a_faire', 0, 0, 30, 'u3', ''],
  ['IMP-030', 'GAP-022', 'Publier SPF, DKIM puis DMARC (p=quarantine)', 'bonne_pratique', 'en_cours', 65, -25, 25, 'u2', 'SPF et DKIM publiés.'],
  ['IMP-031', 'GAP-024', 'Contrat avec un prestataire d’effacement certifié', 'procedure', 'valide', 100, -25, -3, 'u3', ''],
  ['IMP-032', 'GAP-025', 'Bastion d’accès prestataires avec MFA et comptes nominatifs', 'outil', 'en_cours', 40, -20, 15, 'u2', ''],
]

// [id, gapId, nom, type, taille (octets), date (j), auteur, lien]
type EvidenceRow = [
  id: string,
  gapId: string,
  name: string,
  type: EvidenceTypeId,
  size: number | null,
  days: number,
  uploadedBy: string,
  url?: string,
]

const EVIDENCE: EvidenceRow[] = [
  ['PRV-001', 'GAP-009', 'PSSI_v3_approuvee_CODIR.pdf', 'procedure', 845_000, -61, 'u1'],
  ['PRV-002', 'GAP-009', 'PV_CODIR_approbation_PSSI.pdf', 'rapport', 212_000, -60, 'u6'],
  ['PRV-003', 'GAP-014', 'export_comptes_admin_dedies.csv', 'journal', 18_400, -201, 'u2'],
  ['PRV-004', 'GAP-016', 'rapport_couverture_EDR_100pct.pdf', 'rapport', 1_240_000, -31, 'u2'],
  ['PRV-005', 'GAP-016', 'capture_console_EDR.png', 'capture', 402_000, -31, 'u2'],
  ['PRV-006', 'GAP-017', 'chronyc_sources_serveurs.txt', 'journal', 6_200, -101, 'u2'],
  ['PRV-007', 'GAP-019', 'GPO_politique_mdp.png', 'capture', 310_000, -16, 'u2'],
  ['PRV-008', 'GAP-007', 'liste_comptes_desactives.xlsx', 'journal', 24_500, -9, 'u2'],
  ['PRV-009', 'GAP-015', 'journal_badges_salle_serveur.csv', 'journal', 52_000, -4, 'u3'],
  ['PRV-010', 'GAP-001', 'Configuration MFA hyperviseur (wiki interne)', 'procedure', null, -10, 'u2', 'https://wiki.interne.example/mfa-hyperviseur'],
  ['PRV-011', 'GAP-004', 'Politique_journalisation_v1.pdf', 'procedure', 380_000, -20, 'u1'],
]

let historySeq = 0
const hist = (gapId: string, days: number, userId: string, action: string, details = ''): HistoryEntry => ({
  id: `H-${String(++historySeq).padStart(4, '0')}`,
  gapId,
  date: new Date(`${addDays(today(), days)}T${String(8 + (historySeq % 9)).padStart(2, '0')}:${String((historySeq * 7) % 60).padStart(2, '0')}:00`).toISOString(),
  userId,
  action,
  details,
})

export const buildDemoData = (): ComplianceState => {
  const base = today()
  const d = (n: number) => addDays(base, n)
  const ts = (n: number, h = 9) => new Date(`${d(n)}T${String(h).padStart(2, '0')}:15:00`).toISOString()
  historySeq = 0
  const history: HistoryEntry[] = []

  const gaps = GAPS.map(([id, title, description, controlIds, anssiRef, criticality, status, impact, due, created, createdBy, assignee, extra = {}]) => {
    const gap: Gap = {
      id,
      title,
      description,
      controlIds,
      nis2Refs: extra.nis2 ?? suggestNis2(controlIds),
      anssiRef,
      criticality,
      status,
      impact,
      dueDate: d(due),
      createdAt: ts(created),
      createdBy,
      assignee,
      updatedAt: ts(Math.min(created + 12, -1), 14),
      updatedBy: assignee,
      archived: !!extra.archived,
      validation: null,
      nextReviewDate: null,
      reviews: [],
    }
    history.push(hist(id, created, createdBy, 'Création', `Lacune créée (criticité ${CRITICALITY_BY_ID[criticality].label}).`))
    if (status !== 'non_traitee') history.push(hist(id, created + 5, assignee, 'Statut modifié', 'Non traitée → En cours'))
    if (status === 'corrigee' || status === 'validee')
      history.push(hist(id, (extra.validatedDays ?? -3) - 2, assignee, 'Statut modifié', 'En cours → Corrigée'))
    if (status === 'validee' && extra.validatedDays != null && extra.validatedBy) {
      const vDate = d(extra.validatedDays)
      gap.validation = { by: extra.validatedBy, date: ts(extra.validatedDays, 16), comment: 'Preuves vérifiées, mesure conforme.' }
      gap.nextReviewDate = addMonths(vDate, CRITICALITY_BY_ID[criticality].reviewMonths)
      gap.updatedAt = gap.validation.date
      gap.updatedBy = extra.validatedBy
      history.push(hist(id, extra.validatedDays, extra.validatedBy, 'Validation', 'Corrigée → Validée. Preuves vérifiées, mesure conforme.'))
    }
    if (extra.archived) history.push(hist(id, created + 1, 'u1', 'Archivage', 'Doublon de GAP-025.'))
    return gap
  })

  // Une revue périodique déjà réalisée, pour l'exemple.
  const g17 = gaps.find((g) => g.id === 'GAP-017')!
  g17.reviews.push({ id: 'REV-001', date: ts(-10, 11), by: 'u1', outcome: 'conforme', comment: 'Contrôle chrony OK sur 42 serveurs.' })
  g17.nextReviewDate = addMonths(d(-10), CRITICALITY_BY_ID[g17.criticality].reviewMonths)
  history.push(hist('GAP-017', -10, 'u1', 'Revue périodique', 'Toujours conforme. Contrôle chrony OK sur 42 serveurs.'))

  const createdOffset = new Map(GAPS.map((g) => [g[0], g[9]]))
  const remediations = REMEDIATIONS.map(([id, gapId, title, type, status, progress, start, target, owner, description]) => {
    // Une remédiation planifiée dans le futur a été saisie dans le passé.
    const logged = Math.max((createdOffset.get(gapId) ?? start) + 1, Math.min(start, -1))
    history.push(hist(gapId, logged, owner, 'Remédiation ajoutée', `${id} : ${title}`))
    const rem: Remediation = { id, gapId, title, type, status, progress, startDate: d(start), targetDate: d(target), owner, description }
    return rem
  })

  const evidence = EVIDENCE.map(([id, gapId, name, type, size, days, uploadedBy, url]) => {
    history.push(hist(gapId, days, uploadedBy, 'Preuve ajoutée', name))
    const ev: Evidence = { id, gapId, name, type, size, url: url ?? null, dataUrl: null, uploadedAt: ts(days, 10), uploadedBy, demo: true }
    return ev
  })

  history.sort((a, b) => a.date.localeCompare(b.date))

  const q = (months: number) => addMonths(base, months)
  const milestones: Milestone[] = [
    { id: 'M1', date: q(3), label: 'Lacunes critiques traitées', target: 40 },
    { id: 'M2', date: q(6), label: 'Mise en conformité NIS2 socle', target: 70 },
    { id: 'M3', date: q(12), label: 'Conformité complète', target: 100 },
  ]

  return {
    version: 1,
    organization: ORGANIZATION,
    users: DEMO_USERS,
    currentUserId: 'u1',
    gaps,
    remediations,
    evidence,
    history,
    milestones,
    counters: { gap: 26, remediation: 32, evidence: 11, history: historySeq, review: 1 },
    lastUpdated: new Date().toISOString(),
  }
}
