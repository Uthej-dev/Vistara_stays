import { keepPreviousData, useQuery } from '@tanstack/react-query'
import * as api from '../../api/catalog'

// Reference data changes rarely, so cache it for 10 minutes.
const REFERENCE = { staleTime: 10 * 60_000 }

export const catalogKeys = {
  destinations: (params = {}) => ['destinations', params],
  destination: (slug) => ['destination', slug],
  categories: (kind) => ['categories', kind ?? 'all'],
  search: (params) => ['resorts', 'search', params],
  featured: () => ['resorts', 'featured'],
  resort: (slug) => ['resort', slug],
}

export function useDestinations(params = {}) {
  return useQuery({ queryKey: catalogKeys.destinations(params), queryFn: () => api.getDestinations(params), ...REFERENCE })
}

/** { slug: destination } built from the full destination list. */
export function useDestinationMap() {
  const query = useDestinations()
  const map = query.data ? Object.fromEntries(query.data.map((d) => [d.slug, d])) : {}
  return { ...query, map }
}

export function useDestination(slug) {
  return useQuery({ queryKey: catalogKeys.destination(slug), queryFn: () => api.getDestination(slug), ...REFERENCE })
}

export function useCategories(kind) {
  return useQuery({ queryKey: catalogKeys.categories(kind), queryFn: () => api.getCategories(kind), ...REFERENCE })
}

export function useFeaturedResorts() {
  return useQuery({ queryKey: catalogKeys.featured(), queryFn: () => api.getFeaturedResorts(8) })
}

export function useResortSearch(params) {
  return useQuery({
    queryKey: catalogKeys.search(params),
    queryFn: () => api.searchResorts(params),
    placeholderData: keepPreviousData, // keep showing old results while new ones load
  })
}

export function useResort(slug) {
  return useQuery({ queryKey: catalogKeys.resort(slug), queryFn: () => api.getResort(slug) })
}
