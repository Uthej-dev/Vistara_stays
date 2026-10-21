import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Lock } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert } from '../../components/ui/Form'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { HoldCountdown, StaySummary } from '../../components/booking/BookingBits'
import { getBooking, getPaymentConfig, simulatePayment } from '../../api/bookings'
import { toApiError } from '../../api/client'
import { useToast } from '../../components/ui/Toast'
import RazorpayButton from '../../features/payments/RazorpayButton'

/** Step 2 of checkout: the room is held; pay before the hold expires. */
export default function PaymentPage() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const booking = useQuery({ queryKey: ['bookings', bookingId], queryFn: () => getBooking(bookingId) })
  const config = useQuery({ queryKey: ['payment-config'], queryFn: getPaymentConfig, staleTime: Infinity })

  useEffect(() => {
    document.title = 'Payment · Vistara Stays'
  }, [])

  useEffect(() => {
    // Already paid (or no longer payable)? Show the booking instead.
    if (booking.data && booking.data.status !== 'pending_payment') navigate(`/trips/${bookingId}`, { replace: true })
  }, [booking.data, bookingId, navigate])

  const finish = (updated) => {
    queryClient.setQueryData(['bookings', bookingId], updated)
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    navigate(`/trips/${bookingId}`, { replace: true })
  }

  const simulate = async (outcome) => {
    setBusy(outcome)
    setError(null)
    try {
      const updated = await simulatePayment(bookingId, outcome)
      if (outcome === 'fail') toast.error('Payment failed (simulated). Your hold has been released.')
      else toast.success('Booking confirmed — simulated payment, no money was charged.')
      finish(updated)
    } catch (e) {
      setError(toApiError(e).message)
      booking.refetch()
    } finally {
      setBusy(null)
    }
  }

  if (booking.error) return <ErrorState className="m-8" error={booking.error} onRetry={booking.refetch} />
  if (booking.isPending || booking.data.status !== 'pending_payment') {
    return (
      <Container className="py-10">
        <Skeleton className="h-64" />
      </Container>
    )
  }
  const b = booking.data
  const expired = new Date(b.hold_expires_at).getTime() <= Date.now()

  return (
    <Container className="max-w-4xl py-10">
      <h1 className="font-display text-4xl text-forest-900">Payment</h1>
      <p className="mt-1 text-ink-600">Booking reference {b.booking_ref}</p>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_340px]">
        <section className="space-y-5 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
          <HoldCountdown expiresAt={b.hold_expires_at} onExpire={() => booking.refetch()} />
          <FormAlert>{error}</FormAlert>

          {config.data?.provider === 'razorpay' ? (
            <RazorpayButton booking={b} keyId={config.data.razorpay_key_id} disabled={expired} onPaid={finish} onError={setError} />
          ) : config.data?.simulated ? (
            <div className="rounded-2xl border-2 border-dashed border-clay-600/40 p-5">
              <p className="flex items-center gap-2 font-semibold text-clay-600">
                <FlaskConical className="size-5" aria-hidden="true" /> Simulated payment (development mode)
              </p>
              <p className="mt-1 text-sm text-ink-600">
                No real payment provider is connected. These buttons mark the booking as paid or failed without charging anything.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={Boolean(busy) || expired}
                  onClick={() => simulate('succeed')}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 font-semibold text-cream-50 hover:bg-forest-700 disabled:opacity-50"
                >
                  {busy === 'succeed' && <Spinner />} Simulate successful payment
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy) || expired}
                  onClick={() => simulate('fail')}
                  className="inline-flex h-11 items-center gap-2 rounded-full px-5 font-medium ring-1 ring-forest-900/15 hover:bg-forest-100 disabled:opacity-50"
                >
                  {busy === 'fail' && <Spinner />} Simulate failed payment
                </button>
              </div>
            </div>
          ) : (
            <Skeleton className="h-28" />
          )}
          <p className="flex items-center gap-2 text-xs text-ink-600">
            <Lock className="size-3.5" aria-hidden="true" /> Card details are handled by the payment provider and never stored by Vistara Stays.
          </p>
        </section>

        <aside className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
          <StaySummary snapshot={b.resort_snapshot} checkIn={b.check_in} checkOut={b.check_out} nights={b.nights} rooms={b.rooms} guests={b.guests} mealPlan={b.price.meal_plan} />
          <PriceBreakdown price={b.price} className="mt-6 border-t border-forest-900/10 pt-5" />
        </aside>
      </div>
    </Container>
  )
}
