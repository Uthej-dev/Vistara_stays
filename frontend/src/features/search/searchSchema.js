import { z } from 'zod'
import { addDays, isISODate, nightsBetween, todayIST } from '../../utils/dates'

export const LIMITS = {
  rooms: { min: 1, max: 5 },
  adults: { min: 1, max: 20 },
  children: { min: 0, max: 10 },
  maxNights: 30,
}

const optionalDate = z.string().refine((v) => v === '' || isISODate(v), 'Enter a valid date')

/**
 * Mirrors the backend's validation (docs/06-booking-engine.md §9) so users get instant feedback.
 * The backend re-validates everything — this is for user experience, not security.
 */
export const searchSchema = z
  .object({
    destination: z.string().trim().max(80, 'Keep it under 80 characters'),
    checkIn: optionalDate,
    checkOut: optionalDate,
    rooms: z.number().int().min(LIMITS.rooms.min).max(LIMITS.rooms.max),
    adults: z.number().int().min(LIMITS.adults.min).max(LIMITS.adults.max),
    children: z.number().int().min(LIMITS.children.min).max(LIMITS.children.max),
  })
  .superRefine((v, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })

    if (v.checkIn && !v.checkOut) issue('checkOut', 'Choose a check-out date')
    if (v.checkOut && !v.checkIn) issue('checkIn', 'Choose a check-in date')
    if (v.checkIn && v.checkIn < todayIST()) issue('checkIn', 'Check-in can’t be in the past')
    if (v.checkIn && v.checkOut) {
      const nights = nightsBetween(v.checkIn, v.checkOut)
      if (nights < 1) issue('checkOut', 'Check-out must be after check-in')
      else if (nights > LIMITS.maxNights) issue('checkOut', `Stays can be up to ${LIMITS.maxNights} nights`)
    }
    if (v.adults < v.rooms) issue('adults', 'Each room needs at least one adult')
  })

export const defaultSearchValues = () => ({
  destination: '',
  checkIn: '',
  checkOut: '',
  rooms: 1,
  adults: 2,
  children: 0,
})

/**
 * Form values → URL query string for /search. Field names match the API (snake_case).
 * A destination typed exactly as a known name becomes `destination=<slug>`; other text is `q`.
 */
export function toSearchParams(values, destinations = []) {
  const params = new URLSearchParams()
  const text = values.destination.trim()
  const match = destinations.find((d) => d.name.toLowerCase() === text.toLowerCase())
  if (match) params.set('destination', match.slug)
  else if (text) params.set('q', text)
  if (values.checkIn && values.checkOut) {
    params.set('check_in', values.checkIn)
    params.set('check_out', values.checkOut)
  }
  params.set('rooms', String(values.rooms))
  params.set('adults', String(values.adults))
  params.set('children', String(values.children))
  return params
}

/** Suggest a check-out the day after check-in when the user hasn't picked one. */
export function suggestedCheckOut(checkIn) {
  return isISODate(checkIn) ? addDays(checkIn, 1) : ''
}

/** URL search params → form values (inverse of toSearchParams). */
export function fromSearchParams(params, destinations = []) {
  const slug = params.get('destination')
  const name = destinations.find((d) => d.slug === slug)?.name
  const int = (key, fallback) => {
    const n = Number.parseInt(params.get(key) ?? '', 10)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    destination: name ?? params.get('q') ?? '',
    checkIn: params.get('check_in') ?? '',
    checkOut: params.get('check_out') ?? '',
    rooms: int('rooms', 1),
    adults: int('adults', 2),
    children: int('children', 0),
  }
}
