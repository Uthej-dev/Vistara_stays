import axios from 'axios'

/**
 * The single Axios instance every API module uses.
 *
 * Auth model (see docs/02-architecture.md §6):
 * - The access token lives ONLY in this module's memory (never localStorage), so XSS can't read
 *   it from storage. It's attached to every request.
 * - The refresh token is an httpOnly cookie the browser sends to /api/v1/auth/* automatically.
 * - On a 401, we call /auth/refresh once and retry the original request. Concurrent 401s share
 *   one refresh call ("single flight"), so the refresh token is rotated exactly once.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})

let accessToken = null
let refreshPromise = null
const listeners = new Set()

export function setAccessToken(token) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

/** Subscribe to session changes: fn({ type: 'refreshed', data } | { type: 'expired' }). */
export function onSessionChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(event) {
  for (const fn of listeners) fn(event)
}

/** Non-secret cookie set by the server alongside the httpOnly refresh cookie. */
export function hasSessionHint() {
  return typeof document !== 'undefined' && document.cookie.split('; ').some((c) => c === 'vs_has_session=1')
}

function clearSessionHint() {
  if (typeof document !== 'undefined') document.cookie = 'vs_has_session=; Max-Age=0; path=/'
}

export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post('/auth/refresh', null, { _skipAuthRefresh: true })
      .then(({ data }) => {
        setAccessToken(data.access_token)
        emit({ type: 'refreshed', data })
        return data
      })
      .catch((error) => {
        setAccessToken(null)
        clearSessionHint()
        emit({ type: 'expired' })
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error
    const shouldRefresh =
      response?.status === 401 &&
      accessToken && // only if we thought we were signed in
      !config?._retried &&
      !config?._skipAuthRefresh &&
      !config?.url?.startsWith('/auth/')
    if (!shouldRefresh) throw error
    try {
      await refreshSession()
    } catch {
      throw error
    }
    return apiClient({ ...config, _retried: true })
  },
)

/** Turn any Axios error into the backend's `{code, message}` shape for consistent UI messages. */
export function toApiError(error) {
  const body = error?.response?.data?.error
  if (body) return body
  if (error?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to respond.' }
  }
  if (error?.message && !error?.response && !error?.request) {
    return { code: 'CLIENT_ERROR', message: error.message }
  }
  return { code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection.' }
}

/** Map a 422 response to { fieldName: message } for form fields. */
export function fieldErrors(error) {
  const fields = error?.response?.data?.error?.details?.fields ?? []
  const out = {}
  for (const f of fields) {
    const name = f.loc?.[f.loc.length - 1]
    if (typeof name === 'string' && !out[name]) out[name] = f.msg.replace(/^Value error, /, '')
  }
  return out
}
