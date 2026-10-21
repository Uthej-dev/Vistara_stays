// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { apiClient, setAccessToken } from '../api/client'

// jsdom doesn't implement scrolling; React Router's <ScrollRestoration> calls it.
window.scrollTo = () => {}

// jsdom's <dialog> lacks showModal/close.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

/**
 * No real network in tests. By default every request fails like "not signed in"; a test that
 * needs specific server behaviour sets `apiClient.defaults.adapter` itself (see test/http.js).
 */
export const offlineAdapter = (config) =>
  Promise.reject(
    Object.assign(new Error('Request failed with status code 401'), {
      config,
      response: { status: 401, data: { error: { code: 'NO_SESSION', message: 'Not signed in' } }, headers: {}, config },
    }),
  )
apiClient.defaults.adapter = offlineAdapter

afterEach(() => {
  apiClient.defaults.adapter = offlineAdapter
  setAccessToken(null)
  document.cookie = 'vs_has_session=; Max-Age=0; path=/'
})
