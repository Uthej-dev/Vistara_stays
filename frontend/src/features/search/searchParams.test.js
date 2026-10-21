import { describe, expect, it } from 'vitest'
import { appliedChips, clearFilters, removeChip, toApiParams, toggleListValue, withParam } from './searchParams'

const p = (s) => new URLSearchParams(s)

describe('search URL helpers', () => {
  it('converts URL params to API params, keeping repeated keys as lists', () => {
    expect(toApiParams(p('destination=coorg&amenity=pool&amenity=spa&page=2'))).toEqual({
      destination: 'coorg', amenity: ['pool', 'spa'], page: '2', page_size: 12,
    })
  })

  it('resets to page 1 whenever a filter changes', () => {
    expect(withParam(p('page=3&q=x'), 'min_rating', '4').toString()).toBe('q=x&min_rating=4')
  })

  it('toggles list values on and off', () => {
    const on = toggleListValue(p('amenity=pool'), 'amenity', 'spa')
    expect(on.getAll('amenity')).toEqual(['pool', 'spa'])
    expect(toggleListValue(on, 'amenity', 'pool').getAll('amenity')).toEqual(['spa'])
  })

  it('clears filters but keeps the search itself', () => {
    expect(clearFilters(p('destination=coorg&check_in=2026-12-01&amenity=pool&min_price=1000')).toString()).toBe(
      'destination=coorg&check_in=2026-12-01',
    )
  })

  it('builds removable chips', () => {
    const params = p('amenity=pool&min_rating=4')
    const chips = appliedChips(params, { labelFor: (k, v) => `${k}:${v}` })
    expect(chips.map((c) => c.label)).toEqual(['amenity:pool', 'min_rating:4'])
    expect(removeChip(params, chips[0]).toString()).toBe('min_rating=4')
  })
})
