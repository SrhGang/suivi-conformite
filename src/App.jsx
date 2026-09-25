import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { EmptyState } from './components/ui.jsx'
import Dashboard from './pages/Dashboard.jsx'
import GapDetail from './pages/GapDetail.jsx'
import GapsInventory from './pages/GapsInventory.jsx'
import Referentiel from './pages/Referentiel.jsx'
import Roadmap from './pages/Roadmap.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="lacunes" element={<GapsInventory />} />
        <Route path="lacunes/:id" element={<GapDetail />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="referentiel" element={<Referentiel />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  return (
    <div className="page">
      <div className="card">
        <EmptyState icon="🧭" title="Page introuvable" action={<Link className="btn btn--primary" to="/">Retour au tableau de bord</Link>} />
      </div>
    </div>
  )
}
