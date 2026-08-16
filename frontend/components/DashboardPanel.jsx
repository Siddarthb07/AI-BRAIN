'use client'

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useJarvisStore } from '../app/store'
import { formatIstEventWhen, formatIstEventDateTime } from '../lib/time'
import { resolveApiBase } from '../lib/api'
import { AMERICAN_VOICE_MATCHERS, clipForSpeech, createStreamingSpeaker, speakText } from '../lib/speech'
import { routeVoiceCommand } from '../lib/voiceCommands'
import { llmOnline } from '../lib/health'
import ArcReactor from './jarvis/ArcReactor'
import WorldMap2D from './WorldMap2D'
import PlexusCraft from './PlexusCraft'
import ProjectDossier from './ProjectDossier'

const BrainGraph = lazy(() => import('./BrainGraph'))

const api = () => resolveApiBase()

const glass = {
  background: 'linear-gradient(160deg, rgba(2, 18, 34, 0.86), rgba(2, 10, 20, 0.82))',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(0, 217, 255, 0.24)',
  borderRadius: '3px',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45), 0 0 18px rgba(0, 217, 255, 0.07), inset 0 0 28px rgba(0, 217, 255, 0.04)',
  clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
}

function SectionLabel({ children }) {
  return <div className="left-panel-label">{children}</div>
}

function StatusRow({ label, ok, detail, standby = false }) {
  const lit = ok || standby
  return (
    <div className="left-status-row">
      <div className="left-status-left">
        <span className={`left-status-dot${ok ? ' is-on' : standby ? ' is-standby' : ''}`} />
        <span className="left-status-name" style={{ color: lit ? 'var(--text-primary)' : 'var(--text-dim)' }}>
          {label}
        </span>
      </div>
      <span className="left-status-detail">{detail || (ok ? 'Online' : standby ? 'Standby' : 'Offline')}</span>
    </div>
  )
}

function AttentionChip({ label, ok, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hex-chip${ok ? ' is-on' : ' is-off'}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: ok ? 'var(--cyan)' : 'var(--text-dim)',
          boxShadow: ok ? '0 0 6px var(--cyan)' : 'none',
          flexShrink: 0,
        }}
      />
      {label}
      {detail ? <span style={{ opacity: 0.65 }}>{detail}</span> : null}
    </button>
  )
}

