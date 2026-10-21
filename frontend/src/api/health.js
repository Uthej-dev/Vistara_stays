import { apiClient } from './client'

export async function getReadiness() {
  const { data } = await apiClient.get('/health/ready')
  return data
}
