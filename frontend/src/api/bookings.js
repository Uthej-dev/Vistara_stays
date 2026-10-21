import { apiClient } from './client'

/** `idempotencyKey` must stay the same for retries of the SAME booking attempt. */
export async function createBooking(body, idempotencyKey) {
  const { data } = await apiClient.post('/bookings', body, { headers: { 'Idempotency-Key': idempotencyKey } })
  return data
}

export async function getBookings(scope = 'all', page = 1) {
  const { data } = await apiClient.get('/bookings', { params: { scope, page, page_size: 10 } })
  return data
}

export async function getBooking(id) {
  const { data } = await apiClient.get(`/bookings/${id}`)
  return data
}

export async function cancelBooking(id, reason) {
  const { data } = await apiClient.post(`/bookings/${id}/cancel`, { reason: reason || null })
  return data
}

export async function getPaymentConfig() {
  const { data } = await apiClient.get('/payments/config')
  return data
}

export async function simulatePayment(id, outcome) {
  const { data } = await apiClient.post(`/payments/simulated/${id}/${outcome === 'fail' ? 'fail' : 'succeed'}`)
  return data
}
