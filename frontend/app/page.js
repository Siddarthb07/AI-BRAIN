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
import LocalIngestPanel from '../components/LocalIngestPanel'
import NodePanel from '../components/NodePanel'

const BrainGraph = lazy(() => import('../components/BrainGraph'))

const RAIL = [
  { id: 'chat', label: 'Chat' },
  { id: 'brief', label: 'Brief' },
  { id: 'vault', label: 'Vault' },
  { id: 'calendar', label: 'Cal' },
  { id: 'ingest', label: 'Ingest' },
  { id: 'voice', label: 'Voice' },
  { id: 'graph', label: 'Graph' },
]

function ThreadSidebar() {
  const chatSessions = useJarvisStore((s) => s.chatSessions)
  const sessionId = useJarvisStore((s) => s.sessionId)
  const loadChatSession = useJarvisStore((s) => s.loadChatSession)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px' }}>
      <div className="section-header" style={{ marginBottom: '8px' }}>
        THREADS
      </div>
      <button type="button" className="btn" style={{ fontSize: '10px', marginBottom: '10px' }} onClick={() => loadChatSession()}>
        + REFRESH
      </button>
      <div className="scroll-area" style={{ flex: 1 }}>
        {(chatSessions.length ? chatSessions : [{ id: sessionId, title: 'Current' }]).map((s) => (
          <div
            key={s.id || 'current'}
            style={{
              padding: '8px',
              marginBottom: '4px',
              borderRadius: '4px',
              background: s.id === sessionId ? 'rgba(0,200,255,0.08)' : 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
            }}
          >
            {s.title || 'Chat'}
          </div>
        ))}
      </div>
    </div>
  )
}

function IconRail({ active, onSelect }) {
  return (
    <div
      style={{
        width: 56,
        flexShrink: 0,
        borderRight: '1px solid rgba(0,200,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '8px',
        gap: '4px',
        background: 'rgba(0,4,8,0.6)',
      }}
    >
      {RAIL.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          style={{
            width: 44,
            padding: '8px 4px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            background: active === tab.id ? 'rgba(0,200,255,0.12)' : 'transparent',
            color: active === tab.id ? 'var(--cyan)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '8px',
            letterSpacing: '0.06em',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function BrainLoading() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
      Loading knowledge map...
    </div>
  )
}

export default function Page() {
  const activePanel = useJarvisStore((s) => s.activePanel)
  const setActivePanel = useJarvisStore((s) => s.setActivePanel)
  const layoutMode = useJarvisStore((s) => s.layoutMode)
  const setLayoutMode = useJarvisStore((s) => s.setLayoutMode)
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

  const nodeCount = (repos?.length || 0) + (vaultNotes?.length || 0) + (knowledgeDocs || 0)
  const showMiniMap = nodeCount > 0 && activePanel !== 'graph'

  useEffect(() => {
    checkBackendHealth({ silent: true, repairStatus: true })
    loadChatSession()
    fetchVaultStatus()
    fetchVaultNotes()
    fetchBrief()
    fetchExternal()
    fetchGoogleCalendarStatus({ silent: true })
    pollIngestStatus()
    const t1 = setInterval(pollIngestStatus, 15000)
    const t2 = setInterval(() => checkBackendHealth({ silent: true }), 20000)
    return () => {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [
    checkBackendHealth,
    fetchBrief,
    fetchExternal,
    fetchGoogleCalendarStatus,
    fetchVaultNotes,
    fetchVaultStatus,
    loadChatSession,
    pollIngestStatus,
  ])

  const onRailSelect = (id) => {
    if (id === 'graph') {
      setLayoutMode('graph')
      setActivePanel('graph')
    } else {
      setLayoutMode('work')
      setActivePanel(id)
    }
  }

  const renderMain = () => {
    switch (activePanel) {
      case 'brief':
        return <BriefPanel />
      case 'vault':
        return <VaultPanel />
      case 'calendar':
        return <CalendarPanel />
      case 'voice':
        return <VoicePanel />
      case 'ingest':
        return <LocalIngestPanel />
      case 'graph':
        return (
          <Suspense fallback={<BrainLoading />}>
            <BrainGraph />
          </Suspense>
        )
      case 'chat':
      default:
        return <ChatPanel />
    }
  }

  const rightPanel =
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

  if (layoutMode === 'graph' || activePanel === 'graph') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-void)' }}>
        <HUD />
        <div style={{ flex: 1, marginTop: 52, display: 'flex', minHeight: 0 }}>
          <IconRail active="graph" onSelect={onRailSelect} />
          <div style={{ flex: 1, position: 'relative' }}>
            <Suspense fallback={<BrainLoading />}>
              <BrainGraph />
            </Suspense>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-void)', overflow: 'hidden' }}>
      <HUD />
      {healthState.demo_mode ? (
        <div style={{ marginTop: 52, background: 'rgba(240,180,41,0.15)', color: 'var(--gold)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px' }}>
          DEMO MODE — sample data may appear
        </div>
      ) : null}
      {!healthState.ollama && !healthState.demo_mode ? (
        <div style={{ background: 'rgba(255,56,96,0.12)', color: 'var(--red)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '4px', marginTop: healthState.demo_mode ? 0 : 52 }}>
          Ollama offline — start Ollama for LLM replies
        </div>
      ) : null}
      <div style={{ flex: 1, display: 'flex', marginTop: healthState.demo_mode || !healthState.ollama ? 0 : 52, minHeight: 0 }}>
        <IconRail active={activePanel} onSelect={onRailSelect} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <AppShell sidebar={activePanel === 'chat' ? <ThreadSidebar /> : null} rightPanel={rightPanel} miniMap={showMiniMap ? (
            <Suspense fallback={<BrainLoading />}>
              <BrainGraph />
            </Suspense>
          ) : null}>
            {renderMain()}
          </AppShell>
        </div>
      </div>
    </div>
  )
}
