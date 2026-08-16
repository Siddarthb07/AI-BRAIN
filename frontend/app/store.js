'use client'
import { create } from 'zustand'
import { formatIstBriefLabel } from '../lib/time'

import { resolveApiBase, withAuth } from '../lib/api'
import { llmOnline } from '../lib/health'
import { requestGestureCamera } from '../lib/gestures'

/** Always resolve at call time so Docker (localhost:8001) vs tunnel (/backend) both work. */
const api = () => resolveApiBase()
const jfetch = (url, init) => fetch(url, withAuth(init || {}))


const DEFAULT_GOOGLE_CALENDAR = {
  configured: false,
  connected: false,
  calendar_id: 'primary',
  calendar_label: 'Primary calendar',
  redirect_uri: 'http://localhost:8002/calendar/google/callback',
  frontend_url: 'http://localhost:3000',
  last_synced_at: null,
  last_error: null,
  upcoming_count: 0,
  events: [],
}

function localLibraryHits(repos, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return []
  return (repos || []).flatMap((r) => {
    const deps = r.key_deps || {}
    const blob = [
      r.name,
      r.description,
      r.language,
      ...(r.topics || []),
      ...(r.imports || []),
      ...Object.keys(deps),
    ]
      .join(' ')
      .toLowerCase()
    if (!blob.includes(q)) return []
    const kind = Object.keys(deps).some((k) => k.toLowerCase().includes(q))
      ? 'DECLARED'
      : (r.imports || []).some((i) => String(i).toLowerCase().includes(q))
        ? 'IMPORT'
        : 'META'
    return [{ repo: r.name, kind, version: '', language: r.language }]
  })
}

