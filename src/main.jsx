import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App.jsx'
import { IS_ARTIFACT } from './platform.js'
import { ComplianceProvider } from './store/ComplianceContext.jsx'
import './styles/design-system.css'
import './styles/app.css'

// La page hébergée ne peut pas s'appuyer sur l'URL : navigation en mémoire.
const Router = IS_ARTIFACT ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <ComplianceProvider>
        <App />
      </ComplianceProvider>
    </Router>
  </StrictMode>,
)
