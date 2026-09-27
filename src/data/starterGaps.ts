/**
 * Données de départ proposées à la première installation : lacunes fréquentes
 * dans une entité soumise à NIS2. Elles sont créées « à confirmer » : chaque
 * organisme garde celles qui le concernent et archive les autres.
 */
import type { CriticalityId, Nis2Id } from '../types'

export interface StarterGap {
  title: string
  description: string
  controlIds: string[]
  /** Exigences NIS2 explicites ; à défaut, déduites des mesures ISO. */
  nis2Refs?: Nis2Id[]
  anssiRef: string
  criticality: CriticalityId
  impact: string
}

const ANSSI = {
  nis2: 'ANSSI : Référentiel des mesures de sécurité NIS2 (à confirmer selon la version publiée)',
  hygiene: "ANSSI : Guide d'hygiène informatique",
  mfa: "ANSSI : Recommandations relatives à l'authentification multifacteur et aux mots de passe",
  admin: "ANSSI : Recommandations relatives à l'administration sécurisée des SI",
  backup: 'ANSSI : Fondamentaux de la sauvegarde des systèmes d’information',
  logs: 'ANSSI : Recommandations de sécurité pour la mise en œuvre d’un système de journalisation',
  crise: 'ANSSI : Guide « Crise d’origine cyber, les clés d’une gestion opérationnelle et stratégique »',
  externe: "ANSSI : Maîtriser les risques de l'infogérance",
}

/** Échéance proposée selon la criticité, en mois après la création. */
export const STARTER_DUE_MONTHS: Record<CriticalityId, number> = { critique: 3, haute: 6, moyenne: 9, basse: 12 }

