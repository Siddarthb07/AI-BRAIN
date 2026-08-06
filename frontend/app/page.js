'use client'

import { Suspense, lazy, useEffect } from 'react'
import { useJarvisStore } from './store'
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
import VisionPanel from '../components/VisionPanel'
import WakePanel, { WakeRuntime } from '../components/WakePanel'
import GestureRuntime from '../components/GestureRuntime'
import GlobalVoicePTT from '../components/GlobalVoicePTT'
import VisionCaptureRuntime from '../components/VisionCaptureRuntime'

const BrainGraph = lazy(() => import('../components/BrainGraph'))

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
  { id: 'demos', label: 'Demos' },
  { id: 'studio', label: 'Studio' },
  { id: 'ingest', label: 'Ingest' },
  { id: 'graph', label: 'Graph' },
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

  const nodeCount = (repos?.length || 0) + (vaultNotes?.length || 0) + (knowledgeDocs || 0)
  const showMiniMap = shellMode === 'work' && nodeCount > 0 && activePanel === 'chat'
  const showNodePanel =
    Boolean(selectedNode) && (shellMode === 'dashboard' || (shellMode === 'lab' && activePanel === 'graph'))

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
    fetchContext()
    const t1 = setInterval(pollIngestStatus, 15000)
    const t2 = setInterval(() => checkBackendHealth({ silent: true }), 20000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [
    checkBackendHealth,
    fetchBrief,
    fetchContext,
    fetchExternal,
    fetchGoogleCalendarStatus,
    fetchGraph,
    fetchVaultNotes,
    fetchVaultStatus,
    loadChatSession,
    pollIngestStatus,
  ])

  const onShellSelect = (id) => {
    setShellMode(id)
    if (id === 'dashboard') {
      setLayoutMode('dashboard')
    } else if (id === 'work') {
      setLayoutMode('work')
      if (!['chat', 'brief', 'vault', 'calendar', 'voice'].includes(activePanel)) {
        setActivePanel('chat')
      }
    } else if (id === 'lab') {
      setLayoutMode('lab')
      if (!['demos', 'studio', 'ingest', 'graph', 'vision', 'wake'].includes(activePanel)) {
        setActivePanel('demos')
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
      case 'ingest':
        return <LocalIngestPanel />
      case 'graph':
        return (
          <Suspense fallback={<BrainLoading />}>
            <BrainGraph />
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
      <HUD />
      {healthState.demo_mode ? (
        <div
          style={{
            marginTop: 52,
            background: 'rgba(240,180,41,0.15)',
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
      {!healthState.ollama && !healthState.groq && !healthState.demo_mode ? (
        <div
          style={{
            background: 'rgba(255,56,96,0.12)',
            color: 'var(--red)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            padding: '4px',
            marginTop: healthState.demo_mode ? 0 : 52,
          }}
        >
          LLM offline — Groq unreachable or rate-limited; start Ollama as backup
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          display: 'flex',
          marginTop: healthState.demo_mode || (!healthState.ollama && !healthState.groq) ? 0 : 52,
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
                miniMap={
                  showMiniMap ? (
                    <Suspense fallback={<BrainLoading />}>
                      <BrainGraph />
                    </Suspense>
                  ) : null
                }
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
