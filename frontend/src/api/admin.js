import { apiClient } from './client'

const get = (url, params) => apiClient.get(url, { params }).then((r) => r.data)
const post = (url, body) => apiClient.post(url, body).then((r) => r.data)

export const adminApi = {
  metrics: () => get('/admin/metrics'),
  resorts: (status, page = 1) => get('/admin/resorts', { status: status || undefined, page }),
  resort: (id) => get(`/admin/resorts/${id}`),
  moderateResort: (id, action, reason) => post(`/admin/resorts/${id}/${action}`, reason ? { reason } : undefined),
  users: (params) => get('/admin/users', params),
  userAction: (id, action, reason) => post(`/admin/users/${id}/${action}`, reason ? { reason } : undefined),
  bookings: (params) => get('/admin/bookings', params),
  booking: (id) => get(`/admin/bookings/${id}`),
  cancelBooking: (id, reason) => post(`/admin/bookings/${id}/cancel`, { reason }),
  reviews: (params) => get('/admin/reviews', params),
  moderateReview: (id, action, reason) => post(`/admin/reviews/${id}/${action}`, reason ? { reason } : undefined),
  reports: (status = 'open') => get('/admin/reports', { status }),
  dismissReport: (id) => post(`/admin/reports/${id}/dismiss`),
  destinations: () => get('/admin/destinations'),
  createDestination: (body) => post('/admin/destinations', body),
  updateDestination: (id, body) => apiClient.patch(`/admin/destinations/${id}`, body).then((r) => r.data),
  coupons: () => get('/admin/coupons'),
  createCoupon: (body) => post('/admin/coupons', body),
  updateCoupon: (id, body) => apiClient.put(`/admin/coupons/${id}`, body).then((r) => r.data),
  settings: () => get('/admin/settings'),
  updateSettings: (body) => apiClient.patch('/admin/settings', body).then((r) => r.data),
  auditLogs: (params) => get('/admin/audit-logs', params),
}
