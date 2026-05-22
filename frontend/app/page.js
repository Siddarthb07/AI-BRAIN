'use client'
import { useEffect, Suspense, lazy } from 'react'
import { useJarvisStore } from './store'
import HUD from '../components/HUD'
import BriefPanel from '../components/BriefPanel'
import CalendarPanel from '../components/CalendarPanel'
import ChatPanel from '../components/ChatPanel'
import VoicePanel from '../components/VoicePanel'
import StudioPanel from '../components/StudioPanel'
import NodePanel from '../components/NodePanel'
import LocalIngestPanel from '../components/LocalIngestPanel'

const BrainGraph = lazy(() => import('../components/BrainGraph'))

const TABS = [
  { id: 'brief', label: 'BRIEF', icon: '[ ]' },
  { id: 'calendar', label: 'CAL', icon: '[@]' },
  { id: 'chat', label: 'CHAT', icon: '( )' },
  { id: 'voice', label: 'VOICE', icon: '<>' },
  { id: 'studio', label: 'STUDIO', icon: '{ }' },
  { id: 'ingest', label: 'INGEST', icon: '^^' },
  { id: 'nodes', label: 'NODES', icon: '<#>' },
]

function TabBar({ active, onSelect }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,200,255,0.1)', background: 'rgba(0,4,8,0.5)', flexShrink: 0 }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            flex: 1,
            padding: '11px 6px',
            background: active === tab.id ? 'rgba(0,200,255,0.08)' : 'transparent',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--cyan)' : '2px solid transparent',
            color: active === tab.id ? 'var(--cyan)' : 'var(--text-dim)',
            fontFamily: 'var(--font-display)',
            fontSize: '8px',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <span style={{ fontSize: '13px' }}>{tab.icon}</span>
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
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '72px',
          border: '1px solid rgba(0,200,255,0.2)',
          borderTop: '1px solid var(--cyan)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.15em' }}>
        BUILDING NEURAL GRAPH...
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function BrainHUD({ repos, hnStories, knowledgeDocs, selectedNode }) {
  const stats = [
    { label: 'NEURONS', value: repos.length || '-' },
    { label: 'SIGNALS', value: hnStories.length || '-' },
    { label: 'KNOWLEDGE', value: knowledgeDocs || '-' },
    { label: 'SELECTED', value: selectedNode?.label?.slice(0, 10) || 'NONE' },
  ]

  return (
    <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '24px', pointerEvents: 'none', zIndex: 10 }}>
      {stats.map((stat) => (
        <div key={stat.label} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.1em' }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>{stat.label}</div>
          <div style={{ color: 'var(--cyan)', fontSize: '14px', fontFamily: 'var(--font-display)', textShadow: '0 0 8px var(--cyan)' }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function Legend() {
  const items = [
    { color: '#00ff9f', label: 'REPO' },
    { color: '#f0b429', label: 'PATTERN' },
    { color: '#fb923c', label: 'TOPIC' },
    { color: '#a78bfa', label: 'LANG' },
    { color: '#f472b6', label: 'NEWS' },
    { color: '#38bdf8', label: 'TEXT' },
    { color: '#ff8a3d', label: 'PDF' },
  ]

  return (
    <div style={{ position: 'absolute', top: '30px', left: '20px', display: 'flex', flexDirection: 'column', gap: '5px', pointerEvents: 'none', zIndex: 10 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.color, boxShadow: `0 0 5px ${item.color}` }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'rgba(180,220,255,0.4)', letterSpacing: '0.08em' }}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function Page() {
  const activePanel = useJarvisStore((state) => state.activePanel)
  const setActivePanel = useJarvisStore((state) => state.setActivePanel)
  const repos = useJarvisStore((state) => state.repos)
  const hnStories = useJarvisStore((state) => state.hnStories)
  const selectedNode = useJarvisStore((state) => state.selectedNode)
  const knowledgeDocs = useJarvisStore((state) => state.knowledgeDocs)
  const fetchBrief = useJarvisStore((state) => state.fetchBrief)
  const fetchExternal = useJarvisStore((state) => state.fetchExternal)
  const fetchGoogleCalendarStatus = useJarvisStore((state) => state.fetchGoogleCalendarStatus)
  const pollIngestStatus = useJarvisStore((state) => state.pollIngestStatus)
  const checkBackendHealth = useJarvisStore((state) => state.checkBackendHealth)
  const setStatusMsg = useJarvisStore((state) => state.setStatusMsg)

  useEffect(() => {
    checkBackendHealth({ silent: true, repairStatus: true })
    fetchBrief()
    fetchExternal()
    fetchGoogleCalendarStatus({ silent: true })
    pollIngestStatus()
    const ingestInterval = setInterval(pollIngestStatus, 10000)
    const healthInterval = setInterval(() => {
      checkBackendHealth({ silent: true, repairStatus: true })
    }, 15000)

    return () => {
      clearInterval(ingestInterval)
      clearInterval(healthInterval)
    }
  }, [checkBackendHealth, fetchBrief, fetchExternal, fetchGoogleCalendarStatus, pollIngestStatus])

  useEffect(() => {
    if (selectedNode) setActivePanel('nodes')
  }, [selectedNode])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const calendarStatus = url.searchParams.get('calendar_status')

    if (!calendarStatus) return

    setActivePanel('calendar')
    if (calendarStatus === 'connected') {
      setStatusMsg('GOOGLE CALENDAR CONNECTED')
      fetchGoogleCalendarStatus({ silent: true })
      fetchBrief()
    } else {
      setStatusMsg('GOOGLE CALENDAR CONNECT FAILED')
      fetchGoogleCalendarStatus({ silent: true })
    }

    url.searchParams.delete('calendar_status')
    url.searchParams.delete('calendar_error')
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', nextUrl)
  }, [fetchBrief, fetchGoogleCalendarStatus, setActivePanel, setStatusMsg])

  const renderPanel = () => {
    switch (activePanel) {
      case 'brief':
        return <BriefPanel />
      case 'calendar':
        return <CalendarPanel />
      case 'chat':
        return <ChatPanel />
      case 'voice':
        return <VoicePanel />
      case 'studio':
        return <StudioPanel />
      case 'ingest':
        return <LocalIngestPanel />
      case 'nodes':
        return <NodePanel />
      default:
        return <BriefPanel />
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-void)', overflow: 'hidden' }}>
      <HUD />
      <div className="app-main" style={{ flex: 1, display: 'flex', marginTop: '52px', minHeight: 0 }}>
        <div className="brain-container" style={{ flex: 1, position: 'relative', minWidth: 0, background: 'radial-gradient(ellipse at 45% 50%, #00121e 0%, #000408 70%)' }}>
          {[
            { top: '16px', left: '16px', borderWidth: '1px 0 0 1px' },
            { top: '16px', right: '16px', borderWidth: '1px 1px 0 0' },
            { bottom: '16px', left: '16px', borderWidth: '0 0 1px 1px' },
            { bottom: '16px', right: '16px', borderWidth: '0 1px 1px 0' },
          ].map((style, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                ...style,
                width: '18px',
                height: '18px',
                borderColor: 'rgba(0,200,255,0.18)',
                borderStyle: 'solid',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          ))}

          <Legend />

          <Suspense fallback={<BrainLoading />}>
            <BrainGraph />
          </Suspense>

          <BrainHUD repos={repos} hnStories={hnStories} knowledgeDocs={knowledgeDocs} selectedNode={selectedNode} />

          <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-display)', fontSize: '8px', color: 'rgba(0,200,255,0.2)', letterSpacing: '0.3em', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
            NEURAL KNOWLEDGE GRAPH - ORGANIC BRAIN INTERFACE
          </div>
        </div>

        <div className="panel side-panel-shell" style={{ flexShrink: 0, borderRadius: 0, borderTop: 'none', borderRight: 'none', borderBottom: 'none', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <TabBar active={activePanel} onSelect={setActivePanel} />
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  )
}
