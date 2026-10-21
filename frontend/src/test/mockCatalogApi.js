import { vi } from 'vitest'
import { CATEGORIES, DESTINATIONS, RESORT_CARD, searchResponse } from './fixtures'

// Drop-in replacement for src/api/catalog.js. Tests can override any function with
// vi.mocked(fn).mockResolvedValueOnce(...).
export const getDestinations = vi.fn(async () => DESTINATIONS)
export const getDestination = vi.fn(async (slug) => DESTINATIONS.find((d) => d.slug === slug))
export const getCategories = vi.fn(async (kind) => (kind ? CATEGORIES.filter((c) => c.kind === kind) : CATEGORIES))
export const searchResorts = vi.fn(async () => searchResponse())
export const getFeaturedResorts = vi.fn(async () => [RESORT_CARD])
export const getResort = vi.fn()
