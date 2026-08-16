'use client'

import { Suspense, lazy, useEffect } from 'react'
import { useJarvisStore } from './store'
import { llmOnline } from '../lib/health'
import { hashForSnapshot, parseHash } from '../lib/hashNav'
import HUD from '../components/HUD'
import AppShell from '../components/shell/AppShell'
import ChatPanel from '../components/ChatPanel'
import BriefPanel from '../components/BriefPanel'
import VaultPanel from '../components/vault/VaultPanel'
import CalendarPanel from '../components/CalendarPanel'
import VoicePanel from '../components/VoicePanel'
import StudioPanel from '../components/StudioPanel'
import DemoPanel from '../components/DemoPanel'
import LocalIngestPanel from '../components/LocalIngestPanel'
import NodePanel from '../components/NodePanel'
import DashboardPanel from '../components/DashboardPanel'
import IntelPanel from '../components/IntelPanel'
import VisionPanel from '../components/VisionPanel'
import WakePanel, { WakeRuntime } from '../components/WakePanel'
import GestureRuntime from '../components/GestureRuntime'
import GlobalVoicePTT from '../components/GlobalVoicePTT'
import VisionCaptureRuntime from '../components/VisionCaptureRuntime'
import HudOverlay from '../components/jarvis/HudOverlay'
import JarvisBackground from '../components/jarvis/JarvisBackground'
import BootSequence from '../components/jarvis/BootSequence'
import WorldStage from '../components/WorldStage'
import BrainGraph from '../components/BrainGraph'

function lazyWithRetry(factory, retries = 2) {
  return lazy(async () => {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await factory()
      } catch (error) {
        lastError = error
        // ChunkLoadError / transient Docker relay blips — brief backoff then retry.
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
      }
    }
    throw lastError
  })
}

const InfraPanel = lazyWithRetry(() => import('../components/InfraPanel'))

const SHELL_RAIL = [
  { id: 'dashboard', label: 'Dash' },
  { id: 'work', label: 'Work' },
  { id: 'lab', label: 'Lab' },
]

const WORK_RAIL = [
  { id: 'chat', label: 'Chat' },
  { id: 'brief', label: 'Brief' },
  { id: 'vault', label: 'Vault' },
  { id: 'calendar', label: 'Cal' },
  { id: 'voice', label: 'Voice' },
]

const LAB_RAIL = [
  { id: 'intel', label: 'Intel' },
  { id: 'demos', label: 'Demos' },
  { id: 'studio', label: 'Studio' },
  { id: 'ingest', label: 'Ingest' },
  { id: 'graph', label: 'Graph' },
  { id: 'infra', label: 'Infra' },
  { id: 'vision', label: 'Vision' },
  { id: 'wake', label: 'Wake' },
]

function ThreadSidebar() {
  const chatSessions = useJarvisStore((s) => s.chatSessions)
  const sessionId = useJarvisStore((s) => s.sessionId)
  const chatHistory = useJarvisStore((s) => s.chatHistory)
  const loadChatSession = useJarvisStore((s) => s.loadChatSession)
  const createChatSession = useJarvisStore((s) => s.createChatSession)

  return (
    <div className="left-panel">
      <div className="left-panel-title">Threads</div>
      <div className="left-panel-meta">
        {chatSessions.length} sessions · {chatHistory.length} messages
      </div>
      <button type="button" className="btn btn-gold" style={{ fontSize: 12, marginBottom: 8 }} onClick={() => createChatSession('New chat')}>
        New chat
      </button>
      <button type="button" className="btn" style={{ fontSize: 12, marginBottom: 14 }} onClick={() => loadChatSession()}>
        Refresh
      </button>
      <div className="scroll-area" style={{ flex: 1, minHeight: 0 }}>
        {(chatSessions.length ? chatSessions : [{ id: sessionId, title: 'Current' }]).map((s) => (
          <button
            key={s.id || 'current'}
            type="button"
            className={`left-list-btn${s.id === sessionId ? ' is-active' : ''}`}
            onClick={() => s.id && loadChatSession(s.id)}
          >
            {s.title || 'Chat'}
          </button>
        ))}
      </div>
    </div>
  )
}

