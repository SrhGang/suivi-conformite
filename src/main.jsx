import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ComplianceProvider } from './store/ComplianceContext.jsx'
import './styles/design-system.css'
import './styles/app.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ComplianceProvider>
        <App />
      </ComplianceProvider>
    </BrowserRouter>
  </StrictMode>,
)
