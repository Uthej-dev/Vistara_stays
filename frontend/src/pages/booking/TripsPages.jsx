import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarX, FlaskConical, Luggage, MapPin, Phone, Star } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert } from '../../components/ui/Form'
import Pagination from '../../components/ui/Pagination'
import Button from '../../components/ui/Button'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { HoldCountdown, StatusBadge, StaySummary } from '../../components/booking/BookingBits'
import { cancelBooking, getBooking, getBookings } from '../../api/bookings'
import { toApiError } from '../../api/client'
import { useToast } from '../../components/ui/Toast'
import ReviewForm from '../../features/reviews/ReviewForm'
import { formatDate } from '../../utils/dates'
import { formatDateTime, formatINR } from '../../utils/format'
import { cn } from '../../utils/cn'

const TABS = [
  ['upcoming', 'Upcoming'],
  ['past', 'Past'],
  ['cancelled', 'Cancelled'],
]

export function TripsPage() {
  const [params, setParams] = useSearchParams()
  const scope = params.get('tab') ?? 'upcoming'
  const page = Number(params.get('page') ?? 1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['bookings', 'list', scope, page], queryFn: () => getBookings(scope, page) })

  useEffect(() => {
    document.title = 'Your trips · Vistara Stays'
  }, [])

  return (
    <Container className="py-12">
      <h1 className="font-display text-4xl text-forest-900">Your trips</h1>
      <div role="tablist" aria-label="Trips" className="mt-6 flex gap-2">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={scope === value}
            onClick={() => setParams({ tab: value })}
            className={cn('rounded-full px-4 py-2 text-sm font-medium', scope === value ? 'bg-forest-800 text-cream-50' : 'bg-white ring-1 ring-forest-900/10 hover:bg-forest-100')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8" role="tabpanel">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Luggage} title={scope === 'upcoming' ? 'No upcoming trips' : scope === 'past' ? 'No past stays yet' : 'No cancelled bookings'} action={scope === 'upcoming' && <Button to="/search">Find a stay</Button>}>
            {scope === 'upcoming' ? 'When you book a stay it will appear here.' : null}
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-4">
              {data.items.map((b) => (
                <li key={b.id}>
                  <Link to={`/trips/${b.id}`} className="block rounded-3xl bg-white p-5 ring-1 ring-forest-900/5 transition-shadow hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <StaySummary snapshot={b.resort_snapshot} checkIn={b.check_in} checkOut={b.check_out} nights={b.nights} rooms={b.rooms} guests={b.guests} />
                      <div className="text-right">
                        <StatusBadge status={b.status} />
                        <p className="mt-2 font-semibold">{formatINR(b.price.total_paise)}</p>
                        <p className="text-xs text-ink-600">{b.booking_ref}</p>
                        {b.can_review && <p className="mt-2 text-xs font-semibold text-clay-600">Write a review →</p>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination className="mt-8" page={data.page} totalPages={data.total_pages} onChange={(p) => setParams({ tab: scope, page: p })} />
          </>
        )}
      </div>
    </Container>
  )
}

function CancelPanel({ booking, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const preview = booking.cancellation_preview
  if (!preview) return null
  if (!preview.eligible) {
    return <p className="text-sm text-ink-600">Online cancellation has closed for this stay. Please contact the property.</p>
  }
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      onDone(await cancelBooking(booking.id, reason))
    } catch (e) {
      setError(toApiError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rounded-2xl bg-cream-100 p-5">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-clay-600 hover:underline">
          <CalendarX className="size-4" aria-hidden="true" /> Cancel this booking
        </button>
      ) : (
        <div className="space-y-3">
          <p className="font-semibold text-forest-900">Cancel this booking?</p>
          <p className="text-sm text-ink-900">
            {booking.payment_status === 'paid' ? (
              <>
                You’ll get <strong>{formatINR(preview.refund_paise)}</strong> back ({preview.refund_pct}% under the policy saved with your booking
                {preview.refund_pct < 100 && booking.status === 'confirmed' ? '; the service fee is non-refundable' : ''}).
              </>
            ) : (
              'You haven’t paid yet, so nothing will be charged.'
            )}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-600">Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-3" />
          </label>
          <FormAlert>{error}</FormAlert>
          <div className="flex gap-3">
            <button type="button" onClick={submit} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-clay-600 px-5 text-sm font-semibold text-white disabled:opacity-60">
              {busy && <Spinner />} Yes, cancel
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15">
              Keep booking
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const REFUND_TEXT = {
  simulated_refund: 'Simulated refund — no real money was involved.',
  pending: 'Refund requested from the payment provider. It will show as refunded once they confirm it.',
  not_applicable: 'No refund due.',
}

export function TripPage() {
  const { bookingId } = useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: b, isPending, error, refetch } = useQuery({ queryKey: ['bookings', bookingId], queryFn: () => getBooking(bookingId) })

  useEffect(() => {
    if (b) document.title = `Booking ${b.booking_ref} · Vistara Stays`
  }, [b])

  if (error) return <ErrorState className="m-8" error={error} onRetry={refetch} />
  if (isPending) {
    return (
      <Container className="py-10">
        <Skeleton className="h-72" />
      </Container>
    )
  }

  const onCancelled = (updated) => {
    queryClient.setQueryData(['bookings', bookingId], updated)
    queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] })
    toast.success('Your booking has been cancelled.')
  }
  const snap = b.resort_snapshot

  return (
    <Container className="max-w-5xl py-10">
      <Link to="/trips" className="text-sm font-medium text-forest-700 hover:underline">
        ← All trips
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl text-forest-900">Booking {b.booking_ref}</h1>
        <StatusBadge status={b.status} />
      </div>
      <p className="mt-1 text-sm text-ink-600">Booked {formatDateTime(b.created_at)}</p>

      {b.status === 'pending_payment' && (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-clay-600/20">
          <HoldCountdown expiresAt={b.hold_expires_at} onExpire={refetch} />
          <Button to={`/checkout/${b.id}`} variant="accent">
            Complete payment
          </Button>
        </div>
      )}
      {b.status === 'pending_owner' && <FormAlert tone="success">Paid. The property confirms requests within 24 hours — if they can’t, you’ll get a full refund.</FormAlert>}
      {b.payment?.simulated && (
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-clay-600/10 px-3 py-1 text-xs font-semibold text-clay-600">
          <FlaskConical className="size-3.5" aria-hidden="true" /> Simulated payment — no money was charged
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <StaySummary snapshot={snap} checkIn={b.check_in} checkOut={b.check_out} nights={b.nights} rooms={b.rooms} guests={b.guests} mealPlan={b.policy_snapshot.meal_plan} />
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-600">Check-in</dt>
                <dd className="font-medium">
                  {formatDate(b.check_in)} from {b.policy_snapshot.check_in_time}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600">Check-out</dt>
                <dd className="font-medium">
                  {formatDate(b.check_out)} by {b.policy_snapshot.check_out_time}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600">Lead guest</dt>
                <dd className="font-medium">{b.guest_details.name}</dd>
              </div>
              <div>
                <dt className="text-ink-600">Contact</dt>
                <dd className="font-medium">
                  {b.guest_details.email} · {b.guest_details.phone}
                </dd>
              </div>
              {b.special_requests && (
                <div className="sm:col-span-2">
                  <dt className="text-ink-600">Special requests</dt>
                  <dd>{b.special_requests}</dd>
                </div>
              )}
            </dl>
            {snap.address && (
              <div className="mt-6 rounded-2xl bg-cream-100 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-forest-900">
                  <MapPin className="size-4" aria-hidden="true" /> Property address
                </p>
                <p className="mt-1">{[snap.address.line1, snap.address.town, snap.address.district].filter(Boolean).join(', ')}</p>
                {snap.contact?.phone && (
                  <p className="mt-1 flex items-center gap-2">
                    <Phone className="size-4" aria-hidden="true" /> {snap.contact.phone}
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-600">Bring a valid photo ID for every adult.</p>
              </div>
            )}
          </section>

          {b.cancellation && (
            <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
              <h2 className="font-display text-2xl text-forest-900">Cancellation</h2>
              <p className="mt-2 text-sm">
                Cancelled {formatDateTime(b.cancellation.cancelled_at)} by {b.cancellation.by === 'customer' ? 'you' : b.cancellation.by === 'owner' ? 'the property' : b.cancellation.by}.
                {b.cancellation.reason ? ` Reason: ${b.cancellation.reason}` : ''}
              </p>
              <p className="mt-2 text-sm">
                Refund: <strong>{formatINR(b.cancellation.refund_paise)}</strong> ({b.cancellation.refund_pct}%). {REFUND_TEXT[b.cancellation.refund_status]}
              </p>
            </section>
          )}

          {b.can_review && (
            <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
              <h2 className="flex items-center gap-2 font-display text-2xl text-forest-900">
                <Star className="size-5 text-clay-600" aria-hidden="true" /> How was your stay?
              </h2>
              <ReviewForm bookingId={b.id} onDone={refetch} />
            </section>
          )}

          <CancelPanel booking={b} onDone={onCancelled} />
        </div>

        <aside className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5 lg:self-start">
          <h2 className="font-display text-xl text-forest-900">Price</h2>
          <PriceBreakdown price={b.price} className="mt-4" />
          <div className="mt-6 border-t border-forest-900/10 pt-4 text-sm">
            <h3 className="font-semibold text-forest-900">Cancellation policy (saved with this booking)</h3>
            <ul className="mt-2 space-y-1 text-ink-600">
              {b.policy_snapshot.cancellation_policy.tiers.map((t) => (
                <li key={t.days_before_check_in}>
                  {t.days_before_check_in > 0 ? `${t.days_before_check_in}+ days before` : 'After that'}: {t.refund_pct}% refund
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </Container>
  )
}
