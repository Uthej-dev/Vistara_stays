import { STATE_NAMES } from './labels'

export { STATE_NAMES }

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** 600000 paise → "₹6,000". Money always travels as integer paise; this is display-only. */
export function formatINR(paise) {
  if (typeof paise !== 'number' || Number.isNaN(paise)) return '—'
  return inrFormatter.format(Math.round(paise / 100))
}

/** "Coorg" + "karnataka" → "Coorg, Karnataka" */
export function formatPlace(name, stateSlug) {
  return stateSlug ? `${name}, ${STATE_NAMES[stateSlug] ?? stateSlug}` : name
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** [10, 11, 12, 1, 2] → "Oct – Feb" (assumes the months are a contiguous season). */
export function formatMonthRange(months) {
  if (!months?.length) return ''
  if (months.length === 1) return MONTHS[months[0] - 1]
  return `${MONTHS[months[0] - 1]} – ${MONTHS[months[months.length - 1] - 1]}`
}

export function monthName(month) {
  return new Date(2000, month - 1, 1).toLocaleString('en-IN', { month: 'long' })
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** ISO timestamp → "17 Oct 2026, 7:30 pm" in IST. */
export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}
