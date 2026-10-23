import { describe, expect, it } from 'vitest'
import { emailDomain, isExternalEmail, isValidDomain, parseDomains } from '../utils/domains'

describe('domaines e-mail de l’organisme', () => {
  it('extrait et normalise le domaine', () => {
    expect(emailDomain('Chloe.Martin@Regie-Eaux.FR')).toBe('regie-eaux.fr')
    expect(emailDomain('invalide')).toBe('')
  })

  it('découpe une saisie libre', () => {
    expect(parseDomains(' regie-eaux.fr, @Filiale.fr ;regie-eaux.fr ')).toEqual(['regie-eaux.fr', 'filiale.fr'])
    expect(isValidDomain('regie-eaux.fr')).toBe(true)
    expect(isValidDomain('pas un domaine')).toBe(false)
    expect(isValidDomain('localhost')).toBe(false)
  })

  it('repère les adresses externes (comparaison exacte, sans sous-domaine implicite)', () => {
    const domains = ['regie-eaux.fr']
    expect(isExternalEmail('rssi@regie-eaux.fr', domains)).toBe(false)
    expect(isExternalEmail('auditeur@cabinet.fr', domains)).toBe(true)
    expect(isExternalEmail('it@dsi.regie-eaux.fr', domains)).toBe(true)
    expect(isExternalEmail('auditeur@cabinet.fr', [])).toBe(false)
    expect(isExternalEmail('auditeur@cabinet.fr', undefined)).toBe(false)
  })
})
