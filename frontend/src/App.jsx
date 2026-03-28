import { Routes, Route } from 'react-router-dom'
import CampaignSetup from './pages/CampaignSetup.jsx'
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
          <Route path="/" element={<CampaignSetup />} />
          <Route path="/campaign/:id" element={<CampaignStatus />} />
        </Routes>
      </main>
    </div>
  )
}
