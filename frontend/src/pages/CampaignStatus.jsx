import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import OutcomeBar from '../components/OutcomeBar.jsx'
import AgentCard from '../components/AgentCard.jsx'

export default function CampaignStatus() {
  const { id } = useParams()
  const [agents, setAgents] = useState({})
  const [campaignDone, setCampaignDone] = useState(false)
  const [error, setError] = useState(null)
  const esRef = useRef(null)

  // Load initial snapshot then open SSE stream
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const res = await fetch(`/api/campaign/${id}/status`)
        if (!res.ok) throw new Error(`Campaign not found (${res.status})`)
        const data = await res.json()
        if (cancelled) return
        setAgents(indexById(data.agents))
        if (data.done) setCampaignDone(true)
      } catch (err) {
        if (!cancelled) setError(err.message)
        return
      }

      // Open SSE
      const es = new EventSource(`/api/campaign/${id}/stream`)
      esRef.current = es

      es.addEventListener('step', e => {
        const agent = JSON.parse(e.data)
        setAgents(prev => ({ ...prev, [agent.agentId]: agent }))
      })

      es.addEventListener('done', () => {
        setCampaignDone(true)
        es.close()
      })

      es.onerror = () => {
        // SSE will auto-reconnect; only flag if we get a hard close
        if (es.readyState === EventSource.CLOSED) {
          setError('Lost connection to campaign stream.')
        }
      }
    }

    init()
    return () => {
      cancelled = true
      esRef.current?.close()
    }
  }, [id])

  const agentList = Object.values(agents).sort((a, b) =>
    a.agentId.localeCompare(b.agentId)
  )

  return (
    <>
      <div className="status-header">
        <div className="status-header-left">
          <h1 className="page-title">Campaign Live</h1>
          <div className="campaign-id">ID: {id}</div>
        </div>
        <div className="status-badge">
          {campaignDone
            ? <><span className="pulse-dot inactive" /> Complete</>
            : <><span className="pulse-dot" /> Running</>
          }
        </div>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: 24 }}>{error}</div>
      )}

      <OutcomeBar agents={agents} />

      {agentList.length === 0 ? (
        <div className="state-placeholder">
          {error ? 'Could not load agents.' : 'Spawning agents…'}
        </div>
      ) : (
        <div className="agent-grid">
          {agentList.map(agent => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}

      {campaignDone && (
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <Link to="/" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
            New Campaign
          </Link>
        </div>
      )}
    </>
  )
}

function indexById(agents = []) {
  return Object.fromEntries(agents.map(a => [a.agentId, a]))
}
