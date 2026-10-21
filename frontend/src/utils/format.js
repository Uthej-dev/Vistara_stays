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

export const STATE_NAMES = {
  andhra_pradesh: 'Andhra Pradesh',
  telangana: 'Telangana',
  karnataka: 'Karnataka',
  kerala: 'Kerala',
  tamil_nadu: 'Tamil Nadu',
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
