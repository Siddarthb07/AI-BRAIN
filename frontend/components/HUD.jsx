'use client'
import { useState } from 'react'

import { useJarvisStore } from '../app/store'

export default function HUD() {
  const statusMsg = useJarvisStore((state) => state.statusMsg)
  const voiceState = useJarvisStore((state) => state.voiceState)
  const ingestGitHub = useJarvisStore((state) => state.ingestGitHub)
  const fetchExternal = useJarvisStore((state) => state.fetchExternal)
  const googleCalendar = useJarvisStore((state) => state.googleCalendar)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const [username, setUsername] = useState('')
  const [showIngest, setShowIngest] = useState(false)

  const handleIngest = (event) => {
    event.preventDefault()
    if (!username.trim()) return

    ingestGitHub(username.trim())
    setShowIngest(false)
    setUsername('')
  }

  const voiceColors = {
    idle: 'var(--green)',
    recording: 'var(--red)',
    processing: 'var(--gold)',
    speaking: 'var(--cyan)',
  }

  const calendarColor = googleCalendar.connected
    ? 'var(--green)'
    : googleCalendar.configured
      ? 'var(--gold)'
      : 'var(--text-dim)'

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
            AI BRAIN v1.0
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: voiceColors[voiceState] || 'var(--green)',
              boxShadow: `0 0 6px ${voiceColors[voiceState] || 'var(--green)'}`,
              animation: voiceState !== 'idle' ? 'blink 0.8s infinite' : 'none',
            }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {voiceState.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: calendarColor,
              boxShadow: `0 0 6px ${calendarColor}`,
            }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            {googleCalendar.connected ? 'CAL LIVE' : googleCalendar.configured ? 'CAL READY' : 'CAL OFF'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button className="btn" style={{ fontSize: '10px', padding: '6px 11px' }} onClick={() => setShowIngest((open) => !open)}>
          + GITHUB
        </button>
        <button className="btn" style={{ fontSize: '10px', padding: '6px 11px' }} onClick={() => setActivePanel('calendar')}>
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
          <button className="btn btn-red" onClick={() => setShowIngest(false)}>
            CLOSE
          </button>
        </div>
      )}
    </header>
  )
}