function mergeScanHits(localHits, remoteHits) {
  const map = new Map()
  for (const h of [...(localHits || []), ...(remoteHits || [])]) {
    if (!h?.repo) continue
    const key = `${h.repo}::${h.kind || 'META'}::${h.path || ''}`
    if (!map.has(key)) map.set(key, h)
  }
  return [...map.values()]
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
  focusRepo: null,
  isLoading: false,
  voiceState: 'idle',
  wakeEnabled: false,
  wakeStatus: 'off',
  keepListening: false,
  gestureControlEnabled: false,
  gestureBootStream: null,
  gesturePreviewVisible: true,
  gestureLatest: null,
  gestureSession: { running: false, pid: null },
  visionCameraActive: false,
  visionCaptureRequest: null,
  visionLastCapture: null,
  graphSpinEnabled: true,
  statusMsg: 'JARVIS ONLINE',
  activePanel: 'dashboard',
  activeDemoId: null,
  layoutMode: 'dashboard',
  shellMode: 'dashboard',
  graphData: null,
  graphProjection: null,
  infraStatus: {
    sites: { items: [], total: 0, up: 0, down: 0, unknown: 0 },
    docker: { items: [], total: 0, running: 0, unhealthy: 0, source: 'unavailable' },
  },
  infraLoading: false,
  selectedInfraId: null,
  infraLogs: {},
  houseStatus: null,
  houseEntities: [],
  knowledgeDocs: 0,
  contextState: {
    active_project: 'unset',
    daily_goals: [],
    focus_time: '',
    energy_level: '',
  },
  healthState: {
    ollama: false,
    groq: false,
    qdrant: false,
    vault_configured: false,
    demo_mode: false,
    llm: null,
    healthReady: false,
  },
  googleCalendar: DEFAULT_GOOGLE_CALENDAR,
  lastSaveToast: null,
  intelArmory: { keys: [], recap: null },
  scanSweep: { query: '', hits: [], t0: 0, github_error: null },
  radarHits: [],
  dossier: null,
  ingestCinema: { active: false, files: [], repo: '' },
  bootRecap: null,
  ephemeralPins: [],
  webSummary: null,
  xrayView: null,
  repoLlmConsent: false,
  graphAskReply: '',
  pendingRepoAsk: false,
  worldEvents: { hotspots: [], news: [], hn: [] },
  mapFocus: { region: 'world', lat: 20, lon: 20, distance: 14, label: 'WORLD' },
  stageProject: null,
  stageHardware: null,
  craftCommand: null,
  stageMedia: null,
  mapOpen: false,
  weather: null,

  setRepos: (repos) => set({ repos }),
  setBrief: (brief) => set({ brief }),
  setSelectedNode: (node) => {
    const name =
      node?.type === 'repo'
        ? String(node.label || node.data?.name || '').trim()
        : ''
    set((state) => ({
      selectedNode: node,
      focusRepo: name || state.focusRepo,
      ...(name
        ? {
            contextState: {
              ...state.contextState,
              active_project: name,
            },
            statusMsg: `FOCUS · ${name}`,
          }
        : {}),
    }))
    // Persist focus so briefs / later chats match the graph selection
    if (name) {
      void get().setActiveProject(name)
    }
  },
  setFocusRepo: (focusRepo) => set({ focusRepo }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setWakeEnabled: (wakeEnabled) => set({ wakeEnabled }),
  setWakeStatus: (wakeStatus) => set({ wakeStatus }),
  setKeepListening: (keepListening) => set({ keepListening }),
  setGestureControlEnabled: (gestureControlEnabled) => set({ gestureControlEnabled }),
  setGestureBootStream: (gestureBootStream) => set({ gestureBootStream }),
  setGesturePreviewVisible: (gesturePreviewVisible) => set({ gesturePreviewVisible }),
  setVisionCameraActive: (visionCameraActive) => set({ visionCameraActive }),
  setGestureLatest: (gestureLatest) => set({ gestureLatest }),
  setGestureSession: (gestureSession) => set({ gestureSession }),
  setGraphSpinEnabled: (graphSpinEnabled) => set({ graphSpinEnabled }),

  /** Voice / UI: open camera, snap a frame, analyze. Resolves when runtime finishes. */
  runVoiceVisionCapture: async (prompt = '') => {
    const id = `vis-${Date.now()}`
    set({
      visionCaptureRequest: {
        id,
        prompt:
          String(prompt || '').trim() ||
          'Describe clearly what is visible in this camera frame. Be concrete and brief.',
        at: Date.now(),
      },
      visionLastCapture: null,
      shellMode: 'lab',
      activePanel: 'vision',
      statusMsg: 'VISION — OPENING CAMERA…',
    })

    const started = Date.now()
    while (Date.now() - started < 45000) {
      await new Promise((r) => setTimeout(r, 200))
      const last = get().visionLastCapture
      if (last?.id === id) return last
    }
    return {
      id,
      ok: false,
      analysis: '',
      error: 'Vision capture timed out — allow camera access and try again.',
      degraded: true,
    }
  },

  finishVisionCapture: (result) => {
    set({
      visionLastCapture: result,
      visionCaptureRequest: null,
    })
  },

  /** Must run from a click handler so the browser shows the camera prompt. */
  enableGestures: async () => {
    set({
      visionCameraActive: false,
      statusMsg: 'GESTURES — REQUESTING CAMERA…',
    })
    try {
      const stream = await requestGestureCamera()
      set({
        gestureBootStream: stream,
        gestureControlEnabled: true,
        gesturePreviewVisible: true,
        statusMsg: 'GESTURES — CAMERA GRANTED',
      })
      return true
    } catch (e) {
      set({
        gestureControlEnabled: false,
        gestureBootStream: null,
        statusMsg: `CAMERA DENIED — ${String(e?.message || e).slice(0, 60)}`,
      })
      return false
    }
  },

  disableGestures: () => {
    const stream = get().gestureBootStream
    try {
      stream?.getTracks?.().forEach((t) => t.stop())
    } catch {}
    set({
      gestureControlEnabled: false,
      gestureBootStream: null,
      gesturePreviewVisible: false,
      gestureSession: { running: false, pid: null, source: null },
      statusMsg: 'GESTURES OFF',
    })
  },

  toggleGestures: async () => {
    if (get().gestureControlEnabled) {
      get().disableGestures()
      return false
    }
    return get().enableGestures()
  },
  setActivePanel: (activePanel) => set({ activePanel }),
  setActiveDemoId: (activeDemoId) => set({ activeDemoId }),
  openDemo: (demoId) =>
    set({
      activeDemoId: demoId || null,
      activePanel: 'demos',
      shellMode: 'lab',
      layoutMode: 'lab',
    }),
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  setShellMode: (shellMode) => set({ shellMode }),
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
      const res = await jfetch(`${api()}/health`, { cache: 'no-store' })
      if (!res.ok) throw new Error('health failed')
      const data = await res.json()

      set((state) => {
        const offlineLike = new Set(['OFFLINE MODE', 'BACKEND OFFLINE', 'BRIEF FALLBACK ACTIVE'])
        return {
          healthState: {
            ollama: Boolean(data.ollama),
            groq: Boolean(data.groq || data.llm?.groq_configured),
            qdrant: Boolean(data.qdrant),
            vault_configured: Boolean(data.vault_configured),
            demo_mode: Boolean(data.demo_mode),
            vault_path: data.vault_path,
            llm: data.llm || null,
            healthReady: true,
          },
          statusMsg:
            repairStatus && offlineLike.has(state.statusMsg)
              ? llmOnline({ ...data, groq: data.groq || data.llm?.groq_configured })
                ? 'JARVIS ONLINE'
                : 'LLM OFFLINE — START OLLAMA OR GROQ'
              : state.statusMsg,
        }
      })
      return data
    } catch {
      if (!silent) set({ statusMsg: 'BACKEND OFFLINE' })
      set((s) => ({ healthState: { ...s.healthState, healthReady: true } }))
      return null
    }
  },

  fetchContext: async () => {
    try {
      const res = await jfetch(`${api()}/context`, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      const ctx = data.context || data
      set({
        contextState: {
          active_project: ctx.active_project || 'unset',
          daily_goals: ctx.daily_goals || [],
          focus_time: ctx.focus_time || '',
          energy_level: ctx.energy_level || '',
        },
      })
      return ctx
    } catch {
      return null
    }
  },

  setActiveProject: async (activeProject, dailyGoals) => {
    const project = String(activeProject || '').trim()
    if (!project) {
      set({ statusMsg: 'PROJECT NAME REQUIRED' })
      return null
    }
    try {
      const body = { active_project: project }
      if (Array.isArray(dailyGoals) && dailyGoals.length) body.daily_goals = dailyGoals
      const res = await jfetch(`${api()}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('context failed')
      const data = await res.json()
      const ctx = data.context || data
      set({
        contextState: {
          active_project: ctx.active_project || project,
          daily_goals: ctx.daily_goals || [],
          focus_time: ctx.focus_time || '',
          energy_level: ctx.energy_level || '',
        },
        focusRepo: project,
        statusMsg: `FOCUS → ${project.toUpperCase()}`,
      })
      await get().fetchBrief()
      return ctx
    } catch {
      set({ statusMsg: 'FOCUS SAVE FAILED' })
      return null
    }
  },

  analyzeVision: async (blob, prompt = '') => {
    try {
      const form = new FormData()
      form.append('file', blob, 'capture.jpg')
      if (prompt) form.append('prompt', prompt)
      const res = await jfetch(`${api()}/vision/analyze`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`vision ${res.status}`)
      return await res.json()
    } catch (e) {
      return { status: 'error', analysis: '', error: String(e) }
    }
  },

  loadChatSession: async (sessionId) => {
    try {
      if (sessionId) {
        const res = await jfetch(`${api()}/chat/sessions/${sessionId}`, { cache: 'no-store' })
        if (!res.ok) {
          set({ statusMsg: `CHAT LOAD FAILED (${res.status})` })
          return
        }
        const data = await res.json()
        const history = (data.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          ts: m.timestamp ? Date.parse(m.timestamp) : Date.now(),
          citations: m.meta?.citations,
          actions: m.meta?.actions,
        }))
        const sessionsRes = await jfetch(`${api()}/chat/sessions`, { cache: 'no-store' })
        const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] }
        set({
          sessionId,
          chatSessions: sessionsData.sessions || [],
          chatHistory: history,
          statusMsg: `SESSION · ${history.length} MSGS`,
        })
        return
      }
      const res = await jfetch(`${api()}/chat/history`, { cache: 'no-store' })
      if (!res.ok) {
        set({ statusMsg: `CHAT HISTORY FAILED (${res.status})` })
        return
      }
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
        statusMsg: history.length ? `HISTORY · ${history.length} MSGS` : 'CHAT READY',
      })
    } catch (e) {
      set({ statusMsg: `CHAT HISTORY OFFLINE — ${String(e?.message || e).slice(0, 40)}` })
    }
  },

  refreshChatSessions: async () => {
    try {
      const res = await jfetch(`${api()}/chat/sessions`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ chatSessions: data.sessions || [] })
    } catch {}
  },

  createChatSession: async (title = 'New chat') => {
    try {
      const res = await jfetch(`${api()}/chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) return null
      const session = await res.json()
      set({
        sessionId: session.id,
        chatHistory: [],
        statusMsg: 'NEW SESSION',
      })
      await get().loadChatSession(session.id)
      return session
    } catch {
      set({ statusMsg: 'SESSION CREATE FAILED' })
      return null
    }
  },

  fetchVaultStatus: async () => {
    try {
      const res = await jfetch(`${api()}/vault/status`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ vaultStatus: data })
      return data
    } catch {}
  },

  fetchVaultNotes: async () => {
    try {
      const res = await jfetch(`${api()}/vault/notes?limit=40`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ vaultNotes: data.notes || [] })
      return data.notes
    } catch {}
  },

  syncVault: async () => {
    set({ statusMsg: 'SYNCING VAULT...' })
    try {
      const res = await jfetch(`${api()}/vault/sync`, { method: 'POST' })
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
      const res = await jfetch(`${api()}/chat/save`, {
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

  confirmAction: async (actionId, confirmToken) => {
    const { sessionId } = get()
    try {
      const body = { action_id: actionId, session_id: sessionId }
      if (confirmToken) body.confirm_token = confirmToken
      const res = await jfetch(`${api()}/chat/action/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        set({ statusMsg: `ACTION OK — ${data.type || 'done'}` })
        await get().fetchVaultNotes()
        await get().fetchHouseEntities()
      } else {
        set({ statusMsg: data.error || 'ACTION FAILED' })
      }
      return data
    } catch {
      set({ statusMsg: 'ACTION FAILED' })
    }
  },

  fetchGraph: async ({ layers, limit = 100 } = {}) => {
    try {
      const params = new URLSearchParams()
      if (layers) params.set('layers', Array.isArray(layers) ? layers.join(',') : layers)
      if (limit) params.set('limit', String(limit))
      const qs = params.toString()
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), 25000) : null
      const res = await jfetch(`${api()}/graph${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
        signal: controller?.signal,
      })
      if (timer) clearTimeout(timer)
      if (!res.ok) throw new Error('graph failed')
      const data = await res.json()
      set({ graphData: data, graphProjection: data, statusMsg: get().statusMsg === 'GRAPH OFFLINE' ? 'JARVIS ONLINE' : get().statusMsg })
      return data
    } catch {
      // Keep last good projection so BrainGraph does not blank out on a slow poll.
      set((state) => ({
        statusMsg: state.graphProjection?.nodes?.length ? state.statusMsg : 'GRAPH OFFLINE',
      }))
      return null
    }
  },

  fetchInfraStatus: async ({ silent = false } = {}) => {
    if (!silent) set({ infraLoading: true })
    try {
      const res = await jfetch(`${api()}/infra/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`infra HTTP ${res.status}`)
      const data = await res.json()
      set({ infraStatus: data, infraLoading: false })
      return data
    } catch {
      set((state) => ({
        infraLoading: false,
        infraStatus: {
          ...state.infraStatus,
          docker: { ...state.infraStatus.docker, source: 'unavailable', error: 'Infrastructure API unavailable' },
        },
        ...(!silent ? { statusMsg: 'INFRASTRUCTURE LINK OFFLINE' } : {}),
      }))
      return null
    }
  },

  pollInfraNow: async ({ discover = false } = {}) => {
    set({ infraLoading: true, statusMsg: discover ? 'DISCOVERING DEPLOYMENTS…' : 'POLLING INFRASTRUCTURE…' })
    try {
      const res = await jfetch(`${api()}/infra/${discover ? 'discover' : 'poll'}`, { method: 'POST' })
      if (!res.ok) throw new Error(`infra poll HTTP ${res.status}`)
      const data = await res.json()
      set({ infraStatus: data, infraLoading: false, statusMsg: 'INFRASTRUCTURE TELEMETRY UPDATED' })
      await get().fetchGraph({ limit: 180 })
      return data
    } catch {
      set({ infraLoading: false, statusMsg: 'INFRASTRUCTURE POLL FAILED' })
      return null
    }
  },

  setSelectedInfraId: (selectedInfraId) => set({ selectedInfraId }),

  fetchContainerLogs: async (containerId, tail = 120) => {
    if (!containerId) return null
    try {
      const res = await jfetch(`${api()}/infra/containers/${encodeURIComponent(containerId)}/logs?tail=${tail}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`logs HTTP ${res.status}`)
      const data = await res.json()
      set((state) => ({ infraLogs: { ...state.infraLogs, [containerId]: data } }))
      return data
    } catch {
      const data = { container_id: containerId, logs: '', error: 'Logs unavailable' }
      set((state) => ({ infraLogs: { ...state.infraLogs, [containerId]: data } }))
      return data
    }
  },

  fetchSiteHistory: async (siteId, hours = 24) => {
    const [owner, repo] = String(siteId || '').split('/')
    if (!owner || !repo) return null
    try {
      const res = await jfetch(
        `${api()}/infra/sites/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/history?hours=${hours}`,
        { cache: 'no-store' },
      )
      return res.ok ? res.json() : null
    } catch {
      return null
    }
  },

  fetchGestureStatus: async () => {
    try {
      const res = await jfetch(`${api()}/gestures/status`, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      set({
        gestureSession: data.session || { running: false, pid: null },
        gestureLatest: data.latest || null,
      })
      return data
    } catch {
      return null
    }
  },

  pollGestureLatest: async () => {
    try {
      const res = await jfetch(`${api()}/gestures/latest`, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      const current = get().gestureLatest
      // Never overwrite a live browser MediaPipe feed with idle API polls
      if (current?.source === 'browser' && get().gestureControlEnabled) return current
      if (get().gestureSession?.source === 'browser' && get().gestureControlEnabled) return current
      set({ gestureLatest: data })
      return data
    } catch {
      return null
    }
  },

  startGestureSession: async () => {
    try {
      const res = await jfetch(`${api()}/gestures/session/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'start failed')
      set({
        gestureSession: { ...(data.session || { running: true }), source: 'opencv' },
        gestureControlEnabled: true,
        statusMsg: 'OPENCV HAND CONTROL ON',
      })
      return data
    } catch (e) {
      // Browser MediaPipe is the primary path — still enable it
      set({
        gestureControlEnabled: true,
        statusMsg: 'BROWSER GESTURES — CAMERA PROMPT',
      })
      return null
    }
  },

  stopGestureSession: async () => {
    try {
      await jfetch(`${api()}/gestures/session/stop`, { method: 'POST' })
    } catch {}
    set({
      gestureSession: { running: false, pid: null, source: null },
      statusMsg: 'OPENCV HAND CONTROL OFF',
    })
  },

  fetchHouseStatus: async () => {
    try {
      const res = await jfetch(`${api()}/house/status`, { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      set({ houseStatus: data })
      return data
    } catch {
      return null
    }
  },

  fetchHouseEntities: async (backend) => {
    try {
      const qs = backend ? `?backend=${encodeURIComponent(backend)}` : ''
      const res = await jfetch(`${api()}/house/entities${qs}`, { cache: 'no-store' })
      if (!res.ok) return []
      const data = await res.json()
      set({ houseEntities: data.entities || [] })
      return data.entities || []
    } catch {
      set({ houseEntities: [] })
      return []
    }
  },

  proposeHouseService: async ({ entity_id, service = 'turn_on', domain, backend, data = {} }) => {
    const { sessionId } = get()
    set({ statusMsg: `PROPOSING ${service.toUpperCase()}...` })
    try {
      const res = await jfetch(`${api()}/house/service`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id,
          service,
          domain,
          backend,
          data,
          session_id: sessionId,
          confirm: false,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        set({ statusMsg: payload.detail || 'HOUSE ACTION FAILED' })
        return null
      }
      set({
        statusMsg: payload.requires_confirm
          ? `CONFIRM — ${payload.action?.label || service}`
          : 'HOUSE ACTION OK',
      })
      return payload
    } catch {
      set({ statusMsg: 'HOUSE ACTION FAILED' })
      return null
    }
  },

  fetchBrief: async () => {
    set({ isLoading: true, statusMsg: 'COMPILING BRIEF...' })
    try {
      const res = await jfetch(`${api()}/brief`, { cache: 'no-store' })
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
    set({
      statusMsg: `DEEP-READING ${username.toUpperCase()}...`,
      ingestCinema: { active: true, files: [], repo: username },
    })
    try {
      const res = await jfetch(`${api()}/ingest/github/user/${username}?deep=true`)
      const data = await res.json()
      const nextRepos = data.repos || []
      if (nextRepos.length) {
        set({
          repos: nextRepos,
          statusMsg: `INDEXED ${data.repo_count || nextRepos.length} REPOS`,
        })
      } else {
        set({
          statusMsg: data.error || 'GITHUB INGEST EMPTY — CHECK TOKEN / RATE LIMIT',
        })
      }
      const cinema = setInterval(() => get().pollIntelEvents(), 800)
      setTimeout(() => {
        clearInterval(cinema)
        get().pollIngestStatus()
        set({ ingestCinema: { active: false, files: get().ingestCinema.files, repo: username } })
      }, 18000)
      return data
    } catch {
      set({ statusMsg: 'GITHUB INGEST FAILED', ingestCinema: { active: false, files: [], repo: '' } })
    }
  },

  pollIngestStatus: async () => {
    try {
      const res = await jfetch(`${api()}/ingest/status`, { cache: 'no-store' })
      const data = await res.json()
      set({
        repos: data.repos || [],
        localDocs: data.local_docs || [],
        knowledgeDocs: data.knowledge_docs || 0,
      })
    } catch {}
  },

  fetchArmory: async () => {
    try {
      const res = await jfetch(`${api()}/intel/armory`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ intelArmory: data, bootRecap: data.recap || null })
    } catch {}
  },

  setDossier: (dossier) => set({ dossier }),

  runLibraryScan: async (query) => {
    const q = String(query || '').trim()
    if (!q) return
    const localHits = localLibraryHits(get().repos, q)
    set({
      statusMsg: `SCAN · ${q.toUpperCase()}`,
      scanSweep: { query: q, hits: localHits, t0: Date.now(), github_error: null },
      shellMode: 'lab',
      layoutMode: 'graph',
      activePanel: 'graph',
    })
    try {
      const res = await jfetch(`${api()}/intel/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      const remote = data.hits || []
      const merged = mergeScanHits(localHits, remote)
      const err = data.github_error || null
      set({
        scanSweep: { query: q, hits: merged, t0: Date.now(), github_error: err },
        statusMsg: err
          ? `SEARCH UNAVAILABLE · ${err} · ${merged.length} LOCAL`
          : `LOCKS · ${merged.length} · ${q.toUpperCase()}`,
      })
      return { ...data, hits: merged, count: merged.length }
    } catch {
      set({
        statusMsg: localHits.length ? `LOCKS · ${localHits.length} · LOCAL` : 'SCAN FAILED',
      })
    }
  },

  runRadarSearch: async (query, opts = {}) => {
    const q = String(query || '').trim()
    if (!q) return
    set({
      statusMsg: `WEB · ${q.toUpperCase()}`,
      ephemeralPins: [],
      webSummary: null,
      ...(opts.stay
        ? {}
        : { shellMode: 'lab', layoutMode: 'graph', activePanel: 'graph' }),
    })
    try {
      const res = await jfetch(`${api()}/intel/radar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      set({ radarHits: data.hits || [], statusMsg: `WEB HITS · ${(data.hits || []).length}` })
      return data
    } catch {
      set({ statusMsg: 'WEB SEARCH FAILED' })
      return { hits: [] }
    }
  },

  summarizeWebHit: async (hit) => {
    if (!hit) return
    set({ statusMsg: 'SUMMARIZING…', webSummary: { title: hit.title, url: hit.url, summary: '…' } })
    try {
      const res = await jfetch(`${api()}/intel/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: hit.title || '',
          snippet: hit.snippet || hit.content || '',
          url: hit.url || '',
        }),
      })
      const data = await res.json()
      set({ webSummary: data, statusMsg: 'SUMMARY READY' })
      return data
    } catch {
      set({ statusMsg: 'SUMMARY FAILED', webSummary: { ...hit, summary: '', error: 'failed' } })
    }
  },

  pinWebHit: (hit) => {
    if (!hit?.url && !hit?.title) return
    const pin = {
      id: `pin:${hit.url || hit.title}`,
      title: hit.title || hit.url,
      url: hit.url || '',
      snippet: hit.snippet || '',
    }
    set((s) => {
      const rest = (s.ephemeralPins || []).filter((p) => p.id !== pin.id)
      const next = [...rest, pin].slice(-3)
      return { ephemeralPins: next, statusMsg: `PINNED · ${next.length}/3` }
    })
  },

  askAboutUrl: async (hit) => {
    const url = hit?.url || ''
    const title = hit?.title || url
    await get().sendChat(`Summarize and tell me why this matters: ${title}\n${url}`, { skipFocus: true })
  },

  fetchXray: async (repo) => {
    const name = String(repo || '').trim()
    if (!name) return
    try {
      const res = await jfetch(`${api()}/intel/xray/${encodeURIComponent(name)}`, { cache: 'no-store' })
      const data = await res.json()
      set({ xrayView: data, statusMsg: `X-RAY · ${name}` })
      return data
    } catch {
      set({ statusMsg: 'X-RAY FAILED' })
    }
  },

  grantRepoLlmConsent: () => {
    const name = get().focusRepo
    set({ repoLlmConsent: true, pendingRepoAsk: false })
    if (name) void get().askFocusedRepo(name)
  },

  askFocusedRepo: async (repo) => {
    const name = String(repo || get().focusRepo || '').trim()
    if (!name) return
    if (!get().repoLlmConsent) {
      set({ pendingRepoAsk: true, focusRepo: name, statusMsg: `CONSENT · ${name}` })
      return
    }
    await get().sendChat(`Brief me on ${name}: what it is, stack, and current risks.`, {
      forceFocus: true,
    })
  },

  clearHud: () =>
    set({
      selectedNode: null,
      scanSweep: { query: '', hits: [], t0: 0, github_error: null },
      radarHits: [],
      ephemeralPins: [],
      webSummary: null,
      xrayView: null,
      graphAskReply: '',
      pendingRepoAsk: false,
      stageProject: null,
      stageHardware: null,
      stageMedia: null,
      mapOpen: false,
      statusMsg: 'HUD CLEAR',
    }),

  fetchWorldEvents: async () => {
    try {
      const res = await jfetch(`${api()}/intel/world`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      set({ worldEvents: data })
    } catch {}
  },

  fetchHotspotBrief: async (title, region) => {
    const params = new URLSearchParams()
    if (title) params.set('title', title)
    if (region) params.set('region', region)
    try {
      const res = await jfetch(`${api()}/intel/hotspot?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return { hits: [], error: `HTTP ${res.status}` }
      return await res.json()
    } catch {
      return { hits: [], error: 'hotspot fetch failed' }
    }
  },

  fetchWeather: async () => {
    try {
      const res = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
        { cache: 'no-store' },
      )
      if (!res.ok) return
      const data = await res.json()
      const c = data.current || {}
      set({
        weather: {
          city: 'Bangalore',
          lat: 12.97,
          lon: 77.59,
          temp: c.temperature_2m,
          humidity: c.relative_humidity_2m,
          wind: c.wind_speed_10m,
          code: c.weather_code,
          unit: data.current_units?.temperature_2m || '°C',
        },
      })
    } catch {}
  },

  applyUiCommands: (cmds) => {
    const list = Array.isArray(cmds) ? cmds : []
    for (const cmd of list) get().applyUiCommand(cmd)
  },

  applyUiCommand: (cmd) => {
    if (!cmd?.type) return
    const params = cmd.params || {}
    set({ shellMode: 'dashboard', layoutMode: 'dashboard', activePanel: 'dashboard' })
    if (cmd.type === 'ui_zoom_map') {
      const region = String(params.region || 'world').toLowerCase()
      const table = {
        world: { region: 'world', lat: 20, lon: 20, distance: 14, label: 'WORLD' },
        india: { region: 'india', lat: 22, lon: 79, distance: 6.2, label: 'INDIA' },
        indian: { region: 'india', lat: 22, lon: 79, distance: 6.2, label: 'INDIA' },
        ukraine: { region: 'ukraine', lat: 48.4, lon: 31.2, distance: 5.8, label: 'UKRAINE' },
        gaza: { region: 'gaza', lat: 31.5, lon: 34.45, distance: 5.2, label: 'LEVANT' },
        sudan: { region: 'sudan', lat: 15.5, lon: 32.5, distance: 6, label: 'SUDAN' },
        taiwan: { region: 'taiwan', lat: 23.7, lon: 121, distance: 5.8, label: 'TAIWAN' },
        usa: { region: 'usa', lat: 39, lon: -98, distance: 7.5, label: 'USA' },
        europe: { region: 'europe', lat: 50, lon: 10, distance: 7.2, label: 'EUROPE' },
        china: { region: 'china', lat: 35, lon: 105, distance: 7, label: 'CHINA' },
      }
      set({ mapFocus: table[region] || table.world, mapOpen: true, statusMsg: `MAP · ${(table[region] || table.world).label}` })
    }
    if (cmd.type === 'ui_map_scale') {
      const cur = get().mapFocus || { region: 'world', lat: 20, lon: 20, distance: 14, label: 'WORLD' }
      const dir = Number(params.dir || 0)
      const raw = (cur.distance || 14) * (dir < 0 ? 1.18 : 0.84)
      const next = Math.max(3.5, Math.min(16, raw))
      set({
        mapOpen: true,
        mapFocus: { ...cur, distance: next },
        statusMsg: `MAP · ${dir > 0 ? 'ZOOM IN' : 'ZOOM OUT'}`,
      })
    }
    if (cmd.type === 'ui_open_map') {
      set({
        mapOpen: true,
        stageHardware: null,
        stageProject: null,
        selectedNode: { id: 'sys:map', label: 'WORLD MAP', type: 'map', data: {} },
        statusMsg: 'MAP · WORLD',
      })
    }
    if (cmd.type === 'ui_show_weather') {
      void get().fetchWeather()
      set({
        mapOpen: false,
        stageHardware: null,
        stageProject: null,
        selectedNode: { id: 'sys:weather', label: 'WX · BANGALORE', type: 'weather', data: get().weather || {} },
        statusMsg: 'WX · BANGALORE',
      })
    }
    if (cmd.type === 'ui_open_project') {
      const name = String(params.name || '').trim()
      const repo = (get().repos || []).find((r) => String(r.name || '').toLowerCase() === name.toLowerCase())
      set({
        stageProject: repo || { name },
        focusRepo: name,
        selectedNode: {
          id: `repo:${name}`,
          label: name,
          type: 'repo',
          data: repo || { name },
        },
        stageHardware: null,
        mapOpen: false,
        statusMsg: `PROJECT · ${name.toUpperCase()}`,
      })
      void get().fetchXray(name)
    }
    if (cmd.type === 'ui_show_hardware') {
      const id = String(params.id || '').toLowerCase().includes('hex') ? 'hex' : 'quad'
      const label = id === 'hex' ? 'HEX · F550 NAZA' : 'QUAD · KK2.1.5'
      set({
        stageHardware: id,
        stageProject: null,
        mapOpen: false,
        selectedNode: { id: `hw:${id}`, label, type: 'hardware', data: { id } },
        statusMsg: `HOLO · ${id.toUpperCase()}`,
      })
    }
    if (cmd.type === 'ui_craft') {
      const action = String(params.action || 'explode')
      set({
        craftCommand: { type: action, id: params.id || '' },
        statusMsg: `CRAFT · ${action.toUpperCase()}`,
      })
    }
    if (cmd.type === 'ui_go_home') {
      get().clearHud()
      set({
        shellMode: 'dashboard',
        layoutMode: 'dashboard',
        activePanel: 'dashboard',
        statusMsg: 'HOME',
      })
      if (typeof window !== 'undefined' && window.location.hash !== '#home') {
        window.location.hash = '#home'
      }
    }
    if (cmd.type === 'ui_clear_stage') {
      get().clearHud()
    }
  },

  pollIntelEvents: async () => {
    try {
      const res = await jfetch(`${api()}/intel/events?limit=30`, { cache: 'no-store' })
      const data = await res.json()
      const files = (data.events || [])
        .filter((e) => e.type === 'ingest.file')
        .map((e) => e.payload?.path)
        .filter(Boolean)
        .slice(-18)
      if (files.length) {
        set((s) => ({
          ingestCinema: { ...s.ingestCinema, files, active: s.ingestCinema.active || files.length > 0 },
        }))
      }
    } catch {}
  },

  sendChat: async (message, opts = {}) => {
    const { chatHistory, sessionId, focusRepo, selectedNode, contextState } = get()
    const selectedName =
      selectedNode?.type === 'repo'
        ? String(selectedNode.label || selectedNode.data?.name || '').trim()
        : ''
    const focus =
      opts.skipFocus
        ? null
        : selectedName ||
          focusRepo ||
          (contextState?.active_project && contextState.active_project !== 'unset'
            ? contextState.active_project
            : null)
    const allowFocus = Boolean(focus) && (opts.forceFocus || get().repoLlmConsent)

    const onToken = typeof opts.onToken === 'function' ? opts.onToken : null

    set({
      chatHistory: [...chatHistory, { role: 'user', content: message, ts: Date.now() }],
      statusMsg: focus ? `THINKING · ${focus}…` : 'THINKING...',
    })
    try {
      const res = await jfetch(`${api()}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          include_context: true,
          session_id: sessionId,
          focus_repo: allowFocus ? focus || undefined : undefined,
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error('stream failed')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistant = ''
      let meta = { citations: [], actions: [], ui: [], llm_offline: false }
      let gotSession = sessionId

      // Placeholder assistant bubble that streams in place
      set((state) => ({
        chatHistory: [
          ...state.chatHistory,
          { role: 'assistant', content: '', ts: Date.now(), streaming: true },
        ],
      }))

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          let event
          try {
            event = JSON.parse(line.slice(6))
          } catch {
            continue
          }
          if (event.type === 'session' && event.session_id) {
            gotSession = event.session_id
            set({ sessionId: event.session_id })
          } else if (event.type === 'token' && event.text) {
            assistant += event.text
            try {
              onToken?.(event.text)
            } catch {}
            set((state) => {
              const hist = [...state.chatHistory]
              const last = hist[hist.length - 1]
              if (last?.role === 'assistant') {
                hist[hist.length - 1] = { ...last, content: assistant, streaming: true }
              }
              return { chatHistory: hist, statusMsg: onToken ? 'SPEAKING...' : 'STREAMING...' }
            })
          } else if (event.type === 'meta') {
            meta = {
              citations: event.citations || [],
              actions: event.actions || [],
              ui: event.ui || [],
              llm_offline: Boolean(event.llm_offline),
              demo: event.demo || null,
              research: event.research || null,
            }
          } else if (event.type === 'done') {
            if (event.reply) assistant = event.reply
            if (event.session_id) gotSession = event.session_id
          }
        }
      }

      set((state) => {
        const hist = [...state.chatHistory]
        const last = hist[hist.length - 1]
        if (last?.role === 'assistant') {
          hist[hist.length - 1] = {
            role: 'assistant',
            content: assistant || 'No response',
            ts: Date.now(),
            citations: meta.citations,
            actions: meta.actions,
            llm_offline: meta.llm_offline,
            demo: meta.demo || null,
            research: meta.research || null,
          }
        }
        const next = {
          sessionId: gotSession || state.sessionId,
          chatHistory: hist,
          graphAskReply: assistant || '',
          statusMsg: meta.llm_offline
            ? 'LLM OFFLINE'
            : meta.demo
              ? `DEMO · ${meta.demo.title || meta.demo.id}`
              : meta.research
                ? `RESEARCH · ${meta.research.topic || 'done'}`
                : 'READY',
        }
        if (meta.demo?.id) {
          next.activeDemoId = meta.demo.id
        }
        if (meta.research) {
          next.dossier = {
            topic: meta.research.topic,
            report: meta.research.report || assistant,
            hits: meta.research.hits || meta.citations || [],
            provider: meta.research.provider,
          }
          next.shellMode = 'lab'
          next.activePanel = 'intel'
          next.layoutMode = 'lab'
        }
        return next
      })
      get().applyUiCommands(meta.ui)
      // Keep thread list in sync with latest session titles / order
      void get().refreshChatSessions()
      return assistant
    } catch {
      // Fallback to non-streaming POST
      try {
        const res = await jfetch(`${api()}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, include_context: true, session_id: sessionId }),
        })
        const data = await res.json()
        const reply = data.reply || data.response || 'No response'
        set((state) => {
          const hist = [...state.chatHistory]
          const last = hist[hist.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            hist[hist.length - 1] = {
              role: 'assistant',
              content: reply,
              ts: Date.now(),
              citations: data.citations || [],
              actions: data.actions || [],
              llm_offline: data.llm_offline,
              demo: data.demo || null,
            }
          } else {
            hist.push({
              role: 'assistant',
              content: reply,
              ts: Date.now(),
              citations: data.citations || [],
              actions: data.actions || [],
              llm_offline: data.llm_offline,
              demo: data.demo || null,
            })
          }
          return {
            sessionId: data.session_id || state.sessionId,
            chatHistory: hist,
            statusMsg: data.demo ? `DEMO · ${data.demo.title || data.demo.id}` : data.llm_offline ? 'LLM OFFLINE' : 'READY',
            ...(data.demo?.id ? { activeDemoId: data.demo.id } : {}),
          }
        })
        void get().refreshChatSessions()
        return reply
      } catch {
        const err = 'Backend unreachable. Is the API running on localhost:8001?'
        set((state) => ({
          chatHistory: [
            ...state.chatHistory.filter((m) => !(m.role === 'assistant' && m.streaming)),
            { role: 'assistant', content: err, ts: Date.now(), llm_offline: true },
          ],
          statusMsg: 'BACKEND OFFLINE',
        }))
        return err
      }
    }
  },

  fetchExternal: async () => {
    try {
      const res = await jfetch(`${api()}/ingest/external`, { cache: 'no-store' })
      const data = await res.json()
      set({ hnStories: data.top || [] })
    } catch {}
  },

  fetchGoogleCalendarStatus: async ({ silent = true } = {}) => {
    if (!silent) set({ statusMsg: 'CHECKING GOOGLE CALENDAR...' })
    try {
      const res = await jfetch(`${api()}/calendar/google/status`, { cache: 'no-store' })
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
    window.location.href = `${api()}/calendar/google/connect`
  },

  syncGoogleCalendar: async () => {
    set({ statusMsg: 'SYNCING GOOGLE CALENDAR...' })
    try {
      const res = await jfetch(`${api()}/calendar/google/sync`, { method: 'POST' })
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
      await jfetch(`${api()}/calendar/google/disconnect`, { method: 'DELETE' })
      set({ googleCalendar: DEFAULT_GOOGLE_CALENDAR, statusMsg: 'GOOGLE CALENDAR DISCONNECTED' })
      await get().fetchBrief()
    } catch {
      set({ statusMsg: 'GOOGLE CALENDAR DISCONNECT FAILED' })
    }
  },
}))
