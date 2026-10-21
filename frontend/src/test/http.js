import { apiClient } from '../api/client'

/**
 * Fake the backend for one test: routes = { 'POST /auth/login': (config) => [200, body] }.
 * Unmatched requests get 404. Returns the list of requests made, for assertions.
 */
export function fakeServer(routes) {
  const calls = []
  // The app only tries to restore a session when the server's hint cookie is present.
  if (routes['POST /auth/refresh']) document.cookie = 'vs_has_session=1; path=/'
  apiClient.defaults.adapter = async (config) => {
    const key = `${config.method.toUpperCase()} ${config.url}`
    calls.push({ key, config, data: config.data ? JSON.parse(config.data) : undefined })
    const handler = routes[key]
    const [status, data] = handler ? await handler(config, calls) : [404, { error: { code: 'NOT_FOUND', message: `No fake for ${key}` } }]
    const response = { status, data, headers: {}, config, statusText: String(status) }
    if (status >= 400) {
      throw Object.assign(new Error(`Request failed with status code ${status}`), { config, response })
    }
    return response
  }
  return calls
}

export const USER = { id: 'u1', email: 'asha@example.com', name: 'Asha Rao', role: 'customer', email_verified: true, preferences: { destinations: [], newsletter: false } }

export const session = (user = USER) => ({ access_token: 'token-123', token_type: 'bearer', expires_in: 900, user })
