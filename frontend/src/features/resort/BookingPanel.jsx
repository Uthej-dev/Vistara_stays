import { useId } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays, Info } from 'lucide-react'
import GuestSelector from '../search/GuestSelector'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { FormAlert } from '../../components/ui/Form'
import { Skeleton, Spinner } from '../../components/ui/States'
import { useAuth } from '../auth/AuthProvider'
import { hasValidDates, nextDay, stayQuery } from './useStayParams'
import { addDays, todayIST } from '../../utils/dates'
import { formatINR, plural } from '../../utils/format'
import { toApiError } from '../../api/client'

function ChildAges({ ages, onChange }) {
  const id = useId()
  return (
    <fieldset className="mt-3">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-600 uppercase">Children’s ages at check-in</legend>
      <div className="grid grid-cols-3 gap-2">
        {ages.map((age, i) => (
          <div key={i}>
            <label htmlFor={`${id}-${i}`} className="sr-only">
              Age of child {i + 1}
            </label>
            <select
              id={`${id}-${i}`}
              value={age}
              onChange={(e) => onChange(ages.map((a, j) => (j === i ? Number(e.target.value) : a)))}
              className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-2 text-sm"
            >
              {Array.from({ length: 18 }, (_, a) => (
                <option key={a} value={a}>
                  {a === 0 ? 'Under 1' : `${a} yr`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Dates + guests + chosen room → live price from the server → Reserve.
 * Booking itself (holding the room, guest details, payment) happens on the checkout page.
 */
export default function BookingPanel({ resort, stayState, availability }) {
  const { stay, update, error } = stayState
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const today = todayIST()
  const ids = { in: useId(), out: useId(), room: useId() }
  const datesValid = hasValidDates(stay)
  const rooms = availability.data?.room_types ?? []
  const selected = rooms.find((r) => r.room_type_id === stay.roomTypeId) ?? rooms.find((r) => r.bookable)
  const canBook = datesValid && selected?.bookable

  const reserve = () => {
    const target = `/checkout?${stayQuery({ ...stay, roomTypeId: selected.room_type_id })}&resort=${resort.slug}`
    if (status !== 'authenticated') navigate(`/login?next=${encodeURIComponent(target)}`)
    else navigate(target)
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_-12px_rgba(16,32,22,0.25)] ring-1 ring-forest-900/5 sm:p-6">
      <p className="text-ink-900">
        {selected?.price && datesValid ? (
          <>
            <span className="text-2xl font-semibold">{formatINR(selected.price.total_paise)}</span>
            <span className="text-sm text-ink-600"> total · {plural(selected.price.nights_count, 'night')}</span>
          </>
        ) : (
          <>
            <span className="text-xs text-ink-600">from </span>
            <span className="text-2xl font-semibold">{formatINR(resort.starting_price_paise)}</span>
            <span className="text-sm text-ink-600"> / night · excl. taxes</span>
          </>
        )}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={ids.in} className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">
            Check-in
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-forest-700" aria-hidden="true" />
            <input
              id={ids.in}
              type="date"
              min={today}
              value={stay.checkIn}
              onChange={(e) => {
                const checkIn = e.target.value
                update({ checkIn, checkOut: !stay.checkOut || stay.checkOut <= checkIn ? nextDay(checkIn) : stay.checkOut })
              }}
              className="h-11 w-full rounded-xl border border-forest-900/15 bg-white pr-2 pl-8 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor={ids.out} className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">
            Check-out
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-forest-700" aria-hidden="true" />
            <input
              id={ids.out}
              type="date"
              min={stay.checkIn ? addDays(stay.checkIn, 1) : addDays(today, 1)}
              value={stay.checkOut}
              onChange={(e) => update({ checkOut: e.target.value })}
              className="h-11 w-full rounded-xl border border-forest-900/15 bg-white pr-2 pl-8 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <GuestSelector
          value={{ rooms: stay.rooms, adults: stay.adults, children: stay.children }}
          onChange={(next) => update({ ...next, childAges: [...stay.childAges, ...Array(10).fill(8)].slice(0, next.children) })}
        />
        {stay.children > 0 && <ChildAges ages={stay.childAges} onChange={(childAges) => update({ childAges })} />}
      </div>

      {error && <p className="mt-3 text-sm text-clay-600">{error}</p>}

      {datesValid && (
        <div className="mt-4" aria-live="polite" aria-busy={availability.isFetching}>
          {availability.isPending ? (
            <Skeleton className="h-24" />
          ) : availability.error ? (
            <FormAlert>{toApiError(availability.error).message}</FormAlert>
          ) : rooms.length === 0 ? (
            <FormAlert>This property has no rooms open for booking.</FormAlert>
          ) : (
            <>
              <label htmlFor={ids.room} className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">
                Room
              </label>
              <select
                id={ids.room}
                value={selected?.room_type_id ?? ''}
                onChange={(e) => update({ roomTypeId: e.target.value })}
                className="h-11 w-full rounded-xl border border-forest-900/15 bg-white px-3 text-sm"
              >
                {rooms.map((r) => (
                  <option key={r.room_type_id} value={r.room_type_id} disabled={!r.bookable}>
                    {r.name}
                    {r.bookable ? ` — ${formatINR(r.price.total_paise)}` : ` — ${r.unavailable_reason}`}
                  </option>
                ))}
              </select>
              {selected && !selected.bookable && <p className="mt-2 text-sm text-clay-600">{selected.unavailable_reason}</p>}
              {selected?.bookable && selected.available_units <= 2 && (
                <p className="mt-2 text-sm font-medium text-clay-600">Only {plural(selected.available_units, 'room')} left for these dates</p>
              )}
              {selected?.price && <PriceBreakdown price={selected.price} className="mt-4" />}
            </>
          )}
        </div>
      )}

      {user && user.role !== 'customer' ? (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-cream-100 px-3 py-2.5 text-sm text-ink-600">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Bookings are made from customer accounts.
        </p>
      ) : (
        <button
          type="button"
          onClick={reserve}
          disabled={!canBook}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-clay-600 font-semibold text-white transition-colors hover:bg-clay-500 disabled:cursor-not-allowed disabled:bg-forest-900/20 disabled:text-ink-600"
        >
          {availability.isFetching && datesValid && <Spinner />}
          {!datesValid ? 'Choose dates to see prices' : canBook ? 'Reserve' : 'Not available'}
        </button>
      )}
      {canBook && <p className="mt-2 text-center text-xs text-ink-600">You won’t be charged yet. We’ll hold the room while you add guest details.</p>}
    </div>
  )
}
