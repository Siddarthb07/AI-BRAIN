'use client'
import { useState } from 'react'

import { useJarvisStore } from '../app/store'

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
        background: 'rgba(0, 4, 8, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0, 200, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div
          style={{
            width: '30px',
            height: '30px',
            border: '1px solid var(--cyan)',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--cyan)',
            fontFamily: 'var(--font-display)',
            fontSize: '12px',
            boxShadow: 'var(--glow-sm)',
          }}
        >
          J
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--cyan)', letterSpacing: '0.15em', lineHeight: 1 }}>
            JARVIS
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            AI BRAIN v1.0.1
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          &gt; {statusMsg}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: linkOnline ? 'var(--cyan)' : 'var(--text-dim)',
              boxShadow: linkOnline ? '0 0 6px var(--cyan-dim)' : 'none',
            }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            {llmReady
              ? `LLM ${String(primary || 'READY').toUpperCase()}`
              : 'LLM OFF'}
            {voiceState !== 'idle' ? ` · ${voiceState.toUpperCase()}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em' }}>
          {['dashboard', 'work', 'lab'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setShellMode(mode)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                color: shellMode === mode ? 'var(--cyan)' : 'var(--text-dim)',
                opacity: shellMode === mode ? 1 : 0.55,
              }}
            >
              {mode.toUpperCase()}
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
          style={{
            position: 'absolute',
            top: '56px',
            right: '16px',
            background: 'rgba(0, 10, 20, 0.97)',
            border: '1px solid rgba(0, 200, 255, 0.2)',
            borderRadius: '6px',
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
