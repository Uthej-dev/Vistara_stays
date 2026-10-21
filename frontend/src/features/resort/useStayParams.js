import { useSearchParams } from 'react-router'
import { addDays, isISODate, nightsBetween, todayIST } from '../../utils/dates'

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

/** Stay selection (dates, guests, chosen room) kept in the URL so it's shareable. */
export function useStayParams() {
  const [params, setParams] = useSearchParams()
  const children = int(params.get('children'), 0)
  const childAges = params.getAll('child_age').map((a) => int(a, 8)).slice(0, children)
  while (childAges.length < children) childAges.push(8) // sensible default, user can change

  const stay = {
    checkIn: params.get('check_in') ?? '',
    checkOut: params.get('check_out') ?? '',
    rooms: int(params.get('rooms'), 1),
    adults: int(params.get('adults'), 2),
    children,
    childAges,
    roomTypeId: params.get('room') ?? '',
  }

  const update = (changes) => {
    const next = { ...stay, ...changes }
    const out = new URLSearchParams()
    if (next.checkIn) out.set('check_in', next.checkIn)
    if (next.checkOut) out.set('check_out', next.checkOut)
    out.set('rooms', next.rooms)
    out.set('adults', next.adults)
    out.set('children', next.children)
    next.childAges.slice(0, next.children).forEach((a) => out.append('child_age', a))
    if (next.roomTypeId) out.set('room', next.roomTypeId)
    setParams(out, { replace: true, preventScrollReset: true })
  }

  return { stay, update, error: stayError(stay) }
}

export function stayError({ checkIn, checkOut, adults, rooms }) {
  if (!checkIn && !checkOut) return null
  if (!isISODate(checkIn) || !isISODate(checkOut)) return 'Choose both dates'
  if (checkIn < todayIST()) return 'Check-in can’t be in the past'
  const nights = nightsBetween(checkIn, checkOut)
  if (nights < 1) return 'Check-out must be after check-in'
  if (nights > 30) return 'Stays can be up to 30 nights'
  if (adults < rooms) return 'Each room needs at least one adult'
  return null
}

export function hasValidDates(stay) {
  return Boolean(stay.checkIn && stay.checkOut) && !stayError(stay)
}

/** Default check-out: the day after check-in. */
export function nextDay(checkIn) {
  return isISODate(checkIn) ? addDays(checkIn, 1) : ''
}

export function stayQuery(stay) {
  return new URLSearchParams([
    ['check_in', stay.checkIn],
    ['check_out', stay.checkOut],
    ['rooms', stay.rooms],
    ['adults', stay.adults],
    ['children', stay.children],
    ...stay.childAges.map((a) => ['child_age', a]),
    ...(stay.roomTypeId ? [['room', stay.roomTypeId]] : []),
  ]).toString()
}
