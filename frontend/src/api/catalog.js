import { apiClient } from './client'

// Axios serialises arrays as amenity[]=a by default; FastAPI expects amenity=a&amenity=b.
const paramsSerializer = { indexes: null }

export async function getDestinations(params = {}) {
  const { data } = await apiClient.get('/destinations', { params })
  return data
}

export async function getDestination(slug) {
  const { data } = await apiClient.get(`/destinations/${encodeURIComponent(slug)}`)
  return data
}

export async function getCategories(kind) {
  const { data } = await apiClient.get('/categories', { params: kind ? { kind } : {} })
  return data
}

export async function searchResorts(params) {
  const { data } = await apiClient.get('/resorts/search', { params, paramsSerializer })
  return data
}

export async function getFeaturedResorts(limit = 8) {
  const { data } = await apiClient.get('/resorts/featured', { params: { limit } })
  return data
}

export async function getResort(slug) {
  const { data } = await apiClient.get(`/resorts/${encodeURIComponent(slug)}`)
  return data
}
