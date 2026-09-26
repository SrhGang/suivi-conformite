/**
 * Modes d'exécution :
 *  - « artifact » : page unique hébergée (démo en ligne) → données locales,
 *    téléchargements et impression indisponibles, navigation en mémoire ;
 *  - VITE_BACKEND=api : version de production branchée sur l'API
 *    (authentification, PostgreSQL) ;
 *  - sinon : démonstration locale (données dans le navigateur).
 */
export const IS_ARTIFACT = import.meta.env.MODE === 'artifact'
export const USE_API = !IS_ARTIFACT && import.meta.env.VITE_BACKEND === 'api'
