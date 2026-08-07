'use client'

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { useJarvisStore } from '../app/store'
import { formatIstEventWhen, formatIstEventDateTime } from '../lib/time'
import { resolveApiBase } from '../lib/api'
import { AMERICAN_VOICE_MATCHERS, clipForSpeech, createStreamingSpeaker, speakText } from '../lib/speech'
import { routeVoiceCommand } from '../lib/voiceCommands'
import ArcReactor from './jarvis/ArcReactor'

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

  const [vaultLine, setVaultLine] = useState('')
  const [dockInput, setDockInput] = useState('')
  const [savingVault, setSavingVault] = useState(false)
  const [focusDraft, setFocusDraft] = useState('')
  const [savingFocus, setSavingFocus] = useState(false)
  const [demos, setDemos] = useState([])
  const [researchBusy, setResearchBusy] = useState(false)
  const [speakingBrief, setSpeakingBrief] = useState(false)
  const [dockBusy, setDockBusy] = useState(false)

  const ingestGitHub = useJarvisStore((s) => s.ingestGitHub)
  const pollIngestStatus = useJarvisStore((s) => s.pollIngestStatus)

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
    .slice(0, 8)
    .map((r) => r.name)
    .filter(Boolean)
  const pulseCount = (graphProjection?.pulses || []).length
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
            rate: 1.08,
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
        rate: 1.08,
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
      rate: 1.08,
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
      rate: 1.05,
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
      rate: 1.05,
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

  return (
    <div className="cinematic-dash" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-void)' }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Suspense fallback={<BrainLoading />}>
          <BrainGraph hudInset={{ left: 336, bottom: 78, maxWidth: 280 }} />
        </Suspense>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse at center, transparent 50%, rgba(2,8,16,0.3) 75%, rgba(2,8,16,0.75) 100%)',
            pointerEvents: 'none',
          }}
        />
        {/* Radar sweep + centerpiece glow behind the memory core */}
        <div aria-hidden className="dash-radar-sweep" />
        <div aria-hidden className="dash-centerpiece-glow" />
        {/* Arc-reactor ring frame around the memory core */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(62vh, 640px)',
            height: 'min(62vh, 640px)',
            pointerEvents: 'none',
            zIndex: 1,
            opacity: 0.5,
          }}
        >
          <div className="arc-ring arc-ring--arcs" style={{ animationDuration: '48s' }} />
          <div className="arc-ring arc-ring--ticks" style={{ inset: '4%', animationDuration: '90s' }} />
          <div className="arc-ring arc-ring--dashed" style={{ inset: '9%', animationDuration: '64s' }} />
        </div>
        {/* Targeting reticle crosshair ticks */}
        <div aria-hidden className="reticle-pulse" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}>
          <div style={{ position: 'absolute', top: '50%', left: 'calc(50% - min(34vh, 352px))', width: 22, height: 1, background: 'rgba(0,217,255,0.55)' }} />
          <div style={{ position: 'absolute', top: '50%', right: 'calc(50% - min(34vh, 352px))', width: 22, height: 1, background: 'rgba(0,217,255,0.55)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 'calc(50% - min(34vh, 352px))', height: 22, width: 1, background: 'rgba(0,217,255,0.55)' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: 'calc(50% - min(34vh, 352px))', height: 22, width: 1, background: 'rgba(0,217,255,0.55)' }} />
        </div>
        <div
          className="decode-text"
          style={{
            position: 'absolute',
            top: '15%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: 'var(--font-display)',
            fontSize: '11px',
            letterSpacing: '0.42em',
            color: 'var(--cyan)',
            opacity: 0.55,
            pointerEvents: 'none',
            zIndex: 1,
            textAlign: 'center',
            textShadow: '0 0 12px rgba(0,217,255,0.5)',
          }}
        >
          NEURAL MEMORY CORE
          <div style={{ marginTop: 7, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', opacity: 0.85 }}>
            {pulseCount} PULSES · {demoNodeCount} DEMOS
          </div>
        </div>
        <div aria-hidden className="core-telemetry core-telemetry--nw">
          <span>NEURAL LINK</span>
          <strong>{healthState.qdrant ? 'SYNCED' : 'STANDBY'}</strong>
        </div>
        <div aria-hidden className="core-telemetry core-telemetry--ne">
          <span>ACTIVE MODEL</span>
          <strong>{String(primary).toUpperCase()}</strong>
        </div>
        <div aria-hidden className="core-telemetry core-telemetry--sw">
          <span>MEMORY PULSES</span>
          <strong>{String(pulseCount).padStart(3, '0')}</strong>
        </div>
        <div aria-hidden className="core-telemetry core-telemetry--se">
          <span>BUILDS INDEXED</span>
          <strong>{String(demoCount).padStart(3, '0')}</strong>
        </div>
      </div>

      {/* Attention strip */}
      <div
        className="cinematic-status-strip"
        style={{
          ...glass,
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 4,
          width: 'min(920px, calc(100% - 580px))',
          padding: '8px 10px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          background: 'linear-gradient(180deg, rgba(2, 14, 26, 0.78), rgba(2, 8, 16, 0.72))',
        }}
      >
        <AttentionChip label="GROQ" ok={Boolean(healthState.groq)} detail={String(model).split('/').pop()?.slice(0, 14)} />
        <AttentionChip label="RESEARCH" ok={Boolean(healthState.groq)} detail="compound" onClick={() => setDockInput('Research ')} />
        <AttentionChip label="VISION" ok={Boolean(healthState.groq)} detail="qwen" onClick={() => goLab('vision')} />
        <AttentionChip label="DEMOS" ok={demoCount > 0} detail={String(demoCount)} onClick={() => goLab('demos')} />
        <AttentionChip
          label="INFRA"
          ok={(infraStatus.sites?.down || 0) === 0 && (infraStatus.docker?.unhealthy || 0) === 0}
          detail={`${infraStatus.sites?.up || 0}S/${infraStatus.docker?.running || 0}C`}
          onClick={() => goLab('infra')}
        />
        <AttentionChip label="QDRANT" ok={Boolean(healthState.qdrant)} />
        <AttentionChip label="VAULT" ok={vaultOk} />
        <AttentionChip label="HOUSE" ok={false} detail="PARKED" />
        <AttentionChip label="CAL" ok={Boolean(googleCalendar.connected)} onClick={() => goWork('calendar')} />
      </div>

      {/* Left rail */}
      <aside
        className="left-panel holo-corners boot-in cinematic-module-stack cinematic-module-stack--left"
        style={{
          ...glass,
          position: 'absolute',
          top: 14,
          left: 14,
          bottom: 14,
          width: 308,
          maxHeight: 'calc(100% - 28px)',
          zIndex: 2,
          overflowY: 'auto',
          pointerEvents: 'auto',
        }}
      >
        <div className="left-panel-section">
          <SectionLabel>Systems</SectionLabel>
          <StatusRow label="Groq" ok={Boolean(healthState.groq)} detail={healthState.groq ? 'Active' : 'Offline'} />
          <StatusRow
            label="Ollama"
            ok={Boolean(healthState.ollama)}
            standby={!healthState.ollama && Boolean(healthState.groq)}
            detail={healthState.ollama ? 'Online' : healthState.groq ? 'Standby' : 'Offline'}
          />
          <StatusRow label="Qdrant" ok={Boolean(healthState.qdrant)} />
          <StatusRow label="Vault" ok={vaultOk} />
          <StatusRow label="House" ok={false} detail="Parked" />
        </div>

        <div className="left-panel-section">
          <SectionLabel>Models</SectionLabel>
          <div className="left-kv">
            <div className="left-kv-row">
              <span className="left-kv-key">Primary</span>
              <span className="left-kv-val">{String(primary).toUpperCase()}</span>
            </div>
            <div className="left-kv-row">
              <span className="left-kv-key">Chat</span>
              <span className="left-kv-val">{model}</span>
            </div>
            <div className="left-kv-row">
              <span className="left-kv-key">Research</span>
              <span className="left-kv-val">{researchModel}</span>
            </div>
            {llm.last_provider ? (
              <div className="left-kv-row">
                <span className="left-kv-key">Last</span>
                <span className="left-kv-val">{String(llm.last_provider)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="left-panel-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionLabel>Focus</SectionLabel>
          <div className="left-focus-name">{chatFocus === 'unset' ? 'No project set' : chatFocus}</div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveFocus()
            }}
            style={{ display: 'flex', gap: 8, marginBottom: 12 }}
          >
            <input
              className="input-cyber"
              value={focusDraft}
              onChange={(e) => setFocusDraft(e.target.value)}
              placeholder="Active project…"
              list="focus-repo-suggestions"
              style={{ flex: 1, fontSize: 14, padding: '10px 12px', fontFamily: 'var(--font-body)' }}
            />
            <datalist id="focus-repo-suggestions">
              {repoSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <button type="submit" className="btn" disabled={savingFocus || !focusDraft.trim()} style={{ fontSize: 12 }}>
              Set
            </button>
          </form>
          <div className="scroll-area" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {repoSuggestions.slice(0, 6).map((name) => (
              <button
                key={name}
                type="button"
                className={`left-list-btn${name === activeProject ? ' is-active' : ''}`}
                onClick={() => saveFocus(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Right rail */}
      <aside
        className="left-panel holo-corners boot-in cinematic-module-stack cinematic-module-stack--right"
        style={{
          ...glass,
          position: 'absolute',
          top: 14,
          right: 14,
          bottom: 14,
          width: 292,
          maxHeight: 'calc(100% - 28px)',
          zIndex: 2,
          overflowY: 'auto',
          overflowX: 'hidden',
          pointerEvents: 'auto',
        }}
      >
        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Brief</SectionLabel>
          <div className="left-panel-meta" style={{ marginBottom: 10 }}>
            {brief?.date || '—'}
          </div>
          <div
            style={{
              maxHeight: 110,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              marginBottom: 12,
              paddingRight: 4,
            }}
          >
            {priorities.length === 0 ? (
              <div className="left-status-detail">No priorities</div>
            ) : (
              priorities.map((item, i) => (
                <div key={i} className="left-status-row" style={{ alignItems: 'flex-start' }}>
                  <span className="left-kv-key" style={{ width: 28, gridColumn: 'auto' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="left-kv-val" style={{ fontSize: 14 }}>
                    {typeof item === 'string' ? item : item?.text || item?.title || String(item)}
                  </span>
                </div>
              ))
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" style={{ fontSize: 12, flex: 1 }} onClick={() => goWork('brief')}>
              Open
            </button>
            <button type="button" className="btn" style={{ fontSize: 12, flex: 1 }} disabled={speakingBrief} onClick={readBriefAloud}>
              {speakingBrief ? '…' : 'Read'}
            </button>
          </div>
        </div>

        <div className="left-panel-section dash-infra-summary" style={{ flexShrink: 0 }}>
          <SectionLabel>Infrastructure</SectionLabel>
          <button type="button" onClick={() => goLab('infra')}><span>Sites online</span><strong>{infraStatus.sites?.up || 0}/{infraStatus.sites?.total || 0}</strong></button>
          <button type="button" className={infraStatus.sites?.down ? 'is-alert' : ''} onClick={() => goLab('infra')}><span>Incidents</span><strong>{infraStatus.sites?.down || 0}</strong></button>
          <button type="button" onClick={() => goLab('infra')}><span>Containers</span><strong>{infraStatus.docker?.running || 0}/{infraStatus.docker?.total || 0}</strong></button>
          <button type="button" className={infraStatus.docker?.unhealthy ? 'is-alert' : ''} onClick={() => goLab('infra')}><span>Unhealthy</span><strong>{infraStatus.docker?.unhealthy || 0}</strong></button>
        </div>

        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Next up</SectionLabel>
          {nextEvents.length === 0 ? (
            <div className="left-panel-meta" style={{ marginBottom: 0 }}>
              {googleCalendar.connected ? 'No upcoming events' : 'Calendar offline'}
            </div>
          ) : (
            nextEvents.slice(0, 2).map((ev) => (
              <div key={ev.id || `${ev.summary}-${ev.start}`} style={{ marginBottom: 10 }}>
                <div className="left-status-name" style={{ fontSize: 14 }}>
                  {ev.summary || 'Untitled'}
                </div>
                <div className="left-status-detail">{formatWhen(ev)}</div>
              </div>
            ))
          )}
        </div>

        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Demos</SectionLabel>
          {demos.length === 0 ? (
            <div className="left-panel-meta">Ask dock: build me a website for…</div>
          ) : (
            demos.map((d) => (
              <button
                key={d.id}
                type="button"
                className="left-list-btn"
                onClick={() => {
                  openDemo(d.id)
                  goLab('demos')
                }}
              >
                {d.title || d.id}
                <span className="left-list-sub">{d.kit}</span>
              </button>
            ))
          )}
          <button type="button" className="btn" style={{ fontSize: 12, width: '100%', marginTop: 8 }} onClick={() => goLab('demos')}>
            Open demos
          </button>
        </div>

        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Research</SectionLabel>
          <div className="left-panel-meta">Topic in the dock → Research. Saves to vault Reports.</div>
          <button type="button" className="btn" style={{ fontSize: 12, width: '100%' }} disabled={researchBusy} onClick={runQuickResearch}>
            {researchBusy ? 'Researching…' : 'Research topic'}
          </button>
        </div>

        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Capture</SectionLabel>
          <form onSubmit={handleVaultCapture} style={{ display: 'flex', gap: 8 }}>
            <input
              className="input-cyber"
              value={vaultLine}
              onChange={(e) => setVaultLine(e.target.value)}
              placeholder="One-line → vault"
              style={{ flex: 1, fontSize: 14, padding: '10px 12px', minWidth: 0, fontFamily: 'var(--font-body)' }}
            />
            <button type="submit" className="btn" disabled={savingVault || !vaultLine.trim()} style={{ fontSize: 12 }}>
              Save
            </button>
          </form>
        </div>

        <div className="left-panel-section" style={{ flexShrink: 0 }}>
          <SectionLabel>Commands</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className="btn" style={{ fontSize: 12, padding: '10px 6px' }} onClick={() => goWork('chat')}>
              Chat
            </button>
            <button type="button" className="btn" style={{ fontSize: 12, padding: '10px 6px' }} onClick={() => goLab('demos')}>
              Demos
            </button>
            <button type="button" className="btn" style={{ fontSize: 12, padding: '10px 6px' }} onClick={() => goWork('voice')}>
              Voice
            </button>
            <button type="button" className="btn" style={{ fontSize: 12, padding: '10px 6px' }} onClick={() => goLab('vision')}>
              Vision
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: 12,
                padding: '10px 6px',
                borderColor: wakeEnabled ? 'var(--gold)' : undefined,
                color: wakeEnabled ? 'var(--gold)' : undefined,
                textShadow: wakeEnabled ? '0 0 8px rgba(255,184,0,0.5)' : undefined,
              }}
              onClick={() => setWakeEnabled(!wakeEnabled)}
            >
              {wakeEnabled ? 'Wake on' : 'Wake'}
            </button>
            <button
              type="button"
              className="btn"
              style={{
                fontSize: 12,
                padding: '10px 6px',
                borderColor: gestureControlEnabled ? 'var(--gold)' : undefined,
                color: gestureControlEnabled ? 'var(--gold)' : undefined,
                textShadow: gestureControlEnabled ? '0 0 8px rgba(255,184,0,0.5)' : undefined,
              }}
              onClick={() => {
                void toggleGestures()
              }}
            >
              Gesture
            </button>
          </div>
          {gestureControlEnabled ? (
            <button
              type="button"
              className="btn"
              style={{ fontSize: 12, width: '100%', marginTop: 8 }}
              onClick={() => setGesturePreviewVisible(!gesturePreviewVisible)}
            >
              {gesturePreviewVisible ? 'Hide hand cam' : 'Show hand cam'}
            </button>
          ) : null}
          <div className="left-panel-meta" style={{ marginTop: 12, marginBottom: 0 }}>
            Wake: {wakeEnabled ? String(wakeStatus || 'armed').replace(/_/g, ' ') : 'off'}
          </div>
        </div>

        <div className="left-panel-meta" style={{ marginTop: 'auto', paddingTop: 14, marginBottom: 0 }}>
          {statusMsg}
        </div>
      </aside>

      {selectedNode ? (
        <div
          className="holo-corners boot-in reticle-pulse"
          style={{
            ...glass,
            position: 'absolute',
            left: '50%',
            bottom: 78,
            transform: 'translateX(-50%)',
            zIndex: 3,
            width: 'min(640px, calc(100% - 580px))',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
            borderColor: 'rgba(0, 217, 255, 0.45)',
          }}
        >
          <span aria-hidden style={{ color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 16, textShadow: '0 0 8px rgba(0,217,255,0.6)' }}>
            ◎
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '0.28em', color: 'var(--cyan)', marginBottom: 3, textShadow: '0 0 8px rgba(0,217,255,0.5)' }}>
              TARGET LOCK · {String(selectedNode.type || 'node').toUpperCase()}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedNode.label || selectedNode.id}
            </div>
          </div>
          <button type="button" className="btn" style={{ fontSize: 13 }} onClick={handleAskNode} disabled={dockBusy}>
            {['demo', 'site', 'container'].includes(selectedNode.type) ? 'OPEN' : 'ASK'}
          </button>
        </div>
      ) : null}

      {/* Ask dock — live speak */}
      <div
        className="dock-shell cinematic-command-deck"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          zIndex: 3,
          width: 'min(720px, calc(100% - 620px))',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            color: 'var(--cyan)',
            textShadow: '0 0 8px rgba(0,217,255,0.6)',
            flexShrink: 0,
          }}
        >
          &gt;
        </span>
        <form onSubmit={handleDockSubmit} style={{ flex: 1, display: 'flex', gap: 8 }}>
          <input
            className="input-cyber"
            value={dockInput}
            onChange={(e) => setDockInput(e.target.value)}
            placeholder="AWAITING COMMAND · ask · research · build a website…"
            style={{
              flex: 1,
              fontSize: 14,
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
            }}
          />
          <button type="submit" className="btn" disabled={!dockInput.trim() || dockBusy} style={{ fontSize: 13 }}>
            {dockBusy ? '…' : 'EXECUTE'}
          </button>
        </form>
        <button type="button" className="btn" style={{ fontSize: 12 }} disabled={researchBusy} onClick={runQuickResearch}>
          Research
        </button>
        <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => goWork('voice')}>
          PTT
        </button>
      </div>
      <div
        className="decode-text"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 8,
          transform: 'translateX(-50%)',
          zIndex: 3,
          width: 'min(720px, calc(100% - 620px))',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
          textAlign: 'center',
          pointerEvents: 'none',
          opacity: 0.85,
        }}
      >
        Hold Space · say &quot;Jarvis&quot; · open demos · research … · voice commands
      </div>
    </div>
  )
}
