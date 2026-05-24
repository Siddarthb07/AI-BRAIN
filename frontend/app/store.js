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

const EMPTY_BRIEF = {
  date: formatIstBriefLabel(),
  greeting: 'Brief unavailable — connect LLM or sync vault.',
  priority_actions: [],
  insights: [],
  hn_picks: [],
  learning_goals: [],
  voice_summary: '',
  llm_available: false,
  hn_stories: [],
  calendar_connected: false,
  calendar_events: [],
  repos_count: 0,
}

export const useJarvisStore = create((set, get) => ({
  repos: [],
  brief: null,
  chatHistory: [],
  chatSessions: [],
  sessionId: null,
  hnStories: [],
  localDocs: [],
  vaultNotes: [],
  vaultStatus: null,
  selectedNode: null,
  isLoading: false,
  voiceState: 'idle',
  statusMsg: 'JARVIS ONLINE',
  activePanel: 'chat',
  layoutMode: 'work',
  knowledgeDocs: 0,
  healthState: { ollama: false, qdrant: false, vault_configured: false, demo_mode: false },
  googleCalendar: DEFAULT_GOOGLE_CALENDAR,
  lastSaveToast: null,

  setRepos: (repos) => set({ repos }),
  setBrief: (brief) => set({ brief }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
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
      const data = await res.json()

      set((state) => {
        const offlineLike = new Set(['OFFLINE MODE', 'BACKEND OFFLINE', 'BRIEF FALLBACK ACTIVE'])
        return {
          healthState: {
            ollama: Boolean(data.ollama),
            qdrant: Boolean(data.qdrant),
            vault_configured: Boolean(data.vault_configured),
            demo_mode: Boolean(data.demo_mode),
            vault_path: data.vault_path,
          },
          statusMsg:
            repairStatus && offlineLike.has(state.statusMsg)
              ? data.ollama
                ? 'JARVIS ONLINE'
                : 'LLM OFFLINE — START OLLAMA'
              : state.statusMsg,
        }
      })
      return data
    } catch {
      if (!silent) set({ statusMsg: 'BACKEND OFFLINE' })
      return null
    }
  },

  loadChatSession: async () => {
    try {
      const res = await fetch(`${API}/chat/history`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const history = (data.history || []).map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
        citations: m.meta?.citations,
        actions: m.meta?.actions,
      }))
      set({
        sessionId: data.session_id,
        chatSessions: data.sessions || [],
        chatHistory: history,
      })
    } catch {}
  },

  fetchVaultStatus: async () => {
    try {
      const res = await fetch(`${API}/vault/status`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ vaultStatus: data })
      return data
    } catch {}
  },

  fetchVaultNotes: async () => {
    try {
      const res = await fetch(`${API}/vault/notes?limit=40`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ vaultNotes: data.notes || [] })
      return data.notes
    } catch {}
  },

  syncVault: async () => {
    set({ statusMsg: 'SYNCING VAULT...' })
    try {
      const res = await fetch(`${API}/vault/sync`, { method: 'POST' })
      const data = await res.json()
      set({ statusMsg: `VAULT SYNCED — ${data.indexed_chunks || 0} chunks` })
      await get().fetchVaultNotes()
      await get().pollIngestStatus()
      return data
    } catch {
      set({ statusMsg: 'VAULT SYNC FAILED' })
    }
  },

  saveToVault: async (content, title) => {
    try {
      const res = await fetch(`${API}/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title: title || 'JARVIS note', folder: 'Chat' }),
      })
      const data = await res.json()
      const path = data.saved?.relative_path || 'vault'
      set({ lastSaveToast: path, statusMsg: `SAVED → ${path}` })
      await get().fetchVaultNotes()
      return data
    } catch {
      set({ statusMsg: 'VAULT SAVE FAILED' })
    }
  },

  confirmAction: async (actionId) => {
    const { sessionId } = get()
    try {
      const res = await fetch(`${API}/chat/action/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: actionId, session_id: sessionId }),
      })
      const data = await res.json()
      if (data.ok) {
        set({ statusMsg: `ACTION OK — ${data.type}` })
        await get().fetchVaultNotes()
      } else {
        set({ statusMsg: data.error || 'ACTION FAILED' })
      }
      return data
    } catch {
      set({ statusMsg: 'ACTION FAILED' })
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
        statusMsg: data.llm_available === false ? 'BRIEF — LLM OFFLINE' : 'BRIEF READY',
      }))
      await get().fetchVaultNotes()
      return data
    } catch {
      set({ statusMsg: 'BRIEF UNAVAILABLE', brief: EMPTY_BRIEF })
      return EMPTY_BRIEF
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
        statusMsg: data.repos?.length ? `INDEXED ${data.repo_count || data.repos.length} REPOS` : 'NO REPOS FOUND — CONNECT GITHUB',
      })
      setTimeout(() => get().pollIngestStatus(), 3000)
      return data
    } catch {
      set({ statusMsg: 'GITHUB INGEST FAILED', repos: [] })
    }
  },

  pollIngestStatus: async () => {
    try {
      const res = await fetch(`${API}/ingest/status`, { cache: 'no-store' })
      const data = await res.json()
      set({
        repos: data.repos || [],
        localDocs: data.local_docs || [],
        knowledgeDocs: data.knowledge_docs || 0,
      })
    } catch {}
  },

  sendChat: async (message) => {
    const { chatHistory, sessionId } = get()
    set({
      chatHistory: [...chatHistory, { role: 'user', content: message, ts: Date.now() }],
      statusMsg: 'THINKING...',
    })
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, include_context: true, session_id: sessionId }),
      })
      const data = await res.json()
      const reply = data.reply || data.response || 'No response'
      set((state) => ({
        sessionId: data.session_id || state.sessionId,
        chatHistory: [
          ...state.chatHistory,
          {
            role: 'assistant',
            content: reply,
            ts: Date.now(),
            citations: data.citations || [],
            actions: data.actions || [],
            llm_offline: data.llm_offline,
          },
        ],
        statusMsg: data.llm_offline ? 'LLM OFFLINE' : 'READY',
      }))
      return reply
    } catch {
      const err = 'Backend unreachable. Start the API on port 8001.'
      set((state) => ({
        chatHistory: [...state.chatHistory, { role: 'assistant', content: err, ts: Date.now(), llm_offline: true }],
        statusMsg: 'BACKEND OFFLINE',
      }))
      return err
    }
  },

  fetchExternal: async () => {
    try {
      const res = await fetch(`${API}/ingest/external`, { cache: 'no-store' })
      const data = await res.json()
      set({ hnStories: data.top || [] })
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
        statusMsg: silent ? state.statusMsg : data.connected ? 'GOOGLE CALENDAR READY' : 'CALENDAR BETA',
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
        googleCalendar: { ...state.googleCalendar, ...data, events: data.events || [] },
        statusMsg: 'GOOGLE CALENDAR SYNCED',
      }))
      await get().fetchBrief()
      return data
    } catch (error) {
      set({ statusMsg: 'GOOGLE CALENDAR SYNC FAILED' })
      throw error
    }
  },

  disconnectGoogleCalendar: async () => {
    try {
      await fetch(`${API}/calendar/google/disconnect`, { method: 'DELETE' })
      set({ googleCalendar: DEFAULT_GOOGLE_CALENDAR, statusMsg: 'GOOGLE CALENDAR DISCONNECTED' })
      await get().fetchBrief()
    } catch {
      set({ statusMsg: 'GOOGLE CALENDAR DISCONNECT FAILED' })
    }
  },
}))
