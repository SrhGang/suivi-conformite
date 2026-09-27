/** Éléments partagés par la page Utilisateurs et l'assistant d'installation. */
import { ADMIN_ROLE, ROLES } from '../data/constants'
import type { Role } from '../types'

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

/** Champs nom et secteur de l'organisme (page Utilisateurs et assistant d'installation). */
export function OrganizationFields({
  value,
  onChange,
}: {
  value: { name: string; sector: string }
  onChange: (v: { name: string; sector: string }) => void
}) {
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
    </>
  )
}
