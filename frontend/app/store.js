'use client'
import { create } from 'zustand'
import { formatIstBriefLabel } from '../lib/time'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

const DEFAULT_GOOGLE_CALENDAR = {
  configured: false,
  connected: false,
  calendar_id: 'primary',
  calendar_label: 'Primary calendar',
  redirect_uri: 'http://localhost:8001/calendar/google/callback',
  frontend_url: 'http://localhost:5050',
  last_synced_at: null,
  last_error: null,
  upcoming_count: 0,
  events: [],
}

export const useJarvisStore = create((set, get) => ({
  repos: [],
  brief: null,
  chatHistory: [],
  hnStories: [],
  localDocs: [],
  selectedNode: null,
  isLoading: false,
  voiceState: 'idle',
  statusMsg: 'JARVIS ONLINE',
  activePanel: 'brief',
  knowledgeDocs: 0,
  googleCalendar: DEFAULT_GOOGLE_CALENDAR,

  setRepos: (repos) => set({ repos }),
  setBrief: (brief) => set({ brief }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setStatusMsg: (statusMsg) => set({ statusMsg }),
  setGoogleCalendar: (patch) =>
    set((state) => ({
      googleCalendar: {
        ...state.googleCalendar,
        ...patch,
        events: Array.isArray(patch?.events) ? patch.events : state.googleCalendar.events,
      },
    })),

  checkBackendHealth: async ({ silent = true, repairStatus = false } = {}) => {
    try {
      const res = await fetch(`${API}/health`, { cache: 'no-store' })
      if (!res.ok) throw new Error('health failed')

      set((state) => {
        const offlineLikeStatuses = new Set([
          'OFFLINE MODE',
          'BACKEND OFFLINE',
          'BRIEF FALLBACK ACTIVE',
        ])

        return {
          statusMsg:
            repairStatus && offlineLikeStatuses.has(state.statusMsg)
              ? 'JARVIS ONLINE'
              : state.statusMsg,
        }
      })

      return true
    } catch {
      if (!silent) set({ statusMsg: 'BACKEND OFFLINE' })
      return false
    }
  },

  fetchBrief: async () => {
    set({ isLoading: true, statusMsg: 'COMPILING BRIEF...' })
    try {
      const res = await fetch(`${API}/brief`, { cache: 'no-store' })
      if (!res.ok) throw new Error('brief failed')
      const data = await res.json()
      set((state) => ({
        brief: data,
        hnStories: data.hn_stories || [],
        googleCalendar: {
          ...state.googleCalendar,
          connected: Boolean(data.calendar_connected || state.googleCalendar.connected),
          events: Array.isArray(data.calendar_events) ? data.calendar_events : state.googleCalendar.events,
          upcoming_count: Array.isArray(data.calendar_events) ? data.calendar_events.length : (state.googleCalendar.events || []).length,
        },
        statusMsg: 'BRIEF READY',
      }))
      return data
    } catch {
      set({ statusMsg: 'BRIEF FALLBACK ACTIVE', brief: FALLBACK_BRIEF })
      return FALLBACK_BRIEF
    } finally {
      set({ isLoading: false })
    }
  },

  ingestGitHub: async (username) => {
    set({ statusMsg: `DEEP-READING ${username.toUpperCase()}...` })
    try {
      const res = await fetch(`${API}/ingest/github/user/${username}?deep=true`)
      const data = await res.json()
      set({
        repos: data.repos || [],
        statusMsg: `READING ${data.repo_count} REPOS AND FULL CODE CONTEXT`,
      })
      setTimeout(() => get().pollIngestStatus(), 3000)
      return data
    } catch {
      set({ statusMsg: 'GITHUB OFFLINE - FALLBACK REPOS LOADED', repos: FALLBACK_REPOS })
    }
  },

  pollIngestStatus: async () => {
    try {
      const res = await fetch(`${API}/ingest/status`, { cache: 'no-store' })
      const data = await res.json()
      set({
        repos: data.repos || [],
        localDocs: data.local_docs || [],
        knowledgeDocs: data.knowledge_docs,
        statusMsg: `${data.repos_loaded} REPOS | ${(data.local_docs || []).length} LOCAL DOCS | ${data.knowledge_docs} KNOWLEDGE DOCS`,
      })
    } catch {}
  },

  sendChat: async (message) => {
    const { chatHistory } = get()
    set({
      chatHistory: [...chatHistory, { role: 'user', content: message, ts: Date.now() }],
      statusMsg: 'THINKING...',
    })
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, include_context: true }),
      })
      const data = await res.json()
      set((state) => ({
        chatHistory: [...state.chatHistory, { role: 'assistant', content: data.response, ts: Date.now() }],
        statusMsg: 'READY',
      }))
      return data.response
    } catch {
      const fallback = 'Operating in offline mode. Focus on your highest-priority task and ship something today.'
      set((state) => ({
        chatHistory: [...state.chatHistory, { role: 'assistant', content: fallback, ts: Date.now() }],
        statusMsg: 'OFFLINE MODE',
      }))
      return fallback
    }
  },

  fetchExternal: async () => {
    try {
      const res = await fetch(`${API}/ingest/external`, { cache: 'no-store' })
      const data = await res.json()
      set({ hnStories: data.top || [], statusMsg: 'HN SIGNALS UPDATED' })
    } catch {}
  },

  fetchGoogleCalendarStatus: async ({ silent = true } = {}) => {
    if (!silent) set({ statusMsg: 'CHECKING GOOGLE CALENDAR...' })
    try {
      const res = await fetch(`${API}/calendar/google/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error('calendar status failed')
      const data = await res.json()
      set((state) => ({
        googleCalendar: {
          ...state.googleCalendar,
          ...data,
          events: data.events || [],
          upcoming_count: data.upcoming_count ?? (data.events || []).length,
        },
        statusMsg: silent
          ? state.statusMsg
          : data.connected
            ? 'GOOGLE CALENDAR READY'
            : data.configured
              ? 'GOOGLE CALENDAR DISCONNECTED'
              : 'GOOGLE CALENDAR SETUP REQUIRED',
      }))
      return data
    } catch (error) {
      if (!silent) set({ statusMsg: 'GOOGLE CALENDAR OFFLINE' })
      return { ...DEFAULT_GOOGLE_CALENDAR, last_error: error.message }
    }
  },

  connectGoogleCalendar: () => {
    if (typeof window === 'undefined') return
    window.location.href = `${API}/calendar/google/connect`
  },

  syncGoogleCalendar: async () => {
    set({ statusMsg: 'SYNCING GOOGLE CALENDAR...' })
    try {
      const res = await fetch(`${API}/calendar/google/sync`, { method: 'POST' })
      if (!res.ok) throw new Error('calendar sync failed')
      const data = await res.json()
      set((state) => ({
        googleCalendar: {
          ...state.googleCalendar,
          ...data,
          events: data.events || [],
          upcoming_count: data.upcoming_count ?? (data.events || []).length,
        },
        statusMsg: 'GOOGLE CALENDAR SYNCED',
      }))
      await get().fetchBrief()
      return data
    } catch (error) {
      set((state) => ({
        googleCalendar: {
          ...state.googleCalendar,
          last_error: error.message,
        },
        statusMsg: 'GOOGLE CALENDAR SYNC FAILED',
      }))
      throw error
    }
  },

  disconnectGoogleCalendar: async () => {
    set({ statusMsg: 'DISCONNECTING GOOGLE CALENDAR...' })
    try {
      await fetch(`${API}/calendar/google/disconnect`, { method: 'DELETE' })
      set({
        googleCalendar: DEFAULT_GOOGLE_CALENDAR,
        statusMsg: 'GOOGLE CALENDAR DISCONNECTED',
      })
      await get().fetchBrief()
    } catch {
      set({ statusMsg: 'GOOGLE CALENDAR DISCONNECT FAILED' })
    }
  },
}))

const FALLBACK_BRIEF = {
  date: formatIstBriefLabel(),
  greeting: 'Good morning. Operating in offline mode.',
  priority_actions: [
    'Ship your top priority task today',
    'Review and close stale pull requests',
    'Protect a 30 minute learning block',
    'Update documentation before switching tasks',
  ],
  insights: [
    'Local-first AI gives you full data sovereignty.',
    'Ship small and iterate fast so momentum compounds.',
    'Your stack is production-ready. Trust it and move.',
  ],
  hn_picks: [
    'Local AI tooling is maturing rapidly',
    'RAG plus vector search is the new standard',
  ],
  learning_goals: ['RAG optimization', 'Vector DB tuning', 'FastAPI async patterns'],
  voice_summary:
    'JARVIS online. Offline mode active. Focus on shipping your highest-priority task and protect one deep work block today.',
  active_project: 'JARVIS AI Brain',
  repos_count: 5,
  hn_stories: [],
  calendar_connected: false,
  calendar_events: [],
}

const FALLBACK_REPOS = [
  { name: 'lexprobe', language: 'Python', topics: ['ai', 'legal', 'rag'], description: 'Legal AI', patterns: ['REST API', 'RAG', 'Vector DB'] },
  { name: 'health-ai', language: 'Python', topics: ['health', 'ml'], description: 'Clinical AI', patterns: ['Database'] },
  { name: 'geoquant', language: 'Python', topics: ['finance', 'trading'], description: 'Finance AI', patterns: ['REST API'] },
  { name: 'drone-sim', language: 'Python', topics: ['physics', 'simulation'], description: 'Drone Sim', patterns: [] },
  { name: 'athera', language: 'TypeScript', topics: ['automation', 'ai'], description: 'Workflow AI', patterns: ['React/Next.js', 'Docker'] },
]
