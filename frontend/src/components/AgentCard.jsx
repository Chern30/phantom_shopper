const PHASE_LABELS = {
  exploring: 'Exploring',
  choosing: 'Choosing',
  purchased: 'Purchased',
  gave_up: 'Gave Up',
}

function truncateUrl(url) {
  if (!url) return '—'
  try {
    const u = new URL(url)
    const path = u.hostname + u.pathname
    return path.length > 48 ? path.slice(0, 48) + '…' : path
  } catch {
    return url.length > 48 ? url.slice(0, 48) + '…' : url
  }
}

function cardClass(agent) {
  const classes = ['agent-card']
  if (agent.outcome) classes.push('terminal')
  if (agent.outcome === 'purchased_brand') classes.push('purchased-brand')
  if (agent.outcome === 'purchased_competitor') classes.push('purchased-competitor')
  return classes.join(' ')
}

export default function AgentCard({ agent }) {
  const isActive = !agent.outcome
  const phase = agent.phase || 'exploring'

  return (
    <div className={cardClass(agent)}>
      <div className="agent-card-header">
        <span className="agent-name">
          {agent.personaLabel} #{agent.instanceNum}
        </span>
        <span className={`phase-badge ${phase}`}>
          {PHASE_LABELS[phase] ?? phase}
        </span>
      </div>

      <div className="agent-url">{truncateUrl(agent.currentUrl)}</div>

      <div className="agent-narration">
        {agent.narration || 'Starting up…'}
      </div>

      <div className="agent-card-footer">
        <span className="agent-step-count">
          Step <span>{agent.stepCount ?? 0}</span>
        </span>
        <span className={`pulse-dot ${isActive ? '' : 'inactive'}`} />
      </div>
    </div>
  )
}
