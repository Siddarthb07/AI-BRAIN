/** Shared API base — must match the running FastAPI port. */
export const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8002'

export function apiUrl(path = '') {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}
