/**
 * The search page keeps ALL of its state in the URL (?destination=coorg&amenity=pool&page=2),
 * so results are shareable, bookmarkable and work with the back button.
 */

export const LIST_KEYS = ['property_type', 'category', 'amenity', 'surrounding']
export const SCALAR_FILTER_KEYS = ['state', 'min_price', 'max_price', 'min_rating', 'max_distance_km', 'available_only', 'price_basis']
const BASE_KEYS = ['q', 'destination', 'check_in', 'check_out', 'adults', 'children', 'rooms']

/** URLSearchParams → params object for GET /resorts/search. */
export function toApiParams(searchParams) {
  const params = {}
  for (const key of [...BASE_KEYS, ...SCALAR_FILTER_KEYS, 'sort', 'page']) {
    const value = searchParams.get(key)
    if (value !== null && value !== '') params[key] = value
  }
  for (const key of LIST_KEYS) {
    const values = searchParams.getAll(key)
    if (values.length) params[key] = values
  }
  params.page_size = 12
  return params
}

/** Return new params with `key` set (or removed when value is empty). Resets to page 1. */
export function withParam(searchParams, key, value) {
  const next = new URLSearchParams(searchParams)
  next.delete(key)
  const values = Array.isArray(value) ? value : [value]
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '' && v !== false) next.append(key, String(v))
  }
  if (key !== 'page') next.delete('page')
  return next
}

export function toggleListValue(searchParams, key, value) {
  const current = searchParams.getAll(key)
  const nextValues = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return withParam(searchParams, key, nextValues)
}

export function clearFilters(searchParams) {
  const next = new URLSearchParams(searchParams)
  for (const key of [...LIST_KEYS, ...SCALAR_FILTER_KEYS, 'page']) next.delete(key)
  return next
}

/** Filters that are switched on, as removable chips. */
export function appliedChips(searchParams, { labelFor }) {
  const chips = []
  for (const key of LIST_KEYS) {
    for (const value of searchParams.getAll(key)) chips.push({ key, value, label: labelFor(key, value) })
  }
  for (const key of SCALAR_FILTER_KEYS) {
    const value = searchParams.get(key)
    if (value) chips.push({ key, value, label: labelFor(key, value) })
  }
  return chips
}

export function removeChip(searchParams, chip) {
  if (LIST_KEYS.includes(chip.key)) return toggleListValue(searchParams, chip.key, chip.value)
  return withParam(searchParams, chip.key, null)
}

/** Params that should survive a new search from the widget (the filters, not the dates). */
export function filterEntries(searchParams) {
  return [...searchParams.entries()].filter(([key]) => [...LIST_KEYS, ...SCALAR_FILTER_KEYS, 'sort'].includes(key))
}
