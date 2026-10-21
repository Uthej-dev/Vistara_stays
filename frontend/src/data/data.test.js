import { describe, expect, it } from 'vitest'
import { DESTINATIONS, DESTINATIONS_BY_SLUG, STATE_ORDER } from './destinations'
import { SAMPLE_RESORTS } from './sampleResorts'
import { AMENITIES, CATEGORIES, COLLECTIONS, SAMPLE_REVIEWS } from './catalog'

// Guards the data files against typos that would otherwise show up as broken UI.
describe('landing page data', () => {
  it('covers every required destination across all five states', () => {
    expect(DESTINATIONS).toHaveLength(25)
    for (const state of STATE_ORDER) {
      expect(DESTINATIONS.some((d) => d.state === state)).toBe(true)
    }
  })

  it('gives every destination a photo with full attribution', () => {
    for (const d of DESTINATIONS) {
      expect(d.image?.src, d.slug).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\/[^?]+$/)
      expect(d.image.alt, d.slug).toBeTruthy()
      expect(d.image.credit.author, d.slug).toBeTruthy()
      expect(d.image.credit.license, d.slug).toBeTruthy()
      expect(d.image.credit.sourceUrl, d.slug).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
    }
  })

  it('marks every resort as a fictional sample with a valid destination and amenities', () => {
    for (const r of SAMPLE_RESORTS) {
      expect(r.isSample).toBe(true)
      expect(DESTINATIONS_BY_SLUG[r.destination.slug]).toBeDefined()
      expect(Number.isInteger(r.startingPricePaise)).toBe(true)
      for (const a of r.amenities) expect(AMENITIES[a], a).toBeDefined()
    }
  })

  it('only references destinations that exist', () => {
    for (const c of COLLECTIONS) {
      for (const slug of c.destinations) expect(DESTINATIONS_BY_SLUG[slug], slug).toBeDefined()
    }
    for (const c of CATEGORIES) expect(c.image?.src, c.slug).toBeTruthy()
  })

  it('labels sample reviews as samples', () => {
    for (const r of SAMPLE_REVIEWS) expect(r.author).toMatch(/^Sample guest/)
  })
})
