'use client'
import { useState } from 'react'

import { useJarvisStore } from '../app/store'
import ArcReactor from './jarvis/ArcReactor'

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        color: 'rgba(0,217,255,0.35)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        userSelect: 'none',
      }}
    >
      ⟨⟩
    </span>
  )
}

export default function HUD() {
  const statusMsg = useJarvisStore((state) => state.statusMsg)
  const voiceState = useJarvisStore((state) => state.voiceState)
  const ingestGitHub = useJarvisStore((state) => state.ingestGitHub)
  const fetchExternal = useJarvisStore((state) => state.fetchExternal)
  const healthState = useJarvisStore((state) => state.healthState)
  const shellMode = useJarvisStore((state) => state.shellMode)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const setShellMode = useJarvisStore((state) => state.setShellMode)
  const [username, setUsername] = useState('')
  const [showIngest, setShowIngest] = useState(false)

  const goWorkPanel = (panel) => {
    setShellMode('work')
    setActivePanel(panel)
  }

  const handleIngest = (event) => {
    event.preventDefault()
    if (!username.trim()) return

    ingestGitHub(username.trim())
    setShowIngest(false)
    setUsername('')
  }

  const llmReady = Boolean(healthState?.ollama || healthState?.groq)
  const primary = healthState?.llm?.primary
  const linkOnline = llmReady || Boolean(healthState?.qdrant)

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '52px',
        background: 'linear-gradient(180deg, rgba(2,12,24,0.95), rgba(2,8,16,0.9))',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(0, 217, 255, 0.22)',
        boxShadow: '0 1px 24px rgba(0, 217, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        zIndex: 100,
      }}
    >
      {/* Brand: arc reactor + wordmark */}
      <div className="decode-text" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <ArcReactor size={34} halo />
        <div>
          <div
            className="glow-text"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--cyan)',
              letterSpacing: '0.3em',
              lineHeight: 1,
            }}
          >
            J.A.R.V.I.S.
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.22em', marginTop: 3 }}>
            AI BRAIN v1.0.1
          </div>
        </div>
      </div>

      <Divider />

      {/* Status ticker */}
      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            letterSpacing: '0.08em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: 'var(--cyan)', textShadow: '0 0 6px rgba(0,217,255,0.4)' }}>&gt;&gt;</span> {statusMsg}
        </div>
      </div>

      <Divider />

      {/* LLM / voice readout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: linkOnline ? 'var(--cyan)' : 'var(--red)',
              boxShadow: linkOnline ? '0 0 8px var(--cyan)' : '0 0 8px rgba(255,59,48,0.6)',
            }}
          />
          <span className="readout-value" style={{ color: llmReady ? 'var(--cyan)' : 'var(--text-dim)' }}>
            {llmReady
              ? `LLM ${String(primary || 'READY').toUpperCase()}`
              : 'LLM OFF'}
            {voiceState !== 'idle' ? ` · ${voiceState.toUpperCase()}` : ''}
          </span>
        </div>

        {/* Shell jumps */}
        <div style={{ display: 'flex', gap: '2px', fontFamily: 'var(--font-display)', fontSize: '9px', letterSpacing: '0.16em' }}>
          {['dashboard', 'work', 'lab'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setShellMode(mode)}
              style={{
                background: shellMode === mode ? 'rgba(0,217,255,0.1)' : 'transparent',
                border: shellMode === mode ? '1px solid rgba(0,217,255,0.4)' : '1px solid transparent',
                cursor: 'pointer',
                padding: '4px 8px',
                color: shellMode === mode ? 'var(--cyan)' : 'var(--text-dim)',
                textShadow: shellMode === mode ? '0 0 8px rgba(0,217,255,0.6)' : 'none',
                clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                transition: 'all 0.15s',
              }}
            >
              {mode === 'dashboard' ? 'DASH' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button className="btn" style={{ fontSize: '10px', padding: '6px 11px' }} onClick={() => setShowIngest((open) => !open)}>
          + GITHUB
        </button>
        <button className="btn" style={{ fontSize: '10px', padding: '6px 11px' }} onClick={() => goWorkPanel('calendar')}>
          CAL
        </button>
        <button className="btn" style={{ fontSize: '10px', padding: '6px 11px' }} onClick={fetchExternal}>
          REFRESH HN
        </button>
      </div>

      {showIngest && (
        <div
          className="holo-corners boot-in"
          style={{
            position: 'absolute',
            top: '56px',
            right: '16px',
            background: 'rgba(2, 12, 24, 0.97)',
            border: '1px solid rgba(0, 217, 255, 0.3)',
            padding: '14px 16px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            backdropFilter: 'blur(12px)',
            boxShadow: 'var(--glow-md)',
            zIndex: 200,
          }}
        >
          <input
            className="input-cyber"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleIngest(event)}
            placeholder="GitHub username..."
            style={{ width: '170px' }}
            autoFocus
          />
          <button className="btn" onClick={handleIngest}>
            INGEST
          </button>
          <button className="btn" onClick={() => setShowIngest(false)}>
            CLOSE
          </button>
        </div>
      )}
    </header>
  )
}
