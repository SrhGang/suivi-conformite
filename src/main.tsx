import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import AuthGate from './components/AuthGate'
import { IS_ARTIFACT, USE_API } from './platform'
import { ComplianceProvider } from './store/ComplianceContext'
import './styles/fonts.css'
import './styles/design-system.css'
import './styles/app.css'
import { applyColorMode, resolveColorMode } from './theme'

applyColorMode(resolveColorMode())

// La page hébergée ne peut pas s'appuyer sur l'URL : navigation en mémoire.
const Router = IS_ARTIFACT ? MemoryRouter : BrowserRouter

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <Router>
      {USE_API ? (
        <AuthGate>
          {(onSessionExpired) => (
            <ComplianceProvider onSessionExpired={onSessionExpired}>
              <App />
            </ComplianceProvider>
          )}
        </AuthGate>
      ) : (
        <ComplianceProvider>
          <App />
        </ComplianceProvider>
      )}
    </Router>
  </StrictMode>,
)