function IconRail({ items, active, onSelect }) {
  return (
    <div className="icon-rail">
      {items.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`icon-rail-btn${active === tab.id ? ' is-active' : ''}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
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
      }}
    >
      Loading knowledge map...
    </div>
  )
}

function StubPanel({ title, body }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div
        className="panel"
        style={{
          maxWidth: 420,
          padding: '28px 24px',
          textAlign: 'center',
        }}
      >
        <div className="section-header" style={{ borderBottom: 'none', marginBottom: '8px' }}>
          {title}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {body}
        </div>
      </div>
    </div>
  )
}

export default function Page() {
  const activePanel = useJarvisStore((s) => s.activePanel)
  const setActivePanel = useJarvisStore((s) => s.setActivePanel)
  const shellMode = useJarvisStore((s) => s.shellMode)
  const setShellMode = useJarvisStore((s) => s.setShellMode)
  const setLayoutMode = useJarvisStore((s) => s.setLayoutMode)
  const selectedNode = useJarvisStore((s) => s.selectedNode)
  const repos = useJarvisStore((s) => s.repos)
  const knowledgeDocs = useJarvisStore((s) => s.knowledgeDocs)
  const vaultNotes = useJarvisStore((s) => s.vaultNotes)
  const healthState = useJarvisStore((s) => s.healthState)
  const fetchBrief = useJarvisStore((s) => s.fetchBrief)
  const fetchExternal = useJarvisStore((s) => s.fetchExternal)
  const fetchGoogleCalendarStatus = useJarvisStore((s) => s.fetchGoogleCalendarStatus)
  const pollIngestStatus = useJarvisStore((s) => s.pollIngestStatus)
  const checkBackendHealth = useJarvisStore((s) => s.checkBackendHealth)
  const loadChatSession = useJarvisStore((s) => s.loadChatSession)
  const fetchVaultNotes = useJarvisStore((s) => s.fetchVaultNotes)
  const fetchVaultStatus = useJarvisStore((s) => s.fetchVaultStatus)
  const fetchGraph = useJarvisStore((s) => s.fetchGraph)
  const fetchContext = useJarvisStore((s) => s.fetchContext)
  const fetchInfraStatus = useJarvisStore((s) => s.fetchInfraStatus)
  const fetchArmory = useJarvisStore((s) => s.fetchArmory)
  const applyUiCommand = useJarvisStore((s) => s.applyUiCommand)
  const stageProject = useJarvisStore((s) => s.stageProject)
  const stageHardware = useJarvisStore((s) => s.stageHardware)
  const mapOpen = useJarvisStore((s) => s.mapOpen)

  const nodeCount = (repos?.length || 0) + (vaultNotes?.length || 0) + (knowledgeDocs || 0)
  const showMiniMap = shellMode === 'work' && nodeCount > 0 && activePanel === 'chat'
  const showNodePanel = Boolean(selectedNode) && shellMode === 'lab' && activePanel === 'graph'

  useEffect(() => {
    checkBackendHealth({ silent: true, repairStatus: true })
    loadChatSession()
    fetchVaultStatus()
    fetchVaultNotes()
    fetchBrief()
    fetchExternal()
    fetchGoogleCalendarStatus({ silent: true })
    pollIngestStatus()
    fetchGraph()
    fetchInfraStatus({ silent: true })
    fetchArmory()
    const t1 = setInterval(pollIngestStatus, 15000)
    const t2 = setInterval(() => checkBackendHealth({ silent: true }), 20000)
    const t3 = setInterval(() => fetchInfraStatus({ silent: true }), 45000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
      clearInterval(t3)
    }
  }, [
    checkBackendHealth,
    fetchArmory,
    fetchBrief,
    fetchContext,
    fetchExternal,
    fetchGoogleCalendarStatus,
    fetchGraph,
    fetchInfraStatus,
    fetchVaultNotes,
    fetchVaultStatus,
    loadChatSession,
    pollIngestStatus,
  ])

  useEffect(() => {
    const apply = () => {
      const route = parseHash(window.location.hash)
      if (!route) return
      setShellMode(route.shellMode)
      setLayoutMode(route.layoutMode)
      setActivePanel(route.activePanel)
      if (route.kind === 'panel' && route.shellMode === 'dashboard') {
        useJarvisStore.setState({ stageProject: null, stageHardware: null, mapOpen: false })
      }
      if (route.kind === 'map') {
        applyUiCommand({ type: 'ui_open_map' })
        return
      }
      if (route.kind === 'node') {
        const slug = route.slug
        if (slug === 'quad' || slug === 'hex') {
          applyUiCommand({ type: 'ui_show_hardware', params: { id: slug } })
          return
        }
        if (slug === 'weather' || slug === 'wx-bangalore' || slug === 'weather-blr') {
          applyUiCommand({ type: 'ui_show_weather' })
          return
        }
        if (slug === 'map' || slug === 'world-map' || slug === 'map-live') {
          applyUiCommand({ type: 'ui_open_map' })
          return
        }
        if (slug === 'infra' || slug === 'infra-grid') {
          setShellMode('lab')
          setLayoutMode('lab')
          setActivePanel('infra')
          return
        }
        const repo = (useJarvisStore.getState().repos || []).find(
          (r) => String(r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug,
        )
        applyUiCommand({ type: 'ui_open_project', params: { name: repo?.name || slug } })
      }
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [applyUiCommand, setActivePanel, setLayoutMode, setShellMode])

  useEffect(() => {
    const next = hashForSnapshot({
      shellMode,
      activePanel,
      selectedNode,
      stageProject,
      stageHardware,
      mapOpen,
    })
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next)
    }
  }, [shellMode, activePanel, selectedNode, stageProject, stageHardware, mapOpen])

  const onShellSelect = (id) => {
    if (id === 'dashboard') {
      useJarvisStore.getState().applyUiCommand({ type: 'ui_go_home' })
      return
    }
    setShellMode(id)
    if (id === 'work') {
      setLayoutMode('work')
      if (!['chat', 'brief', 'vault', 'calendar', 'voice'].includes(activePanel)) {
        setActivePanel('chat')
      }
    } else if (id === 'lab') {
      setLayoutMode('lab')
      if (!['intel', 'demos', 'studio', 'ingest', 'graph', 'infra', 'vision', 'wake'].includes(activePanel)) {
        setActivePanel('intel')
      }
    }
  }

  const onWorkSelect = (id) => {
    setShellMode('work')
    setLayoutMode('work')
    setActivePanel(id)
  }

  const onLabSelect = (id) => {
    setShellMode('lab')
    setLayoutMode(id === 'graph' ? 'graph' : 'lab')
    setActivePanel(id)
  }

  const renderWorkMain = () => {
    switch (activePanel) {
      case 'brief':
        return <BriefPanel />
      case 'vault':
        return <VaultPanel />
      case 'calendar':
        return <CalendarPanel />
      case 'voice':
        return <VoicePanel />
      case 'chat':
      default:
        return <ChatPanel />
    }
  }

  const renderLabMain = () => {
    switch (activePanel) {
      case 'intel':
        return <IntelPanel />
      case 'ingest':
        return <LocalIngestPanel />
      case 'graph':
        return <BrainGraph />
      case 'infra':
        return (
          <Suspense fallback={<BrainLoading />}>
            <InfraPanel />
          </Suspense>
        )
      case 'vision':
        return <VisionPanel />
      case 'wake':
        return <WakePanel />
      case 'studio':
        return <StudioPanel />
      case 'demos':
      default:
        return <DemoPanel />
    }
  }

  const workRightPanel =
    activePanel === 'chat' ? (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderBottom: '1px solid rgba(0,200,255,0.08)' }}>
          <BriefPanel />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <VaultPanel />
        </div>
      </div>
    ) : null

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-void)', overflow: 'hidden' }}>
      <WakeRuntime />
      <GestureRuntime />
      <GlobalVoicePTT />
      <VisionCaptureRuntime />
      <JarvisBackground />
      <HudOverlay />
      <BootSequence />
      <HUD />
      <div aria-hidden className="hud-corner hud-corner--tl" />
      <div aria-hidden className="hud-corner hud-corner--tr" />
      <div aria-hidden className="hud-corner hud-corner--bl" />
      <div aria-hidden className="hud-corner hud-corner--br" />
      {healthState.demo_mode ? (
        <div
          style={{
            marginTop: 64,
            background: 'rgba(255,184,0,0.12)',
            color: 'var(--gold)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            padding: '4px',
          }}
        >
          DEMO MODE — sample data may appear
        </div>
      ) : null}
      {!llmOnline(healthState) && healthState.healthReady ? (
        <div
          style={{
            background: 'rgba(255,56,96,0.12)',
            color: 'var(--red)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            padding: '4px',
            marginTop: healthState.demo_mode ? 0 : 64,
          }}
        >
          LLM offline — Groq unreachable or rate-limited; start Ollama as backup
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          display: 'flex',
          marginTop: 64,
          minHeight: 0,
        }}
      >
        <IconRail items={SHELL_RAIL} active={shellMode} onSelect={onShellSelect} />

        {shellMode === 'dashboard' ? (
          <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <DashboardPanel />
            </div>
            {showNodePanel ? (
              <div
                style={{
                  width: 320,
                  flexShrink: 0,
                  borderLeft: '1px solid rgba(0,200,255,0.1)',
                  background: 'rgba(0,4,8,0.85)',
                  overflow: 'hidden',
                }}
              >
                <NodePanel />
              </div>
            ) : null}
          </div>
        ) : null}

        {shellMode === 'work' ? (
          <>
            <IconRail items={WORK_RAIL} active={activePanel} onSelect={onWorkSelect} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <AppShell
                sidebar={activePanel === 'chat' ? <ThreadSidebar /> : null}
                rightPanel={workRightPanel}
                miniMap={showMiniMap ? <WorldStage /> : null}
              >
                {renderWorkMain()}
              </AppShell>
            </div>
          </>
        ) : null}

        {shellMode === 'lab' ? (
          <>
            <IconRail items={LAB_RAIL} active={activePanel} onSelect={onLabSelect} />
            <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>{renderLabMain()}</div>
              {showNodePanel ? (
                <div
                  style={{
                    width: 320,
                    flexShrink: 0,
                    borderLeft: '1px solid rgba(0,200,255,0.1)',
                    background: 'rgba(0,4,8,0.85)',
                    overflow: 'hidden',
                  }}
                >
                  <NodePanel />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
