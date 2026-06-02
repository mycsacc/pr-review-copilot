import { useState } from 'react'
import { useState, useEffect } from 'react'

const SEVERITY_COLORS = {
  critical: { bg: '#3d1a1a', border: '#f85149', text: '#f85149', badge: '#f85149' },
  warning: { bg: '#2d2a14', border: '#d29922', text: '#d29922', badge: '#d29922' },
  info: { bg: '#1a2a3a', border: '#58a6ff', text: '#58a6ff', badge: '#58a6ff' },
}

const TYPE_COLORS = {
  performance: { bg: '#1a2d1a', border: '#3fb950', text: '#3fb950' },
  readability: { bg: '#1a1a3d', border: '#a371f7', text: '#a371f7' },
  'best-practice': { bg: '#2d1f2d', border: '#db61a2', text: '#db61a2' },
}

const VERDICT_CONFIG = {
  'approve': { icon: '✓', color: '#3fb950', label: 'Approve' },
  'request-changes': { icon: '✗', color: '#f85149', label: 'Request Changes' },
  'needs-discussion': { icon: '◉', color: '#d29922', label: 'Needs Discussion' },
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 8px',
      borderRadius: '20px', border: `1px solid ${color}`,
      color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  )
}

function Section({ title, icon, children, count }) {
  if (count === 0) return null
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </h3>
        <span style={{
          fontSize: '12px', background: '#21262d', color: '#8b949e',
          borderRadius: '10px', padding: '1px 8px', border: '1px solid #30363d'
        }}>
          {count}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children}
      </div>
    </div>
  )
}

function FindingCard({ item, colorMap }) {
  const key = item.severity || item.type || 'info'
  const colors = colorMap[key] || colorMap['info']
  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`,
      borderRadius: '8px', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', gap: '12px' }}>
        <code style={{ fontSize: '12px', color: '#8b949e', background: '#161b22', padding: '2px 8px', borderRadius: '4px' }}>
          {item.file}
        </code>
        <Badge label={key} color={colors.text} />
      </div>
      <p style={{ fontSize: '14px', color: '#e6edf3', lineHeight: 1.6 }}>
        {item.description}
      </p>
    </div>
  )
}

function ComplexityBar({ value }) {
  const color = value <= 3 ? '#3fb950' : value <= 6 ? '#d29922' : '#f85149'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ flex: 1, background: '#21262d', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${value * 10}%`, height: '100%',
          background: color, borderRadius: '4px',
          transition: 'width 0.8s ease',
        }} />
      </div>
      <span style={{ fontSize: '14px', fontWeight: 600, color, minWidth: '32px' }}>{value}/10</span>
    </div>
  )
}

export default function App() {
  const [prUrl, setPrUrl] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [meta, setMeta] = useState(null)
  const [review, setReview] = useState(null)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${BASE_URL}/wake`).catch(() => { })
  }, [])

  async function handleReview() {
    if (!prUrl.trim()) return

    setStatus('loading')
    setMeta(null)
    setReview(null)
    setStreamText('')
    setError('')

    try {
      const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
      const response = await fetch(`${BASE_URL}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prUrl }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Server error')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const event = JSON.parse(line.replace('data: ', ''))

          if (event.type === 'meta') setMeta(event)
          if (event.type === 'chunk') setStreamText(prev => prev + event.text)
          if (event.type === 'done') { setReview(event.review); setStatus('done') }
          if (event.type === 'error') throw new Error(event.message)
        }
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const verdict = review ? VERDICT_CONFIG[review.verdict] : null

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>
          PR Review Copilot
        </h1>
        <p style={{ color: '#8b949e', fontSize: '15px' }}>
          Paste a GitHub pull request URL for an instant AI code review
        </p>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '40px' }}>
        <input
          value={prUrl}
          onChange={e => setPrUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleReview()}
          placeholder="https://github.com/owner/repo/pull/123"
          style={{
            flex: 1, padding: '12px 16px', fontSize: '14px',
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: '8px', color: '#e6edf3', outline: 'none',
          }}
        />
        <button
          onClick={handleReview}
          disabled={status === 'loading' || !prUrl.trim()}
          style={{
            padding: '12px 24px', fontSize: '14px', fontWeight: 600,
            background: status === 'loading' ? '#21262d' : '#238636',
            color: status === 'loading' ? '#8b949e' : '#fff',
            border: '1px solid #2ea043', borderRadius: '8px',
            cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap', transition: 'background 0.2s',
          }}
        >
          {status === 'loading' ? 'Reviewing…' : 'Review PR'}
        </button>
      </div>

      {/* Loading state */}
      {status === 'loading' && (
        <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '10px', padding: '20px' }}>
          {meta && (
            <p style={{ fontSize: '13px', color: '#8b949e', marginBottom: '12px' }}>
              Analysing <strong style={{ color: '#e6edf3' }}>{meta.pr.owner}/{meta.pr.repo} #{meta.pr.pullNumber}</strong> · {meta.filesChanged} files changed
            </p>
          )}
          <p style={{ fontSize: '13px', color: '#8b949e', fontFamily: 'monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {streamText || 'Fetching diff…'}
          </p>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{ background: '#3d1a1a', border: '1px solid #f85149', borderRadius: '10px', padding: '20px' }}>
          <p style={{ color: '#f85149', fontSize: '14px' }}>⚠ {error}</p>
        </div>
      )}

      {/* Results */}
      {status === 'done' && review && (
        <div>

          {/* Verdict + meta bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: '10px', padding: '16px 20px', marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px', color: verdict.color }}>{verdict.icon}</span>
              <span style={{ fontSize: '16px', fontWeight: 600, color: verdict.color }}>{verdict.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#8b949e', fontSize: '13px' }}>
              <span>{meta?.filesChanged} files</span>
              <span>·</span>
              <span>Complexity</span>
              <div style={{ width: '120px' }}><ComplexityBar value={review.complexity} /></div>
            </div>
          </div>

          {/* Summary */}
          <div style={{
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: '10px', padding: '20px', marginBottom: '24px',
          }}>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#e6edf3' }}>{review.summary}</p>
          </div>

          {/* Bugs */}
          <Section title="Bugs Found" icon="🐛" count={review.bugs.length}>
            {review.bugs.map((b, i) => <FindingCard key={i} item={b} colorMap={SEVERITY_COLORS} />)}
          </Section>

          {/* Security */}
          <Section title="Security Issues" icon="🔒" count={review.security_issues.length}>
            {review.security_issues.map((s, i) => <FindingCard key={i} item={s} colorMap={SEVERITY_COLORS} />)}
          </Section>

          {/* Suggestions */}
          <Section title="Suggestions" icon="💡" count={review.suggestions.length}>
            {review.suggestions.map((s, i) => <FindingCard key={i} item={s} colorMap={TYPE_COLORS} />)}
          </Section>

        </div>
      )}

    </div>
  )
}