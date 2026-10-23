/** Domaines e-mail de l'organisme : repérage des comptes externes (consultants, auditeurs, prestataires). */

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** Domaine d'une adresse e-mail, en minuscules (chaîne vide si l'adresse est invalide). */
export const emailDomain = (email: string): string => {
  const at = email.lastIndexOf('@')
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : ''
}

export const isValidDomain = (domain: string): boolean => DOMAIN_RE.test(domain)

/** Découpe une saisie libre (« exemple.fr, filiale.fr ») en domaines normalisés, sans doublon. */
export const parseDomains = (input: string): string[] => [
  ...new Set(
    input
      .split(/[\s,;]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  ),
]

/** Vrai si l'adresse n'appartient à aucun domaine de l'organisme. Sans domaine déclaré, personne n'est externe. */
export const isExternalEmail = (email: string, domains: readonly string[] | undefined): boolean =>
  !!domains?.length && !domains.includes(emailDomain(email))
