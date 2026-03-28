import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-badge">AI-Powered Research</div>
        <h1 className="home-title">Digital Mystery Shopper</h1>
        <p className="home-subtitle">
          Deploy AI consumer personas to track your brand's visibility
          across the full customer journey.
        </p>
        <button className="btn-primary btn-large" onClick={() => navigate('/setup')}>
          Start Experiment
        </button>
      </div>

      <div className="home-experiments">
        <div className="home-experiments-header">Past Experiments</div>
        <div className="state-placeholder">No experiments yet.</div>
      </div>
    </div>
  )
}
