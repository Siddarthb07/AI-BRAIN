'use client'

import { Suspense, lazy, useEffect, useState } from 'react'
import { useJarvisStore } from '../app/store'
import { formatIstEventWhen, formatIstEventDateTime } from '../lib/time'

import { API_BASE } from '../lib/api'

const BrainGraph = lazy(() => import('./BrainGraph'))

const API = API_BASE

const glass = {
  background: 'rgba(0, 8, 18, 0.72)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(0, 200, 255, 0.16)',
  borderRadius: '4px',
  boxShadow: '0 0 28px rgba(0, 200, 255, 0.05)',
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: '15px',
        letterSpacing: '0.14em',
        color: 'var(--cyan)',
        marginBottom: '12px',
        opacity: 0.95,
      }}
    >
      {children}
    </div>
  )
}

function StatusRow({ label, ok, detail, standby = false }) {
  const lit = ok || standby
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: ok ? 'var(--cyan)' : standby ? 'rgba(0,200,255,0.35)' : 'var(--text-dim)',
            boxShadow: ok ? '0 0 6px var(--cyan-dim)' : 'none',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '16px',
            color: lit ? 'var(--text-primary)' : 'var(--text-dim)',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-dim)' }}>
        {detail || (ok ? 'ONLINE' : standby ? 'STANDBY' : 'OFFLINE')}
      </span>
    </div>
  )
}

function BrainLoading() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.12em',
      }}
    >
      LOADING MEMORY MAP...
    </div>
  )
}

function formatWhen(event) {
  if (!event?.start) return 'Time pending'
  if (event.all_day) return formatIstEventWhen(event.start)
  return formatIstEventDateTime(event.start)
}

