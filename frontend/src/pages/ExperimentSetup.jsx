import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const PLATFORMS = [
  { id: 'google',    label: 'Google' },
  { id: 'reddit',    label: 'Reddit' },
  { id: 'amazon',    label: 'Amazon' },
  { id: 'youtube',   label: 'YouTube' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'tiktok',    label: 'TikTok' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  function addTag(value) {
    const trimmed = value.trim().replace(/,$/, '')
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed])
    setInput('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="tag-input-container" onClick={() => inputRef.current?.focus()}>
      {tags.map(tag => (
        <span key={tag} className="tag">
          {tag}
          <button type="button" className="tag-remove" onClick={() => onChange(tags.filter(t => t !== tag))}>×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="tag-input"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  )
}

function Stepper({ value, onChange, min = 1, max = 3 }) {
  return (
    <div className="stepper">
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <span className="stepper-value">{value}</span>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  )
}

function SetupSection({ number, title, unlocked, children }) {
  return (
    <div className={`setup-section ${unlocked ? 'unlocked' : 'locked'}`}>
      <div className="setup-section-header">
        <span className="setup-section-number">{number}</span>
        <span className="setup-section-title">{title}</span>
        {!unlocked && <span className="setup-section-lock">Complete the previous section to unlock</span>}
      </div>
      {unlocked && <div className="setup-section-body">{children}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExperimentSetup() {
  const navigate = useNavigate()

  // Brand
  const [brand, setBrand] = useState({ name: '', url: '', category: '', competitors: [] })

  // Personas
  const [genState, setGenState] = useState('idle') // idle | loading | done | error
  const [genError, setGenError] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [personas, setPersonas] = useState([])
  // persona shape: { id, name, description, agentCount, agents: [{platform, name}], isCustom? }

  // Launch
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState(null)

  // Derived
  const brandComplete = brand.name.trim() && brand.url.trim() && brand.category.trim()
  const hasPersonas = personas.length > 0
  const totalAgents = personas.reduce((sum, p) => sum + p.agentCount, 0)
  const allPlatformsSet = personas.every(p => p.agents.every(a => a.platform))
  const canLaunch = !!brandComplete && hasPersonas && allPlatformsSet && !launching

  // ── Persona generation ──

  async function generatePersonas() {
    setGenState('loading')
    setGenError(null)
    try {
      const res = await fetch('/api/generate-personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: brand.name, brandUrl: brand.url, category: brand.category }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setSuggestions(data.personas)
      setGenState('done')
    } catch (err) {
      setGenError(err.message)
      setGenState('error')
    }
  }

  // ── Persona selection ──

  function makeAgents(count) {
    return Array.from({ length: count }, () => ({ platform: '', name: '' }))
  }

  function selectSuggestion(s) {
    if (personas.find(p => p.id === s.id) || personas.length >= 3) return
    setPersonas(prev => [...prev, { id: s.id, name: s.name, description: s.description, agentCount: 1, agents: makeAgents(1) }])
  }

  function deselectSuggestion(id) {
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  function addCustomPersona() {
    if (personas.length >= 3) return
    const id = `custom-${Date.now()}`
    setPersonas(prev => [...prev, { id, name: '', description: '', agentCount: 1, agents: makeAgents(1), isCustom: true }])
  }

  function removePersona(id) {
    setPersonas(prev => prev.filter(p => p.id !== id))
  }

  function updatePersona(id, field, value) {
    setPersonas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  // ── Agent config ──

  function setAgentCount(personaId, count) {
    setPersonas(prev => prev.map(p => {
      if (p.id !== personaId) return p
      const agents = Array.from({ length: count }, (_, i) => p.agents[i] || { platform: '', name: '' })
      return { ...p, agentCount: count, agents }
    }))
  }

  function setAgentPlatform(personaId, agentIdx, platform) {
    setPersonas(prev => prev.map(p => {
      if (p.id !== personaId) return p
      const agents = p.agents.map((a, i) => i === agentIdx ? { ...a, platform } : a)
      return { ...p, agents }
    }))
  }

  // ── Launch ──

  async function handleLaunch() {
    setLaunching(true)
    setLaunchError(null)
    try {
      // 1. Generate agent names
      const namesRes = await fetch('/api/generate-agent-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personas: personas.map(p => ({ id: p.id, name: p.name, description: p.description, count: p.agentCount })),
        }),
      })
      if (!namesRes.ok) throw new Error(`Failed to generate agent names`)
      const { agentNames } = await namesRes.json()
      // agentNames: [{ personaId, names: string[] }]

      // 2. Merge names into personas
      const namedPersonas = personas.map(p => {
        const match = agentNames.find(a => a.personaId === p.id)
        const agents = p.agents.map((a, i) => ({ ...a, name: match?.names[i] ?? `Agent ${i + 1}` }))
        return { ...p, agents }
      })

      // 3. Create experiment
      const expRes = await fetch('/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, personas: namedPersonas }),
      })
      if (!expRes.ok) throw new Error(`Failed to create experiment`)
      const { experimentId } = await expRes.json()
      window.location.href = `/monitor.html?exp=${experimentId}`
    } catch (err) {
      setLaunchError(err.message)
      setLaunching(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const atPersonaLimit = personas.length >= 3

  return (
    <>
      <h1 className="page-title">New Experiment</h1>
      <p className="page-subtitle">Configure your brand, personas, and agents.</p>

      <div className="setup-form">

        {/* ── Section 1: Brand ── */}
        <SetupSection number="1" title="Brand" unlocked>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Brand Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. IKEA"
                value={brand.name}
                onChange={e => setBrand(b => ({ ...b, name: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Brand URL</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. ikea.com"
                value={brand.url}
                onChange={e => setBrand(b => ({ ...b, url: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-field">
              <label className="form-label">Product / Category</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. minimalist sofa"
                value={brand.category}
                onChange={e => setBrand(b => ({ ...b, category: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-field">
              <label className="form-label">
                Competitors <span className="label-optional">(optional)</span>
              </label>
              <TagInput
                tags={brand.competitors}
                onChange={v => setBrand(b => ({ ...b, competitors: v }))}
                placeholder="Type a competitor and press Enter…"
              />
            </div>
          </div>
        </SetupSection>

        {/* ── Section 2: Personas ── */}
        <SetupSection number="2" title="Personas" unlocked={!!brandComplete}>
          {/* Generate row */}
          <div className="persona-gen-row">
            {genState !== 'done' && (
              <button
                className="btn-primary"
                onClick={generatePersonas}
                disabled={genState === 'loading'}
              >
                {genState === 'loading' ? (
                  <><span className="loading-spinner" /> Generating…</>
                ) : genState === 'error' ? 'Retry Generation' : 'Generate Personas'}
              </button>
            )}
            {genState === 'done' && (
              <button className="btn-ghost" onClick={generatePersonas} disabled={genState === 'loading'}>
                ↻ Regenerate
              </button>
            )}
            <button className="btn-ghost" onClick={addCustomPersona} disabled={atPersonaLimit}>
              + Custom Persona
            </button>
            {atPersonaLimit && <span className="label-optional">3 / 3 selected</span>}
          </div>

          {/* Error */}
          {genState === 'error' && (
            <div className="form-error" style={{ marginTop: 12 }}>
              {genError} — click "Retry Generation" above to try again.
            </div>
          )}

          {/* Suggestions grid */}
          {genState === 'done' && suggestions.length > 0 && (
            <div className="suggestion-grid">
              {suggestions.map(s => {
                const selected = personas.some(p => p.id === s.id)
                const disabled = !selected && atPersonaLimit
                return (
                  <button
                    key={s.id}
                    className={`suggestion-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                    onClick={() => selected ? deselectSuggestion(s.id) : selectSuggestion(s)}
                    disabled={disabled}
                  >
                    {selected && <span className="suggestion-check">✓</span>}
                    <div className="suggestion-name">{s.name}</div>
                    <div className="suggestion-desc">{s.description}</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Selected / custom personas — editable cards */}
          {personas.length > 0 && (
            <div className="selected-personas">
              <div className="selected-personas-label">Selected personas</div>
              {personas.map(p => (
                <div key={p.id} className="selected-persona-card">
                  <div className="selected-persona-header">
                    {p.isCustom ? (
                      <input
                        className="form-input persona-name-input"
                        placeholder="Persona name…"
                        value={p.name}
                        onChange={e => updatePersona(p.id, 'name', e.target.value)}
                      />
                    ) : (
                      <span className="selected-persona-name">{p.name}</span>
                    )}
                    <button className="btn-ghost btn-sm" onClick={() => removePersona(p.id)}>Remove</button>
                  </div>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe this persona's shopping behavior…"
                    value={p.description}
                    onChange={e => updatePersona(p.id, 'description', e.target.value)}
                    rows={3}
                  />
                </div>
              ))}
            </div>
          )}
        </SetupSection>

        {/* ── Section 3: Agents ── */}
        <SetupSection number="3" title="Agents" unlocked={hasPersonas}>
          <div className="agents-total-row">
            <span className="agents-total">{totalAgents} / 9 agents</span>
            <span className="label-optional">Assign a starting platform to each agent</span>
          </div>

          {personas.map(p => (
            <div key={p.id} className="agent-persona-group">
              <div className="agent-persona-header">
                <span className="agent-persona-name">{p.name || 'Custom Persona'}</span>
                <Stepper
                  value={p.agentCount}
                  onChange={v => setAgentCount(p.id, v)}
                  min={1}
                  max={Math.min(3, 9 - totalAgents + p.agentCount)}
                />
              </div>
              <div className="agent-slots">
                {p.agents.map((agent, i) => (
                  <div key={i} className="agent-slot">
                    <span className="agent-slot-label">Agent {i + 1}</span>
                    <select
                      className="form-select agent-slot-platform"
                      value={agent.platform}
                      onChange={e => setAgentPlatform(p.id, i, e.target.value)}
                    >
                      <option value="">Starting platform…</option>
                      {PLATFORMS.map(pl => (
                        <option key={pl.id} value={pl.id}>{pl.label}</option>
                      ))}
                    </select>
                    <span className="agent-name-preview">
                      {agent.name ? agent.name : <span className="agent-name-placeholder">name on launch</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </SetupSection>

        {/* ── Launch ── */}
        {launchError && <div className="form-error">{launchError}</div>}

        <button
          className="btn-primary btn-large"
          disabled={!canLaunch}
          onClick={handleLaunch}
        >
          {launching ? <><span className="loading-spinner" /> Preparing agents…</> : 'Launch Experiment →'}
        </button>

      </div>
    </>
  )
}
