import { apiClient } from './client'

export const getResortReviews = (resortId, { sort = 'recent', page = 1 } = {}) =>
  apiClient.get(`/resorts/${resortId}/reviews`, { params: { sort, page, page_size: 5 } }).then((r) => r.data)
export const getRecentReviews = (limit = 3) => apiClient.get('/reviews/recent', { params: { limit } }).then((r) => r.data)
export const createReview = (body) => apiClient.post('/reviews', body).then((r) => r.data)
export const reportReview = (id, reason, note) => apiClient.post(`/reviews/${id}/report`, { reason, note: note || null })
export const getOwnerReviews = (page = 1) => apiClient.get('/owner/reviews', { params: { page } }).then((r) => r.data)
export const replyToReview = (id, body) => apiClient.put(`/owner/reviews/${id}/reply`, { body }).then((r) => r.data)