function BrainLoading() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--cyan)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.3em',
      }}
    >
      <ArcReactor size={72} />
      <span className="decode-text">INITIALIZING MEMORY CORE…</span>
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
  const stageHardware = useJarvisStore((s) => s.stageHardware)
  const stageProject = useJarvisStore((s) => s.stageProject)
  const checkBackendHealth = useJarvisStore((s) => s.checkBackendHealth)
  const fetchGraph = useJarvisStore((s) => s.fetchGraph)
  const graphProjection = useJarvisStore((s) => s.graphProjection)
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
  const setStatusMsg = useJarvisStore((s) => s.setStatusMsg)
  const setVoiceState = useJarvisStore((s) => s.setVoiceState)
  const selectedNode = useJarvisStore((s) => s.selectedNode)
  const contextState = useJarvisStore((s) => s.contextState)
  const fetchContext = useJarvisStore((s) => s.fetchContext)
  const setActiveProject = useJarvisStore((s) => s.setActiveProject)
  const repos = useJarvisStore((s) => s.repos)
  const openDemo = useJarvisStore((s) => s.openDemo)
  const setSelectedInfraId = useJarvisStore((s) => s.setSelectedInfraId)
  const infraStatus = useJarvisStore((s) => s.infraStatus)
  const intelArmory = useJarvisStore((s) => s.intelArmory)
  const worldEvents = useJarvisStore((s) => s.worldEvents)
  const hnStories = useJarvisStore((s) => s.hnStories)
  const chatHistory = useJarvisStore((s) => s.chatHistory)
  const voiceState = useJarvisStore((s) => s.voiceState)
  const fetchWorldEvents = useJarvisStore((s) => s.fetchWorldEvents)
  const weather = useJarvisStore((s) => s.weather)
  const fetchWeather = useJarvisStore((s) => s.fetchWeather)
  const mapOpen = useJarvisStore((s) => s.mapOpen)

  const [vaultLine, setVaultLine] = useState('')
  const [dockInput, setDockInput] = useState('')
  const [savingVault, setSavingVault] = useState(false)
  const [focusDraft, setFocusDraft] = useState('')
  const [savingFocus, setSavingFocus] = useState(false)
  const [demos, setDemos] = useState([])
  const [researchBusy, setResearchBusy] = useState(false)
  const [speakingBrief, setSpeakingBrief] = useState(false)
  const [dockBusy, setDockBusy] = useState(false)
  const [now, setNow] = useState(null)

  const ingestGitHub = useJarvisStore((s) => s.ingestGitHub)
  const pollIngestStatus = useJarvisStore((s) => s.pollIngestStatus)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const refreshDemos = useCallback(async () => {
    try {
      const res = await fetch(`${api()}/demos`, { cache: 'no-store' })
      const data = await res.json()
      setDemos((data.demos || []).slice(0, 5))
    } catch {
      setDemos([])
    }
  }, [])

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
      refreshDemos()
      fetchWorldEvents()
      fetchWeather()
      const state = useJarvisStore.getState()
      setFocusDraft(
        state.contextState?.active_project && state.contextState.active_project !== 'unset'
          ? state.contextState.active_project
          : ''
      )
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
    fetchWorldEvents,
    fetchWeather,
    ingestGitHub,
    pollIngestStatus,
    refreshDemos,
  ])

  // Live graph pulses
  useEffect(() => {
    const id = setInterval(() => {
      void fetchGraph({ limit: 120 })
      void checkBackendHealth({ silent: true, repairStatus: false })
    }, 12000)
    return () => clearInterval(id)
  }, [fetchGraph, checkBackendHealth])

  const priorities = (brief?.priority_actions || []).slice(0, 3)
  const nextEvents = (googleCalendar?.events || brief?.calendar_events || []).slice(0, 4)
  const llm = healthState?.llm || {}
  const primary = llm.primary || 'groq'
  const model = primary === 'groq' ? llm.groq_model || '—' : llm.ollama_model || '—'
  const researchModel = llm.research_model || 'groq/compound'
  const vaultOk = Boolean(vaultStatus?.configured || vaultStatus?.vault_path || healthState.vault_configured)
  const activeProject = contextState?.active_project || brief?.active_project || 'unset'
  const focusRepo = useJarvisStore((s) => s.focusRepo)
  const chatFocus =
    (selectedNode?.type === 'repo' && (selectedNode.label || selectedNode.data?.name)) ||
    focusRepo ||
    activeProject
  const repoSuggestions = (repos || [])
    .slice(0, 24)
    .map((r) => r.name)
    .filter(Boolean)
  const demoNodeCount = (graphProjection?.nodes || []).filter((n) => n.type === 'demo').length
  const demoCount = Math.max(demos.length, demoNodeCount)

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
    if (!msg || dockBusy) return
    setDockInput('')
    setDockBusy(true)

    let routed = null
    try {
      routed = await routeVoiceCommand(msg, () => useJarvisStore.getState())
      if (routed.handled) {
        if (routed.speak) {
          setVoiceState('speaking')
          await speakText(routed.speak, {
            preferBrowser: true,
            browserOnly: true,
            lang: 'en-US',
            rate: 1.32,
            voiceMatchers: AMERICAN_VOICE_MATCHERS,
          })
          setVoiceState('idle')
        }
        if (!(routed.streamChat && routed.chat)) {
          setDockBusy(false)
          return
        }
      }

      const chatMsg = routed?.streamChat && routed.chat ? routed.chat : msg
      const lower = chatMsg.toLowerCase()
      const isBuild = /\b(build|make|create)\b.*\b(website|site|landing|demo)\b/.test(lower)
      const isResearch = /\b(research|report|search the web|look up)\b/.test(lower)

      if (isBuild) {
        setShellMode('lab')
        setLayoutMode('lab')
        setActivePanel('demos')
      }

      const speaker = createStreamingSpeaker({
        lang: 'en-US',
            rate: 1.32,
        voiceMatchers: AMERICAN_VOICE_MATCHERS,
        onStart: () => setVoiceState('speaking'),
        onEnd: () => setVoiceState('idle'),
      })

      await sendChat(chatMsg, {
        onToken: (delta) => {
          void speaker.push(delta)
        },
      })
      await speaker.end()
      if (isBuild) refreshDemos()
      void fetchGraph({ limit: 120 })
      if (isResearch) void fetchGraph({ limit: 120 })
    } catch {
      setVoiceState('idle')
      setStatusMsg('DOCK QUERY FAILED')
    } finally {
      setDockBusy(false)
    }
  }

  const handleAskNode = async () => {
    if (!selectedNode) return
    const label = selectedNode.label || selectedNode.id || 'node'
    if (selectedNode.type === 'demo' && selectedNode.data?.id) {
      openDemo(selectedNode.data.id)
      setShellMode('lab')
      setLayoutMode('lab')
      return
    }
    if (selectedNode.type === 'site' || selectedNode.type === 'container') {
      setSelectedInfraId(selectedNode.data?.id || selectedNode.data?.name || selectedNode.id)
      setShellMode('lab')
      setLayoutMode('lab')
      setActivePanel('infra')
      return
    }
    setDockBusy(true)
    const speaker = createStreamingSpeaker({
      lang: 'en-US',
            rate: 1.32,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onStart: () => setVoiceState('speaking'),
      onEnd: () => setVoiceState('idle'),
    })
    try {
      await sendChat(`Tell me about ${label}`, {
        onToken: (d) => {
          void speaker.push(d)
        },
      })
      await speaker.end()
    } finally {
      setDockBusy(false)
    }
  }

  const readBriefAloud = async () => {
    if (speakingBrief) return
    const lines = [
      brief?.greeting,
      ...(priorities || []).map((item, i) => `Priority ${i + 1}: ${typeof item === 'string' ? item : item?.text || ''}`),
    ]
      .filter(Boolean)
      .join('. ')
    const text = clipForSpeech(lines || 'No brief available.')
    setSpeakingBrief(true)
    setVoiceState('speaking')
    const ok = await speakText(text, {
      preferBrowser: true,
      preferBackend: false,
      browserOnly: true,
      rate: 1.32,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onEnd: () => {
        setSpeakingBrief(false)
        setVoiceState('idle')
      },
    })
    if (!ok) {
      setSpeakingBrief(false)
      setVoiceState('idle')
    }
  }

  const runQuickResearch = async () => {
    const q = dockInput.trim() || (activeProject !== 'unset' ? String(activeProject) : '')
    if (!q) {
      setStatusMsg('TYPE A TOPIC IN THE DOCK, THEN RESEARCH')
      return
    }
    setResearchBusy(true)
    setDockInput('')
    const speaker = createStreamingSpeaker({
      lang: 'en-US',
      rate: 1.32,
      voiceMatchers: AMERICAN_VOICE_MATCHERS,
      onStart: () => setVoiceState('speaking'),
      onEnd: () => setVoiceState('idle'),
    })
    try {
      const prompt = /\bresearch\b/i.test(q) ? q : `Research ${q} and generate a report`
      await sendChat(prompt, {
        onToken: (d) => {
          void speaker.push(d)
        },
      })
      await speaker.end()
      void fetchGraph({ limit: 120 })
    } finally {
      setResearchBusy(false)
    }
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

  const hour = now ? now.getHours() : 12
  const greet = hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING'
  const localClock = now
    ? now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'
  const online = llmOnline(healthState)
  const bits = [healthState.groq, healthState.ollama, healthState.qdrant, vaultOk, (infraStatus.sites?.up || 0) > 0]
  const healthPct = Math.round((bits.filter(Boolean).length / bits.length) * 100)
  const nodeCount = (graphProjection?.nodes || []).length
  const pulseCount = (graphProjection?.pulses || []).length
  const repoCount = (repos || []).length
  const newsItems = (worldEvents?.news || []).slice(0, 8)
  const hnItems = (hnStories || []).slice(0, 8)
  const feed = newsItems.length ? newsItems : hnItems
  const hotspots = (worldEvents?.hotspots || []).slice(0, 5)
  const logs = [...(chatHistory || [])].slice(-6).reverse()
  const groqPct = healthState.groq ? 86 : 8
  const ollamaPct = healthState.ollama ? 62 : 4
  const qdrantPct = healthState.qdrant ? 74 : 6
  const vaultPct = vaultOk ? 90 : 10
  const netPct = Math.min(100, ((infraStatus.sites?.up || 0) / Math.max(1, infraStatus.sites?.total || 1)) * 100)
  const dockerPct = Math.min(100, ((infraStatus.docker?.running || 0) / Math.max(1, infraStatus.docker?.total || 1)) * 100)

  const Bar = ({ label, value }) => (
    <div className="mk7-bar">
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </i>
      <span>{Math.round(value)}</span>
    </div>
  )

  return (
    <div className="mk7-dash">
      <header className="mk7-top">
        <div className="mk7-greet">
          {greet}, SIDDARTH
          <small>{online ? 'SYSTEM ONLINE & OPTIMAL' : 'SYSTEM DEGRADED · LLM PATH CHECK'}</small>
        </div>
        <nav className="mk7-nav">
          <button type="button" className="is-on" onClick={() => { window.location.hash = '#home' }}>MAIN SYSTEMS</button>
          <button type="button" onClick={() => { window.location.hash = '#graph' }}>NEURAL NETWORK</button>
          <button type="button" onClick={() => { window.location.hash = '#intel' }}>DATA ANALYTICS</button>
          <button type="button" onClick={() => { window.location.hash = '#vision' }}>HOLOGRAPHIC UI</button>
          <button type="button" onClick={() => { window.location.hash = '#infra' }}>SYSTEM MONITOR</button>
          <button type="button" onClick={() => { window.location.hash = '#vault' }}>SECURITY GRID</button>
        </nav>
        <button
          type="button"
          className="mk7-greet mk7-home"
          onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_go_home' })}
          title="Home"
        >
          J.A.R.V.I.S.
          <small>{healthPct}% HEALTH · {localClock}</small>
        </button>
      </header>

      <div className="mk7-col">
        <section className="mk7-card">
          <h3>SYSTEM OVERVIEW</h3>
          <div className="mk7-gauge">{bits.filter(Boolean).length}/{bits.length}</div>
          <div className="mk7-row"><span>SERVICES</span><span>LIVE</span></div>
          <Bar label="GROQ" value={groqPct} />
          <Bar label="OLLAMA" value={ollamaPct} />
          <Bar label="QDRANT" value={qdrantPct} />
          <Bar label="VAULT" value={vaultPct} />
          <Bar label="NET" value={netPct} />
        </section>
        <section
          className="mk7-card mk7-card--wx"
          role="button"
          tabIndex={0}
          onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_show_weather' })}
          style={{ cursor: 'pointer' }}
        >
          <h3>WEATHER · BLR</h3>
          <div className="mk7-row"><span>TEMP</span><span>{weather?.temp != null ? `${Math.round(weather.temp)}°C` : '—'}</span></div>
          <div className="mk7-row"><span>HUMIDITY</span><span>{weather?.humidity != null ? `${weather.humidity}%` : '—'}</span></div>
          <div className="mk7-row"><span>WIND</span><span>{weather?.wind != null ? `${weather.wind} km/h` : '—'}</span></div>
        </section>
        <section className="mk7-card">
          <h3>NETWORK STATUS</h3>
          <div className="mk7-row"><span>SITES UP</span><span>{infraStatus.sites?.up || 0}/{infraStatus.sites?.total || 0}</span></div>
          <div className="mk7-row"><span>DOWN</span><span>{infraStatus.sites?.down || 0}</span></div>
          <div className="mk7-row"><span>KEYS ARMED</span><span>{(intelArmory?.keys || []).filter((k) => k.armed).length}</span></div>
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%', marginTop: 6 }} onClick={() => goLab('infra')}>OPEN INFRA</button>
        </section>
        <section className="mk7-card mk7-map-thumb">
          <h3>LIVE MAP · BLR 12.97N</h3>
          <div className="mk7-map-thumb-body">
            <WorldMap2D mini expandable />
          </div>
        </section>
        <section className="mk7-card mk7-card--fill">
          <h3>MISSION</h3>
          {nextEvents.length === 0 ? (
            <div className="mk7-log">{googleCalendar.connected ? 'No upcoming events' : 'Calendar offline'}</div>
          ) : (
            nextEvents.slice(0, 3).map((ev) => (
              <div key={ev.id || ev.summary} className="mk7-row">
                <span>{(ev.summary || 'Event').slice(0, 16)}</span>
                <span>{formatWhen(ev)}</span>
              </div>
            ))
          )}
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%', marginTop: 6 }} onClick={() => goWork('calendar')}>OPEN CAL</button>
        </section>
      </div>

      <div className="mk7-center">
        {mapOpen || stageHardware || stageProject || selectedNode?.type === 'weather' ? (
          <div className="mk7-center-hold" />
        ) : (
          <div className="mk7-graph-well">
            <button
              type="button"
              className="mk7-online"
              onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_go_home' })}
            >
              JARVIS ONLINE
            </button>
            <Suspense fallback={<BrainLoading />}>
              <BrainGraph compact />
            </Suspense>
          </div>
        )}
      </div>

      <div className="mk7-col">
        <section className="mk7-card mk7-card--fill mk7-card--news">
          <h3>LIVE NEWS</h3>
          <div className="mk7-log mk7-log--fill">
            {feed.length === 0 ? (
              <div>No live headlines yet</div>
            ) : (
              feed.slice(0, 8).map((n, i) => (
                <a
                  key={n.url || n.id || i}
                  href={n.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="mk7-news-line"
                >
                  {(n.title || n.headline || '').slice(0, 72)}
                </a>
              ))
            )}
          </div>
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%', marginTop: 6 }} onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_open_map' })}>MAP LOCKS</button>
        </section>
        <section className="mk7-card">
          <h3>SYSTEM MONITOR</h3>
          <div className="mk7-row"><span>GROQ</span><span>{healthState.groq ? 'ONLINE' : 'DARK'}</span></div>
          <div className="mk7-row"><span>OLLAMA</span><span>{healthState.ollama ? 'ONLINE' : 'DARK'}</span></div>
          <div className="mk7-row"><span>QDRANT</span><span>{healthState.qdrant ? 'ONLINE' : 'DARK'}</span></div>
          <div className="mk7-row"><span>SITES</span><span>{infraStatus.sites?.up || 0} / {infraStatus.sites?.total || 0} UP</span></div>
          <div className="mk7-row"><span>DOCKER</span><span>{infraStatus.docker?.running || 0} / {infraStatus.docker?.total || 0} RUN</span></div>
          <div className="mk7-row"><span>REPOS</span><span>{repoCount}</span></div>
          <div className="mk7-row"><span>GRAPH</span><span>{nodeCount} NODES</span></div>
          <div className="mk7-row"><span>LLM</span><span>{String(primary).toUpperCase()}</span></div>
        </section>
        <section className="mk7-card">
          <h3>CRAFT</h3>
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%', marginBottom: 4 }} onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_show_hardware', params: { id: 'quad' } })}>QUAD · KK2.1.5</button>
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%' }} onClick={() => useJarvisStore.getState().applyUiCommand({ type: 'ui_show_hardware', params: { id: 'hex' } })}>HEX · F550 NAZA</button>
        </section>
        <section className="mk7-card">
          <h3>VOICE · LOG</h3>
          <div className="mk7-wave" style={{ opacity: voiceState === 'idle' ? 0.35 : 1, height: 22 }}>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.06}s`, height: 18 }} />
            ))}
          </div>
          <div className="mk7-log">
            {logs.length === 0 ? <div>{statusMsg}</div> : logs.slice(0, 3).map((m, i) => (
              <div key={m.ts || i}>{(m.role || 'sys').slice(0, 3).toUpperCase()} · {String(m.content || '').slice(0, 42)}</div>
            ))}
          </div>
          <button type="button" className="btn" style={{ fontSize: 11, width: '100%', marginTop: 6 }} onClick={() => goWork('voice')}>PTT</button>
        </section>
        <section className="mk7-card">
          <h3>BRIEF</h3>
          {(priorities || []).slice(0, 2).map((item, i) => (
            <div key={i} className="mk7-log">{typeof item === 'string' ? item : item?.text || item?.title}</div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="button" className="btn" style={{ fontSize: 11, flex: 1 }} onClick={() => goWork('brief')}>OPEN</button>
            <button type="button" className="btn" style={{ fontSize: 11, flex: 1 }} disabled={speakingBrief} onClick={readBriefAloud}>{speakingBrief ? '…' : 'READ'}</button>
          </div>
        </section>
      </div>

      <div className="mk7-console">
        <div className="mk7-console-static">
          <label>
            PROJECT
            <select
              value={repoSuggestions.includes(String(activeProject)) ? activeProject : ''}
              onChange={(e) => {
                const name = e.target.value
                if (name) void saveFocus(name)
              }}
            >
              <option value="">{activeProject && activeProject !== 'unset' ? activeProject : 'SELECT'}</option>
              {repoSuggestions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <span>IST {localClock}</span>
          <span>GROQ {healthState.groq ? 'ON' : 'OFF'}</span>
          <span>SITES {infraStatus.sites?.up || 0}/{infraStatus.sites?.total || 0}</span>
        </div>
        <div className="mk7-console-stats">
          <b>{bits.filter(Boolean).length}/{bits.length}</b>
          <span>SERVICES</span>
          <b>{repoCount}</b>
          <span>REPOS</span>
          <b>{nodeCount}</b>
          <span>GRAPH</span>
          <b>{vaultOk ? 'LOCK' : 'OPEN'}</b>
          <span>VAULT</span>
          <button type="button" className={gestureControlEnabled ? 'is-on' : ''} onClick={() => void toggleGestures()}>
            PALM {gestureControlEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <form className="mk7-dock mk7-console-cmd" onSubmit={handleDockSubmit}>
          <span>&gt;</span>
          <input value={dockInput} onChange={(e) => setDockInput(e.target.value)} placeholder="COMMAND · ask · research · #map · show hex…" />
          <button type="submit" className="btn" disabled={!dockInput.trim() || dockBusy} style={{ fontSize: 11 }}>{dockBusy ? '…' : 'EXE'}</button>
          <button type="button" className="btn" style={{ fontSize: 11 }} disabled={researchBusy} onClick={runQuickResearch}>RSH</button>
          <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => goWork('voice')}>PTT</button>
        </form>
      </div>

      {mapOpen ? (
        <div className="mk7-stage">
          <header>
            <span>LIVE MAP · #map</span>
            <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => useJarvisStore.setState({ mapOpen: false, selectedNode: null })}>CLOSE</button>
          </header>
          <div className="mk7-stage-body">
            <WorldMap2D legend />
            <p className="mk7-stage-hint">Scroll to zoom · drag to pan · pinch / palm when gestures are on · click a red lock for the brief</p>
          </div>
        </div>
      ) : null}

      {selectedNode?.type === 'weather' && !stageHardware && !stageProject ? (
        <div className="mk7-stage">
          <header>
            <span>WEATHER · BANGALORE · #n/weather</span>
            <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => useJarvisStore.setState({ selectedNode: null })}>CLOSE</button>
          </header>
          <div className="mk7-stage-project">
            <p>Open-Meteo live reading for 12.97 N 77.59 E. Not a forecast product — HUD telemetry only.</p>
            <dl>
              <dt>TEMP</dt><dd>{weather?.temp != null ? `${weather.temp} ${weather.unit}` : 'fetching…'}</dd>
              <dt>HUMIDITY</dt><dd>{weather?.humidity != null ? `${weather.humidity}%` : '—'}</dd>
              <dt>WIND</dt><dd>{weather?.wind != null ? `${weather.wind} km/h` : '—'}</dd>
            </dl>
          </div>
        </div>
      ) : null}

      {stageHardware ? (
        <div className="mk7-stage">
          <header>
            <span>CRAFT · {stageHardware === 'hex' ? 'HEX F550 / NAZA-M LITE' : 'QUAD KK2.1.5'} · #n/{stageHardware}</span>
            <button type="button" className="btn" style={{ fontSize: 11 }} onClick={() => useJarvisStore.setState({ stageHardware: null, selectedNode: null })}>CLOSE</button>
          </header>
          <div className="mk7-stage-body">
            <PlexusCraft kind={stageHardware === 'hex' ? 'hex' : 'quad'} height="100%" interactive />
            <p className="mk7-stage-hint">Click a part to pull it off. EXPLODE / ASSEMBLE. Say remove the battery. Palm to orbit.</p>
          </div>
        </div>
      ) : null}

      {stageProject && !stageHardware && !mapOpen ? (
        <ProjectDossier
          project={stageProject}
          onAsk={handleAskNode}
          onClose={() => useJarvisStore.setState({ stageProject: null, selectedNode: null })}
        />
      ) : null}
    </div>
  )
}