export default function DashboardPanel() {
  const brief = useJarvisStore((s) => s.brief)
  const fetchBrief = useJarvisStore((s) => s.fetchBrief)
  const googleCalendar = useJarvisStore((s) => s.googleCalendar)
  const fetchGoogleCalendarStatus = useJarvisStore((s) => s.fetchGoogleCalendarStatus)
  const vaultStatus = useJarvisStore((s) => s.vaultStatus)
  const fetchVaultStatus = useJarvisStore((s) => s.fetchVaultStatus)
  const fetchVaultNotes = useJarvisStore((s) => s.fetchVaultNotes)
  const saveToVault = useJarvisStore((s) => s.saveToVault)
  const sendChat = useJarvisStore((s) => s.sendChat)
  const healthState = useJarvisStore((s) => s.healthState)
  const checkBackendHealth = useJarvisStore((s) => s.checkBackendHealth)
  const fetchGraph = useJarvisStore((s) => s.fetchGraph)
  const setShellMode = useJarvisStore((s) => s.setShellMode)
  const setActivePanel = useJarvisStore((s) => s.setActivePanel)
  const setLayoutMode = useJarvisStore((s) => s.setLayoutMode)
  const wakeEnabled = useJarvisStore((s) => s.wakeEnabled)
  const setWakeEnabled = useJarvisStore((s) => s.setWakeEnabled)
  const wakeStatus = useJarvisStore((s) => s.wakeStatus)
  const gestureControlEnabled = useJarvisStore((s) => s.gestureControlEnabled)
  const gesturePreviewVisible = useJarvisStore((s) => s.gesturePreviewVisible)
  const setGesturePreviewVisible = useJarvisStore((s) => s.setGesturePreviewVisible)
  const toggleGestures = useJarvisStore((s) => s.toggleGestures)
  const statusMsg = useJarvisStore((s) => s.statusMsg)
  const selectedNode = useJarvisStore((s) => s.selectedNode)
  const contextState = useJarvisStore((s) => s.contextState)
  const fetchContext = useJarvisStore((s) => s.fetchContext)
  const setActiveProject = useJarvisStore((s) => s.setActiveProject)
  const repos = useJarvisStore((s) => s.repos)

  const [vaultLine, setVaultLine] = useState('')
  const [dockInput, setDockInput] = useState('')
  const [savingVault, setSavingVault] = useState(false)
  const [focusDraft, setFocusDraft] = useState('')
  const [savingFocus, setSavingFocus] = useState(false)

  const ingestGitHub = useJarvisStore((s) => s.ingestGitHub)
  const pollIngestStatus = useJarvisStore((s) => s.pollIngestStatus)

  useEffect(() => {
    const boot = async () => {
      await checkBackendHealth({ silent: true, repairStatus: true })
      await fetchContext()
      await pollIngestStatus()
      await fetchGraph({ limit: 120 })
      fetchBrief()
      fetchGoogleCalendarStatus({ silent: true })
      fetchVaultStatus()
      fetchVaultNotes()
      const state = useJarvisStore.getState()
      setFocusDraft(state.contextState?.active_project && state.contextState.active_project !== 'unset'
        ? state.contextState.active_project
        : '')
      const graphRepos = (state.graphProjection?.nodes || []).filter((n) => n.type === 'repo')
      if (!(state.repos && state.repos.length) && graphRepos.length === 0) {
        await ingestGitHub('Siddarthb07')
        await pollIngestStatus()
        await fetchGraph({ limit: 120 })
      } else if (!(state.repos && state.repos.length) && graphRepos.length > 0) {
        await pollIngestStatus()
      }
    }
    boot()
  }, [
    checkBackendHealth,
    fetchBrief,
    fetchContext,
    fetchGoogleCalendarStatus,
    fetchGraph,
    fetchVaultNotes,
    fetchVaultStatus,
    ingestGitHub,
    pollIngestStatus,
  ])

  const priorities = (brief?.priority_actions || []).slice(0, 3)
  const nextEvents = (googleCalendar?.events || brief?.calendar_events || []).slice(0, 4)
  const llm = healthState?.llm || {}
  const primary = llm.primary || 'ollama'
  const model =
    primary === 'groq'
      ? llm.groq_model || '—'
      : llm.ollama_model || '—'
  const vaultOk = Boolean(vaultStatus?.configured || vaultStatus?.vault_path || healthState.vault_configured)
  const activeProject = contextState?.active_project || brief?.active_project || 'unset'
  const repoSuggestions = (repos || []).slice(0, 8).map((r) => r.name).filter(Boolean)

  const saveFocus = async (name) => {
    const project = (name || focusDraft || '').trim()
    if (!project || savingFocus) return
    setSavingFocus(true)
    try {
      await setActiveProject(project, [
        `Advance ${project}`,
        'Clear the top blocker',
        'Ship one measurable win',
      ])
      setFocusDraft(project)
    } finally {
      setSavingFocus(false)
    }
  }

  const handleVaultCapture = async (e) => {
    e.preventDefault()
    if (!vaultLine.trim() || savingVault) return
    setSavingVault(true)
    try {
      await saveToVault(vaultLine.trim(), 'Dashboard capture')
      setVaultLine('')
    } finally {
      setSavingVault(false)
    }
  }

  const handleDockSubmit = async (e) => {
    e.preventDefault()
    const msg = dockInput.trim()
    if (!msg) return
    setDockInput('')
    setShellMode('work')
    setLayoutMode('work')
    setActivePanel('chat')
    await sendChat(msg)
  }

  const handleAskNode = async () => {
    if (!selectedNode) return
    const label = selectedNode.label || selectedNode.id || 'node'
    setShellMode('work')
    setLayoutMode('work')
    setActivePanel('chat')
    await sendChat(`Tell me about ${label}`)
  }

  const goWork = (panel) => {
    setShellMode('work')
    setLayoutMode('work')
    setActivePanel(panel)
  }

  const goLab = (panel) => {
    setShellMode('lab')
    setLayoutMode(panel === 'graph' ? 'graph' : 'lab')
    setActivePanel(panel)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-void)' }}>
      {/* Memory map — full bleed */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Suspense fallback={<BrainLoading />}>
          <BrainGraph />
        </Suspense>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at center, transparent 50%, rgba(5,10,15,0.25) 75%, rgba(5,10,15,0.7) 100%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '18%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-display)',
            fontSize: '10px',
            letterSpacing: '0.28em',
            color: 'var(--cyan)',
            opacity: 0.35,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          MEMORY MAP
        </div>
      </div>

      {/* Left glass rail */}
      <aside
        style={{
          ...glass,
          position: 'absolute',
          top: 14,
          left: 14,
          bottom: 14,
          width: 268,
          height: 'auto',
          maxHeight: 'calc(100% - 28px)',
          zIndex: 2,
          padding: '14px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'auto',
          background: 'rgba(0, 8, 18, 0.58)',
        }}
      >
        <SectionLabel>SYSTEMS</SectionLabel>
        <StatusRow
          label="GROQ"
          ok={Boolean(healthState.groq)}
          detail={healthState.groq ? (primary === 'groq' ? 'ACTIVE' : 'ONLINE') : 'OFFLINE'}
        />
        <StatusRow
          label="OLLAMA"
          ok={Boolean(healthState.ollama)}
          standby={!healthState.ollama && Boolean(healthState.groq)}
          detail={
            healthState.ollama
              ? primary === 'ollama'
                ? 'ACTIVE'
                : 'ONLINE'
              : healthState.groq
                ? 'STANDBY'
                : 'OFFLINE'
          }
        />
        <StatusRow label="QDRANT" ok={Boolean(healthState.qdrant)} />
        <StatusRow label="VAULT" ok={vaultOk} />
        {healthState.demo_mode ? (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--gold)',
              marginTop: '4px',
              marginBottom: '4px',
              letterSpacing: '0.06em',
            }}
          >
            DEMO MODE
          </div>
        ) : null}

        <div style={{ height: 1, background: 'rgba(0,200,255,0.1)', margin: '14px 0' }} />

        <SectionLabel>LLM STATUS</SectionLabel>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
          PRIMARY · {String(primary).toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-dim)', marginBottom: '4px' }}>
          MODEL · {model}
        </div>
        {llm.last_provider ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-dim)' }}>
            LAST · {String(llm.last_provider).toUpperCase()}
          </div>
        ) : null}

        <div style={{ height: 1, background: 'rgba(255,170,60,0.15)', margin: '14px 0' }} />

        <SectionLabel>FOCUS</SectionLabel>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', color: 'var(--amber)', marginBottom: '10px' }}>
          {activeProject === 'unset' ? 'NO PROJECT SET' : activeProject}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveFocus()
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 10 }}
        >
          <input
            className="input-cyber"
            value={focusDraft}
            onChange={(e) => setFocusDraft(e.target.value)}
            placeholder="Active project…"
            list="focus-repo-suggestions"
            style={{ flex: 1, fontSize: 15, padding: '10px 12px' }}
          />
          <datalist id="focus-repo-suggestions">
            {repoSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button type="submit" className="btn" disabled={savingFocus || !focusDraft.trim()} style={{ fontSize: 13 }}>
            SET
          </button>
        </form>
        <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {repoSuggestions.slice(0, 6).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => saveFocus(name)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: name === activeProject ? 'rgba(255,159,67,0.15)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,170,60,0.08)',
                color: name === activeProject ? 'var(--amber)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                padding: '10px 2px',
                cursor: 'pointer',
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </aside>

      {/* Right glass rail — full height, scrollable so CAPTURE / vault path aren't clipped */}
      <aside
        style={{
          ...glass,
          position: 'absolute',
          top: 14,
          right: 14,
          bottom: 14,
          width: 280,
          height: 'auto',
          maxHeight: 'calc(100% - 28px)',
          zIndex: 2,
          padding: '14px 14px 12px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'auto',
          background: 'rgba(0, 8, 18, 0.58)',
        }}
      >
        <SectionLabel>BRIEF</SectionLabel>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-dim)', marginBottom: '10px', flexShrink: 0 }}>
          {brief?.date || '—'}
        </div>
        <div style={{ flex: '0 1 auto', minHeight: 0, maxHeight: 180, overflowY: 'auto', marginBottom: 4 }}>
          {priorities.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-dim)', marginBottom: '8px' }}>
              No priorities
            </div>
          ) : (
            priorities.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '10px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '15px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.35,
                }}
              >
                <span style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: '14px', flexShrink: 0 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{typeof item === 'string' ? item : item?.text || item?.title || String(item)}</span>
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          className="btn"
          style={{ fontSize: '13px', width: '100%', marginTop: '4px', marginBottom: '4px', padding: '10px 8px', flexShrink: 0 }}
          onClick={() => goWork('brief')}
        >
          OPEN BRIEF
        </button>

        <div style={{ height: 1, background: 'rgba(0,200,255,0.1)', margin: '12px 0', flexShrink: 0 }} />

        <SectionLabel>NEXT UP</SectionLabel>
        <div className="scroll-area" style={{ maxHeight: 100, overflowY: 'auto', marginBottom: '4px', flexShrink: 0 }}>
          {!googleCalendar.connected && !nextEvents.length ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-dim)' }}>
              Calendar offline
            </div>
          ) : nextEvents.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-dim)' }}>No upcoming events</div>
          ) : (
            nextEvents.map((ev) => (
              <div key={ev.id || `${ev.summary}-${ev.start}`} style={{ marginBottom: '10px' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--text-primary)' }}>
                  {ev.summary || 'Untitled'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-dim)' }}>
                  {formatWhen(ev)}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ height: 1, background: 'rgba(0,200,255,0.1)', margin: '12px 0', flexShrink: 0 }} />

        <SectionLabel>CAPTURE</SectionLabel>
        <form onSubmit={handleVaultCapture} style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexShrink: 0 }}>
          <input
            className="input-cyber"
            value={vaultLine}
            onChange={(e) => setVaultLine(e.target.value)}
            placeholder="One-line → vault"
            style={{ flex: 1, fontSize: '14px', padding: '10px 12px', minWidth: 0 }}
          />
          <button type="submit" className="btn" disabled={savingVault || !vaultLine.trim()} style={{ fontSize: '13px' }}>
            SAVE
          </button>
        </form>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-dim)',
            marginBottom: '4px',
            lineHeight: 1.45,
            wordBreak: 'break-all',
            flexShrink: 0,
          }}
          title={vaultStatus?.path || vaultStatus?.vault_path || healthState.vault_path || ''}
        >
          {vaultStatus?.path || vaultStatus?.vault_path || healthState.vault_path || 'vault path pending'}
        </div>

        <div style={{ height: 1, background: 'rgba(0,200,255,0.1)', margin: '12px 0', flexShrink: 0 }} />

        <SectionLabel>QUICK ACCESS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 10, flexShrink: 0 }}>
          <button
            type="button"
            className="btn"
            style={{
              fontSize: '13px',
              padding: '10px 8px',
              borderColor: wakeEnabled ? 'var(--cyan)' : undefined,
              color: wakeEnabled ? 'var(--cyan)' : undefined,
              background: wakeEnabled ? 'rgba(0,200,255,0.1)' : undefined,
            }}
            onClick={() => setWakeEnabled(!wakeEnabled)}
          >
            {wakeEnabled ? 'WAKE ON' : 'WAKE OFF'}
          </button>
          <button
            type="button"
            className="btn"
            style={{
              fontSize: '13px',
              padding: '10px 8px',
              borderColor: gestureControlEnabled ? 'var(--amber)' : undefined,
              color: gestureControlEnabled ? 'var(--amber)' : undefined,
              background: gestureControlEnabled ? 'rgba(255,159,67,0.1)' : undefined,
            }}
            onClick={() => {
              void toggleGestures()
            }}
          >
            {gestureControlEnabled ? 'GESTURES ON' : 'GESTURES OFF'}
          </button>
        </div>
        {gestureControlEnabled ? (
          <button
            type="button"
            className="btn"
            style={{
              fontSize: '12px',
              padding: '8px',
              width: '100%',
              marginBottom: 8,
              borderColor: gesturePreviewVisible ? 'var(--cyan)' : undefined,
              color: gesturePreviewVisible ? 'var(--cyan)' : undefined,
            }}
            onClick={() => setGesturePreviewVisible(!gesturePreviewVisible)}
          >
            {gesturePreviewVisible ? 'HIDE HAND CAM' : 'SHOW HAND CAM'}
          </button>
        ) : null}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, flexShrink: 0 }}>
          Wake: {wakeEnabled ? String(wakeStatus || 'armed').replace(/_/g, ' ') : 'off'} · Gestures: click requests camera
        </div>

        <SectionLabel>COMMANDS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flexShrink: 0 }}>
          <button type="button" className="btn" style={{ fontSize: '13px', padding: '10px 8px' }} onClick={() => goWork('chat')}>
            WORK CHAT
          </button>
          <button type="button" className="btn" style={{ fontSize: '13px', padding: '10px 8px' }} onClick={() => goWork('house')}>
            HOUSE
          </button>
          <button type="button" className="btn" style={{ fontSize: '13px', padding: '10px 8px' }} onClick={() => goWork('voice')}>
            VOICE
          </button>
          <button type="button" className="btn" style={{ fontSize: '13px', padding: '10px 8px' }} onClick={() => goLab('vision')}>
            VISION
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: '13px', padding: '10px 8px' }}
            onClick={() => goLab('wake')}
          >
            WAKE LAB
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: '13px', padding: '10px 8px' }}
            onClick={() => goLab('graph')}
          >
            LAB GRAPH
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)', marginTop: 'auto', paddingTop: '12px', flexShrink: 0 }}>
          {statusMsg}
        </div>
      </aside>

      {/* Node inspector strip */}
      {selectedNode ? (
        <div
          style={{
            ...glass,
            position: 'absolute',
            left: '50%',
            bottom: 70,
            transform: 'translateX(-50%)',
            zIndex: 3,
            width: 'min(640px, calc(100% - 580px))',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', letterSpacing: '0.16em', color: 'var(--cyan)', marginBottom: 2 }}>
              INSPECTOR
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '15px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedNode.label || selectedNode.id}
            </div>
          </div>
          <button type="button" className="btn" style={{ fontSize: '13px' }} onClick={handleAskNode}>
            ASK
          </button>
        </div>
      ) : null}

      {/* Bottom ask dock */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          transform: 'translateX(-50%)',
          zIndex: 3,
          width: 'min(680px, calc(100% - 580px))',
          ...glass,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          pointerEvents: 'auto',
        }}
      >
        <form onSubmit={handleDockSubmit} style={{ flex: 1, display: 'flex', gap: '8px' }}>
          <input
            className="input-cyber"
            value={dockInput}
            onChange={(e) => setDockInput(e.target.value)}
            placeholder="Query JARVIS..."
            style={{ flex: 1, fontSize: '15px', padding: '12px 14px' }}
          />
          <button type="submit" className="btn" disabled={!dockInput.trim()} style={{ fontSize: '13px' }}>
            SEND
          </button>
        </form>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          PTT in Work
        </div>
      </div>
    </div>
  )
}