export const STARTER_GAPS: StarterGap[] = [
  {
    title: 'Politique de sécurité des SI absente ou non approuvée par la direction',
    description: 'Aucune politique de sécurité formalisée, ou une politique ancienne jamais validée ni communiquée par la direction.',
    controlIds: ['5.1'],
    nis2Refs: ['20', '21.2.a'],
    anssiRef: ANSSI.nis2,
    criticality: 'haute',
    impact: 'Les mesures de sécurité ne reposent sur aucun cadre validé ; la direction ne peut pas démontrer sa supervision.',
  },
  {
    title: 'Rôles et responsabilités de sécurité non formalisés',
    description: 'Le RSSI, les correspondants sécurité et les responsables de chaque mesure ne sont pas désignés par écrit.',
    controlIds: ['5.2'],
    anssiRef: ANSSI.nis2,
    criticality: 'moyenne',
    impact: 'Actions de sécurité non suivies faute de responsable identifié.',
  },
  {
    title: 'Inventaire des actifs incomplet',
    description: 'Il n’existe pas de liste à jour des serveurs, postes, applications, comptes et données sensibles, avec leur propriétaire.',
    controlIds: ['5.9'],
    anssiRef: ANSSI.hygiene,
    criticality: 'haute',
    impact: 'Impossible de protéger ou de mettre à jour ce qui n’est pas connu ; périmètre des incidents difficile à évaluer.',
  },
  {
    title: 'Authentification multifacteur absente sur les accès distants et les comptes à privilèges',
    description: 'Le VPN, la messagerie en ligne et les comptes d’administration sont accessibles avec un simple mot de passe.',
    controlIds: ['8.5'],
    nis2Refs: ['21.2.j', '21.2.i'],
    anssiRef: ANSSI.mfa,
    criticality: 'critique',
    impact: 'Un mot de passe volé ou deviné suffit pour entrer dans le système d’information.',
  },
  {
    title: 'Comptes d’administration non séparés des comptes bureautiques',
    description: 'Les administrateurs naviguent sur Internet et lisent leurs courriels avec des comptes disposant de droits élevés.',
    controlIds: ['8.2'],
    anssiRef: ANSSI.admin,
    criticality: 'critique',
    impact: 'Un simple hameçonnage peut donner la maîtrise complète du système d’information.',
  },
  {
    title: 'Revue périodique des droits d’accès non réalisée',
    description: 'Les droits d’accès aux applications et aux partages ne sont jamais revus avec les responsables métier.',
    controlIds: ['5.18'],
    anssiRef: ANSSI.hygiene,
    criticality: 'haute',
    impact: 'Accumulation de droits inutiles et comptes d’anciens salariés ou prestataires encore actifs.',
  },
  {
    title: 'Arrivées et départs sans procédure de gestion des accès',
    description: 'La création et la suppression des comptes dépendent de demandes informelles, sans lien avec les RH.',
    controlIds: ['5.16', '5.18'],
    anssiRef: ANSSI.hygiene,
    criticality: 'haute',
    impact: 'Comptes orphelins exploitables après le départ d’une personne.',
  },
  {
    title: 'Sauvegardes non isolées et jamais testées',
    description: 'Les sauvegardes sont accessibles depuis le réseau de production et aucune restauration complète n’a été testée.',
    controlIds: ['8.13'],
    anssiRef: ANSSI.backup,
    criticality: 'critique',
    impact: 'Un rançongiciel peut chiffrer les sauvegardes ; reprise d’activité incertaine.',
  },
  {
    title: 'Plan de continuité et de reprise d’activité non formalisé ou non testé',
    description: 'Les services essentiels, les durées d’interruption acceptables et les procédures de reprise ne sont pas documentés.',
    controlIds: ['5.29', '5.30'],
    anssiRef: ANSSI.crise,
    criticality: 'haute',
    impact: 'Interruption prolongée des services essentiels en cas d’incident majeur.',
  },
  {
    title: 'Procédure de gestion des incidents absente',
    description: 'Pas de procédure décrivant la détection, la qualification, l’escalade et le traitement d’un incident de sécurité.',
    controlIds: ['5.24', '5.26'],
    anssiRef: ANSSI.crise,
    criticality: 'haute',
    impact: 'Réaction improvisée, perte de traces utiles et aggravation de l’incident.',
  },
  {
    title: 'Notification des incidents importants (24 h / 72 h) non organisée',
    description: 'Le circuit d’alerte précoce, de notification et de rapport final vers l’ANSSI (CERT-FR) n’est pas défini.',
    controlIds: ['5.24', '6.8'],
    nis2Refs: ['23', '21.2.b'],
    anssiRef: ANSSI.nis2,
    criticality: 'haute',
    impact: 'Non-respect des délais légaux de notification et exposition à des sanctions.',
  },
  {
    title: 'Correctifs de sécurité appliqués sans délai maîtrisé',
    description: 'Les mises à jour des systèmes, des applications et des équipements réseau ne suivent aucun délai ni suivi.',
    controlIds: ['8.8'],
    anssiRef: ANSSI.hygiene,
    criticality: 'critique',
    impact: 'Exploitation de vulnérabilités connues et publiques.',
  },
  {
    title: 'Journalisation insuffisante et non centralisée',
    description: 'Les journaux des serveurs, pare-feu et annuaires ne sont ni centralisés, ni conservés assez longtemps, ni analysés.',
    controlIds: ['8.15', '8.16'],
    anssiRef: ANSSI.logs,
    criticality: 'haute',
    impact: 'Détection tardive des attaques et enquête impossible après un incident.',
  },
  {
    title: 'Réseau non cloisonné',
    description: 'Postes bureautiques, serveurs, administration et équipements industriels partagent le même réseau.',
    controlIds: ['8.22'],
    anssiRef: ANSSI.hygiene,
    criticality: 'haute',
    impact: 'Propagation rapide d’un attaquant ou d’un rançongiciel à tout le système d’information.',
  },
  {
    title: 'Protection antivirus ou EDR non déployée sur tous les équipements',
    description: 'Certains postes et serveurs n’ont pas de protection contre les codes malveillants, ou elle n’est pas supervisée.',
    controlIds: ['8.7'],
    anssiRef: ANSSI.hygiene,
    criticality: 'haute',
    impact: 'Infection non détectée d’une partie du parc.',
  },
  {
    title: 'Configuration de référence des postes et serveurs non définie',
    description: 'Aucun durcissement standard (services inutiles, comptes par défaut, droits locaux) n’est appliqué.',
    controlIds: ['8.9'],
    anssiRef: ANSSI.hygiene,
    criticality: 'moyenne',
    impact: 'Surface d’attaque inutilement large et configurations hétérogènes.',
  },
  {
    title: 'Politique de chiffrement non définie',
    description: 'Les postes nomades, les supports amovibles et les échanges de données sensibles ne sont pas chiffrés.',
    controlIds: ['8.24'],
    anssiRef: ANSSI.nis2,
    criticality: 'moyenne',
    impact: 'Fuite de données en cas de perte ou de vol d’un équipement.',
  },
  {
    title: 'Sensibilisation à la cybersécurité non réalisée pour l’ensemble du personnel',
    description: 'Aucun programme régulier de sensibilisation (hameçonnage, mots de passe, signalement des incidents).',
    controlIds: ['6.3'],
    anssiRef: ANSSI.hygiene,
    criticality: 'moyenne',
    impact: 'Le personnel reste la première porte d’entrée des attaques.',
  },
  {
    title: 'Direction non formée à la cybersécurité',
    description: 'Les membres de la direction n’ont suivi aucune formation, alors que NIS2 l’exige des organes de direction.',
    controlIds: ['6.3'],
    nis2Refs: ['20', '21.2.g'],
    anssiRef: ANSSI.nis2,
    criticality: 'moyenne',
    impact: 'Décisions de sécurité mal éclairées et responsabilité de la direction engagée.',
  },
  {
    title: 'Exigences de sécurité absentes des contrats fournisseurs',
    description: 'Les contrats d’infogérance, de maintenance et de services en nuage ne prévoient ni exigences de sécurité ni droit d’audit.',
    controlIds: ['5.19', '5.20'],
    anssiRef: ANSSI.externe,
    criticality: 'haute',
    impact: 'Un fournisseur compromis peut servir de point d’entrée sans recours contractuel.',
  },
  {
    title: 'Efficacité des mesures de sécurité jamais évaluée',
    description: 'Ni audit, ni test d’intrusion, ni indicateurs de suivi ne permettent de vérifier que les mesures fonctionnent.',
    controlIds: ['5.35'],
    anssiRef: ANSSI.nis2,
    criticality: 'moyenne',
    impact: 'Fausse impression de sécurité ; écarts découverts lors d’un incident ou d’un contrôle.',
  },
]
