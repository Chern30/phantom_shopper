export default function OutcomeBar({ agents }) {
  const counts = {
    shopping: 0,
    brand: 0,
    competitor: 0,
    abandoned: 0,
  }

  for (const agent of Object.values(agents)) {
    if (agent.outcome === 'purchased_brand') counts.brand++
    else if (agent.outcome === 'purchased_competitor') counts.competitor++
    else if (agent.outcome === 'abandoned') counts.abandoned++
    else counts.shopping++
  }

  return (
    <div className="outcome-bar">
      <div className="outcome-card shopping">
        <div className="outcome-count">{counts.shopping}</div>
        <div className="outcome-label">Still Shopping</div>
      </div>
      <div className="outcome-card brand">
        <div className="outcome-count">{counts.brand}</div>
        <div className="outcome-label">Purchased Your Brand</div>
      </div>
      <div className="outcome-card competitor">
        <div className="outcome-count">{counts.competitor}</div>
        <div className="outcome-label">Purchased Competitor</div>
      </div>
      <div className="outcome-card abandoned">
        <div className="outcome-count">{counts.abandoned}</div>
        <div className="outcome-label">Gave Up</div>
      </div>
    </div>
  )
}
