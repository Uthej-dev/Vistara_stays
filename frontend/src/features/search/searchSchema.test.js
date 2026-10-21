import { describe, expect, it } from 'vitest'
import { defaultSearchValues, searchSchema, toSearchParams } from './searchSchema'
import { addDays, todayIST } from '../../utils/dates'

const today = todayIST()
const valid = (overrides = {}) => ({ ...defaultSearchValues(), ...overrides })
const errorsFor = (values) => {
  const result = searchSchema.safeParse(values)
  return result.success ? {} : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]))
}

describe('searchSchema', () => {
  it('accepts a search with no dates (browse mode)', () => {
    expect(errorsFor(valid({ destination: 'Coorg' }))).toEqual({})
  })

  it('accepts a valid stay', () => {
    expect(errorsFor(valid({ checkIn: addDays(today, 3), checkOut: addDays(today, 5) }))).toEqual({})
  })

  it('rejects a check-in in the past', () => {
    expect(errorsFor(valid({ checkIn: addDays(today, -1), checkOut: addDays(today, 1) })).checkIn).toMatch(/past/)
  })

  it('rejects check-out on or before check-in', () => {
    const d = addDays(today, 3)
    expect(errorsFor(valid({ checkIn: d, checkOut: d })).checkOut).toMatch(/after check-in/)
  })

  it('rejects stays longer than 30 nights', () => {
    expect(errorsFor(valid({ checkIn: addDays(today, 1), checkOut: addDays(today, 32) })).checkOut).toMatch(/30 nights/)
  })

  it('requires both dates when one is given', () => {
    expect(errorsFor(valid({ checkIn: addDays(today, 1) })).checkOut).toMatch(/check-out/)
  })

  it('requires at least one adult per room', () => {
    expect(errorsFor(valid({ rooms: 3, adults: 2 })).adults).toMatch(/at least one adult/)
  })
})

describe('toSearchParams', () => {
  it('maps a known destination name to its slug', () => {
    const params = toSearchParams(valid({ destination: '  munnar ' }))
    expect(params.get('destination')).toBe('munnar')
    expect(params.has('q')).toBe(false)
  })

  it('sends free text as q', () => {
    expect(toSearchParams(valid({ destination: 'tree house' })).get('q')).toBe('tree house')
  })

  it('uses API field names for dates and guests', () => {
    const params = toSearchParams(valid({ checkIn: '2026-12-12', checkOut: '2026-12-14', adults: 3, children: 1 }))
    expect(Object.fromEntries(params)).toEqual({
      check_in: '2026-12-12',
      check_out: '2026-12-14',
      rooms: '1',
      adults: '3',
      children: '1',
    })
  })
})
