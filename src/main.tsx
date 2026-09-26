import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { IS_ARTIFACT } from './platform'
import { ComplianceProvider } from './store/ComplianceContext'
import './styles/design-system.css'
import './styles/app.css'

// La page hébergée ne peut pas s'appuyer sur l'URL : navigation en mémoire.
const Router = IS_ARTIFACT ? MemoryRouter : BrowserRouter

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable')

createRoot(root).render(
  <StrictMode>
    <Router>
      <ComplianceProvider>
        <App />
      </ComplianceProvider>
    </Router>
  </StrictMode>,
)
