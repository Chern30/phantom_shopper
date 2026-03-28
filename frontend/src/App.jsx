import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import ExperimentSetup from './pages/ExperimentSetup.jsx'
import CampaignStatus from './pages/CampaignStatus.jsx'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="logo">
            <span className="logo-icon">◈</span>
            <span className="logo-text">Mystery Shopper</span>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<ExperimentSetup />} />
          <Route path="/experiment/:id" element={<CampaignStatus />} />
        </Routes>
      </main>
    </div>
  )
}
