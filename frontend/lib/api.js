/**
 * Shared API base.
 * - Localhost Docker / native: prefer NEXT_PUBLIC_API_URL (e.g. http://localhost:8001)
 * - Tunnel / LAN hostname: use same-origin `/backend` proxy (see app/backend/[...path]/route.ts)
 */

function envApiUrl() {
  if (typeof process === 'undefined' || !process.env.NEXT_PUBLIC_API_URL) return ''
  return String(process.env.NEXT_PUBLIC_API_URL).trim().replace(/\/$/, '')
}

export function resolveApiBase() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return '/backend'
    }
  }

  const env = envApiUrl()
  if (env && /^https?:\/\//i.test(env)) return env
  if (env && env !== 'same-origin' && env !== 'auto' && env !== '/backend') return env
  // Native next on :3000 with local uvicorn :8002 — same-origin proxy
  return '/backend'
}

/** Resolved at module load for client bundles (NEXT_PUBLIC_* inlined). */
export const API_BASE = resolveApiBase()

export function apiUrl(path = '') {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${resolveApiBase()}${p}`
}

/** Token from localStorage or NEXT_PUBLIC_JARVIS_API_TOKEN (never commit real secrets). */
export function getJarvisToken() {
  if (typeof window !== 'undefined') {
    try {
      const ls =
        window.localStorage.getItem('JARVIS_API_TOKEN') ||
        window.localStorage.getItem('jarvis_api_token') ||
        ''
      if (ls.trim()) return ls.trim()
    } catch {
      /* private mode */
    }
  }
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_JARVIS_API_TOKEN) {
    return String(process.env.NEXT_PUBLIC_JARVIS_API_TOKEN).trim()
  }
  return ''
}

/** Merge Authorization / X-Jarvis-Token when a token is configured. */
export function withAuth(init = {}) {
  const next = { ...init }
  const headers = new Headers(init.headers || {})
  const token = getJarvisToken()
  if (token) {
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('X-Jarvis-Token')) headers.set('X-Jarvis-Token', token)
  }
  next.headers = headers
  return next
}

export function apiFetch(path, init = {}) {
  return fetch(apiUrl(path), withAuth(init))
}
