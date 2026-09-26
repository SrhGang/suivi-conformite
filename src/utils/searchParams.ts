/** Valeurs acceptées pour mettre à jour les paramètres d'URL des filtres. */
export type ParamChanges = Record<string, string | number | boolean | null | undefined>

/**
 * Applique des changements aux paramètres d'URL : une valeur vide, nulle ou
 * `false` retire le paramètre ; `true` est codé « 1 ».
 */
export function applyParamChanges(params: URLSearchParams, changes: ParamChanges): URLSearchParams {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (value === '' || value == null || value === false) next.delete(key)
    else next.set(key, value === true ? '1' : String(value))
  }
  return next
}
