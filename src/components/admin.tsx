/** Éléments partagés par la page Utilisateurs et l'assistant d'installation. */
import { useState } from 'react'
import { ADMIN_ROLE, ROLES } from '../data/constants'
import type { Organization, Role } from '../types'
import { parseDomains } from '../utils/domains'

const ROLE_IDS: Role[] = ['responsable', 'contributeur', 'lecteur']

/** Rappel des rôles : trois rôles métier et le rôle d'administration. */
export function RolesHelp() {
  return (
    <div className="card roles-help">
      <h2 className="card__title">Les rôles</h2>
      <dl className="roles-help__list">
        {ROLE_IDS.map((r) => (
          <div key={r}>
            <dt>{ROLES[r].label}</dt>
            <dd>{ROLES[r].description}</dd>
          </div>
        ))}
        <div>
          <dt>{ADMIN_ROLE.label}</dt>
          <dd>{ADMIN_ROLE.description} Un administrateur ne peut pas modifier ses propres droits (séparation des tâches).</dd>
        </div>
      </dl>
    </div>
  )
}

/** Champs nom, secteur et domaines e-mail de l'organisme (page Utilisateurs et assistant d'installation). */
export function OrganizationFields({ value, onChange }: { value: Organization; onChange: (v: Organization) => void }) {
  // Saisie libre conservée telle quelle (virgules, espaces) ; la liste est normalisée à chaque frappe.
  const [domainsText, setDomainsText] = useState((value.domains ?? []).join(', '))
  return (
    <>
      <div className="field">
        <label htmlFor="org-name">Nom de l’organisme *</label>
        <input
          id="org-name"
          className="input"
          required
          minLength={2}
          maxLength={160}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="org-sector">Secteur et statut NIS2</label>
        <input
          id="org-sector"
          className="input"
          maxLength={200}
          value={value.sector}
          onChange={(e) => onChange({ ...value, sector: e.target.value })}
          placeholder="Ex : Eau potable, entité essentielle NIS2"
        />
      </div>
      <div className="field">
        <label htmlFor="org-domains">Domaines e-mail de l’organisme</label>
        <input
          id="org-domains"
          className="input"
          value={domainsText}
          onChange={(e) => {
            setDomainsText(e.target.value)
            onChange({ ...value, domains: parseDomains(e.target.value) })
          }}
          placeholder="Ex : regie-eaux.fr, filiale.fr"
        />
        <span className="hint">
          Les comptes créés avec une autre adresse (consultant, auditeur, prestataire) restent autorisés, mais sont signalés « Externe ».
        </span>
      </div>
    </>
  )
}
