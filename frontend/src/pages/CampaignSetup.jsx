import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const PERSONAS = [
  { id: 'budget_hunter',      label: 'Budget Hunter' },
  { id: 'prudent_parent',     label: 'Prudent Parent' },
  { id: 'premium_seeker',     label: 'Premium Seeker' },
  { id: 'research_obsessive', label: 'Research Obsessive' },
  { id: 'impulse_buyer',      label: 'Impulse Buyer' },
]

const PLATFORMS = [
  { id: 'google',    label: 'Google' },
  { id: 'reddit',    label: 'Reddit' },
  { id: 'amazon',    label: 'Amazon' },
  { id: 'youtube',   label: 'YouTube' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'tiktok',    label: 'TikTok' },
]

function CheckboxOption({ label, checked, onChange }) {
  return (
    <label className={`checkbox-option ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="checkbox-box">
        {checked && <span className="checkbox-check">✓</span>}
      </span>
      <span className="checkbox-label">{label}</span>
    </label>
  )
}

function TagInput({ tags, onChange, placeholder }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  function addTag(value) {
    const trimmed = value.trim().replace(/,$/, '')
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
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

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div className="tag-input-container" onClick={() => inputRef.current?.focus()}>
      {tags.map(tag => (
        <span key={tag} className="tag">
          {tag}
          <button type="button" className="tag-remove" onClick={() => removeTag(tag)}>×</button>
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
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >−</button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >+</button>
    </div>
  )
}

export default function CampaignSetup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    brandName: '',
    brandUrl: '',
    category: '',
    competitors: [],
    personas: [],
    agentsPerPersona: 2,
    platforms: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleList(field, id) {
    setForm(f => ({
      ...f,
      [field]: f[field].includes(id)
        ? f[field].filter(x => x !== id)
        : [...f[field], id],
    }))
  }

  const canSubmit =
    form.brandName.trim() &&
    form.brandUrl.trim() &&
    form.category.trim() &&
    form.personas.length > 0 &&
    form.platforms.length > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Server error ${res.status}`)
      }
      const { campaignId } = await res.json()
      navigate(`/campaign/${campaignId}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <h1 className="page-title">New Campaign</h1>
      <p className="page-subtitle">Configure your mystery shopping run and spawn agents.</p>

      <form className="form" onSubmit={handleSubmit}>

        {/* Brand */}
        <div className="form-section">
          <div className="form-section-title">Brand</div>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Brand Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. IKEA"
                value={form.brandName}
                onChange={e => set('brandName', e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Brand URL</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. ikea.com"
                value={form.brandUrl}
                onChange={e => set('brandUrl', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-field">
              <label className="form-label">Product Category</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. minimalist sofa"
                value={form.category}
                onChange={e => set('category', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row single" style={{ marginTop: 16 }}>
            <div className="form-field">
              <label className="form-label">Competitors <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <TagInput
                tags={form.competitors}
                onChange={v => set('competitors', v)}
                placeholder="Type a competitor and press Enter…"
              />
            </div>
          </div>
        </div>

        {/* Personas */}
        <div className="form-section">
          <div className="form-section-title">Personas</div>
          <div className="checkbox-grid">
            {PERSONAS.map(p => (
              <CheckboxOption
                key={p.id}
                label={p.label}
                checked={form.personas.includes(p.id)}
                onChange={() => toggleList('personas', p.id)}
              />
            ))}
          </div>
          <div className="form-field" style={{ marginTop: 20 }}>
            <label className="form-label">Agents per Persona</label>
            <Stepper
              value={form.agentsPerPersona}
              onChange={v => set('agentsPerPersona', v)}
              min={1}
              max={3}
            />
          </div>
        </div>

        {/* Starting Platforms */}
        <div className="form-section">
          <div className="form-section-title">Starting Platforms</div>
          <div className="checkbox-grid">
            {PLATFORMS.map(p => (
              <CheckboxOption
                key={p.id}
                label={p.label}
                checked={form.platforms.includes(p.id)}
                onChange={() => toggleList('platforms', p.id)}
              />
            ))}
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <button
          type="submit"
          className="btn-primary"
          disabled={!canSubmit || loading}
        >
          {loading ? 'Launching…' : 'Run Campaign'}
        </button>

      </form>
    </>
  )
}
