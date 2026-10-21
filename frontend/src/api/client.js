import axios from 'axios'

/**
 * The single Axios instance every API module uses.
 * Base URL is relative (`/api/v1`) so requests go to the same origin, which the Vite proxy
 * (dev) or Vercel rewrite (prod) forwards to FastAPI. Auth headers and silent token refresh
 * are added here in Phase 5.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 15000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})

/** Turn any Axios error into the backend's `{code, message}` shape for consistent UI messages. */
export function toApiError(error) {
  const body = error?.response?.data?.error
  if (body) return body
  if (error?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to respond.' }
  }
  return { code: 'NETWORK_ERROR', message: 'Could not reach the server. Check your connection.' }
}
