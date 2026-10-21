import { apiClient } from './client'

const get = (url, params) => apiClient.get(url, { params }).then((r) => r.data)
const post = (url, body) => apiClient.post(url, body).then((r) => r.data)
const patch = (url, body) => apiClient.patch(url, body).then((r) => r.data)
const put = (url, body) => apiClient.put(url, body).then((r) => r.data)

export const ownerApi = {
  dashboard: () => get('/owner/dashboard'),
  resorts: () => get('/owner/resorts'),
  resort: (id) => get(`/owner/resorts/${id}`),
  createResort: (body) => post('/owner/resorts', body),
  updateResort: (id, body) => patch(`/owner/resorts/${id}`, body),
  submitResort: (id) => post(`/owner/resorts/${id}/submit`),
  archiveResort: (id) => post(`/owner/resorts/${id}/archive`),
  rooms: (resortId) => get(`/owner/resorts/${resortId}/room-types`),
  createRoom: (resortId, body) => post(`/owner/resorts/${resortId}/room-types`, body),
  updateRoom: (roomId, body) => patch(`/owner/room-types/${roomId}`, body),
  calendar: (roomId, from, to) => get(`/owner/room-types/${roomId}/calendar`, { from, to }),
  updateCalendar: (roomId, body) => put(`/owner/room-types/${roomId}/calendar`, body),
  rules: (roomId) => get(`/owner/room-types/${roomId}/rate-rules`),
  createRule: (roomId, body) => post(`/owner/room-types/${roomId}/rate-rules`, body),
  deleteRule: (ruleId) => apiClient.delete(`/owner/rate-rules/${ruleId}`),
  bookings: (params) => get('/owner/bookings', params),
  booking: (id) => get(`/owner/bookings/${id}`),
  bookingAction: (id, action, reason) => post(`/owner/bookings/${id}/${action}`, reason ? { reason } : undefined),
  enquiries: (status) => get('/owner/enquiries', status ? { status } : {}),
  updateEnquiry: (id, status) => patch(`/owner/enquiries/${id}`, { status }),
}

export async function uploadImage(file, alt) {
  const form = new FormData()
  form.append('file', file)
  form.append('alt', alt)
  const { data } = await apiClient.post('/uploads/images', form, { timeout: 60000 })
  return data
}
