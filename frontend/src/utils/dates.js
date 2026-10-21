/**
 * Date helpers for stay dates. Stay dates are plain "YYYY-MM-DD" strings (no time, no timezone),
 * matching the backend. "Today" is computed in India Standard Time, because a guest in another
 * timezone must not be able to book a night that has already started in India.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function todayIST(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}

export function currentMonthIST(now = new Date()) {
  return Number(todayIST(now).slice(5, 7))
}

export function isISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Check-out is exclusive: 12 Dec → 14 Dec is 2 nights. */
export function nightsBetween(checkIn, checkOut) {
  const ms = new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** "2026-12-12" → "12 Dec 2026" */
export function formatDate(isoDate, { withYear = true } = {}) {
  if (!isISODate(isoDate)) return ''
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withYear && { year: 'numeric' }),
    timeZone: 'UTC',
  })
}
