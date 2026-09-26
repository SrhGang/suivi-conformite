/**
 * Mode « artifact » : version publiée comme page hébergée (claude.ai).
 * Dans ce cadre, les téléchargements, l'impression et les URL de navigation
 * sont indisponibles : on adapte le routage et les exports.
 */
export const IS_ARTIFACT = import.meta.env.MODE === 'artifact'
