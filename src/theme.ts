/**
 * Thème clair / sombre, comme le réglage « Dark mode » du tableau de bord
 * Wazuh. Le choix est appliqué via l'attribut `data-color-mode` sur <html>.
 *
 * Priorité : choix enregistré par l'utilisateur > thème imposé par la page
 * hôte (`data-theme`, version en ligne) > préférence du système.
 */
import { useCallback, useEffect, useState } from 'react'

export type ColorMode = 'light' | 'dark'

const STORAGE_KEY = 'suivi-conformite:theme'

const readStored = (): ColorMode | null => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const systemMode = (): ColorMode => {
  const host = document.documentElement.getAttribute('data-theme')
  if (host === 'light' || host === 'dark') return host
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const resolveColorMode = (): ColorMode => readStored() ?? systemMode()

export const applyColorMode = (mode: ColorMode): void => {
  const root = document.documentElement
  root.setAttribute('data-color-mode', mode)
  root.style.colorScheme = mode
}

/** Hook du sélecteur de thème de l'en-tête. */
export function useColorMode(): [ColorMode, () => void] {
  const [mode, setMode] = useState<ColorMode>(resolveColorMode)

  useEffect(() => applyColorMode(mode), [mode])

  // Sans choix enregistré, on suit les changements du système et de la page hôte.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = () => {
      if (!readStored()) setMode(systemMode())
    }
    mq.addEventListener('change', onChange)
    // Version en ligne : la page hôte peut changer son thème (attribut data-theme).
    const observer = new MutationObserver(onChange)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', onChange)
      observer.disconnect()
    }
  }, [])

  const toggle = useCallback(() => {
    setMode((m) => {
      const next: ColorMode = m === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* préférence non conservée */
      }
      return next
    })
  }, [])

  return [mode, toggle]
}
