import { apiClient } from './client'

const paramsSerializer = { indexes: null }

export async function getAvailability(resortId, params) {
  const { data } = await apiClient.get(`/resorts/${resortId}/availability`, { params, paramsSerializer })
  return data
}

export async function getQuote(body) {
  const { data } = await apiClient.post('/bookings/quote', body)
  return data
}

export async function sendEnquiry(resortId, body) {
  const { data } = await apiClient.post(`/resorts/${resortId}/enquiries`, body)
  return data
}
