'use client'
import { useState } from 'react'

import { useJarvisStore } from '../app/store'
import { llmOnline } from '../lib/health'
import ArcReactor from './jarvis/ArcReactor'

export default function HUD() {
  const statusMsg = useJarvisStore((state) => state.statusMsg)
  const voiceState = useJarvisStore((state) => state.voiceState)
  const ingestGitHub = useJarvisStore((state) => state.ingestGitHub)
  const fetchExternal = useJarvisStore((state) => state.fetchExternal)
  const healthState = useJarvisStore((state) => state.healthState)
  const intelArmory = useJarvisStore((state) => state.intelArmory)
  const shellMode = useJarvisStore((state) => state.shellMode)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const setShellMode = useJarvisStore((state) => state.setShellMode)
  const setLayoutMode = useJarvisStore((state) => state.setLayoutMode)
  const applyUiCommand = useJarvisStore((state) => state.applyUiCommand)
  const [username, setUsername] = useState('')
  const [showIngest, setShowIngest] = useState(false)

  const goWorkPanel = (panel) => {
    setShellMode('work')
    setLayoutMode('work')
    setActivePanel(panel)
  }

  const goIntel = () => {
    setShellMode('lab')
    setLayoutMode('lab')
    setActivePanel('intel')
  }

  const handleIngest = (event) => {
    event.preventDefault()
    if (!username.trim()) return
    ingestGitHub(username.trim())
    setShowIngest(false)
    setUsername('')
  }

  const llmReady = llmOnline(healthState)
  const primary = healthState?.llm?.primary
  const armed = (intelArmory?.keys || []).filter((k) => k.armed).length

  return (
    <header className="mk2-hud">
      <button
        type="button"
        className="mk2-hud-brand"
        onClick={() => {
          applyUiCommand({ type: 'ui_go_home' })
        }}
        title="Home"
      >
        <ArcReactor size={44} halo />
        <div>
          <div className="mk2-hud-title">J.A.R.V.I.S.</div>
          <div className="mk2-hud-sub">MARK VIII · STARK OS v2</div>
        </div>
      </button>

      <div className="mk2-ticker">
        <span className="mk2-ticker-prefix">LIVE</span>
        {statusMsg}
      </div>

      <div className={`mk2-llm ${llmReady ? 'is-hot' : 'is-cold'}`}>
        <i />
        {llmReady ? `GROQ · ${String(primary || 'READY').toUpperCase()}` : 'LLM OFF'}
        {voiceState !== 'idle' ? ` · ${voiceState.toUpperCase()}` : ''}
        <em>{armed} KEYS</em>
      </div>

      <div className="mk2-modes">
        {['dashboard', 'work', 'lab'].map((mode) => (
          <button
            key={mode}
            type="button"
            className={shellMode === mode ? 'is-on' : ''}
            onClick={() => {
              if (mode === 'dashboard') {
                applyUiCommand({ type: 'ui_go_home' })
                return
              }
              setShellMode(mode)
              if (mode === 'lab') {
                setLayoutMode('lab')
                setActivePanel('intel')
              }
              if (mode === 'dashboard') setLayoutMode('dashboard')
              if (mode === 'work') {
                setLayoutMode('work')
                setActivePanel('chat')
              }
            }}
          >
            {mode === 'dashboard' ? 'DASH' : mode.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mk2-actions">
        <button type="button" className="btn btn-gold" onClick={goIntel}>
          INTEL
        </button>
        <button type="button" className="btn" onClick={() => setShowIngest((open) => !open)}>
          + GITHUB
        </button>
        <button type="button" className="btn" onClick={() => goWorkPanel('calendar')}>
          CAL
        </button>
        <button type="button" className="btn" onClick={fetchExternal}>
          HN
        </button>
      </div>

      {showIngest && (
        <form className="mk2-ingest" onSubmit={handleIngest}>
          <input
            className="input-cyber"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="GitHub username"
            autoFocus
          />
          <button className="btn btn-gold" type="submit">
            INGEST
          </button>
          <button className="btn" type="button" onClick={() => setShowIngest(false)}>
            CLOSE
          </button>
        </form>
      )}
    </header>
  )
}
