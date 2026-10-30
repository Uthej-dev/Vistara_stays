import { apiClient } from './client'

export async function getAssistantStatus() {
  const { data } = await apiClient.get('/assistant/status')
  return data
}

/**
 * One chat turn. `history` is plain text only and `criteria` is what the server returned last
 * time; the server re-validates both. Prices and availability always come from the server.
 */
export async function sendAssistantMessage({ message, history, criteria }) {
  // A turn can involve several model calls and searches, so allow longer than the default.
  const { data } = await apiClient.post('/assistant/chat', { message, history, criteria }, { timeout: 60000 })
  return data
}
