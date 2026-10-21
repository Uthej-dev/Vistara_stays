import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import { ErrorState, Skeleton } from '../../components/ui/States'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { StaySummary } from '../../components/booking/BookingBits'
import { useAuth } from '../../features/auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import { getQuote } from '../../api/stays'
import { createBooking } from '../../api/bookings'
import { resendVerification } from '../../api/auth'
import { fieldErrors, toApiError } from '../../api/client'
import { useResort } from '../../features/catalog/queries'

const NATIONALITIES = [
  ['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AE', 'United Arab Emirates'], ['SG', 'Singapore'],
  ['AU', 'Australia'], ['CA', 'Canada'], ['DE', 'Germany'], ['FR', 'France'], ['MY', 'Malaysia'], ['LK', 'Sri Lanka'], ['NP', 'Nepal'],
]

const guestSchema = z.object({
  name: z.string().trim().min(2, 'Enter the lead guest’s full name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210'),
  age: z.coerce.number({ message: 'Enter an age' }).int().min(18, 'The lead guest must be 18 or older').max(120, 'Enter a valid age'),
  nationality: z.string().regex(/^[A-Z]{2}$/),
  arrival_time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  special_requests: z.string().trim().max(500).optional(),
  accept: z.literal(true, { message: 'Please accept the cancellation policy' }),
})

function readStay(params) {
  const int = (k, d) => Number.parseInt(params.get(k) ?? '', 10) || d
  const children = int('children', 0)
  return {
    room_type_id: params.get('room') ?? '',
    check_in: params.get('check_in') ?? '',
    check_out: params.get('check_out') ?? '',
    rooms: int('rooms', 1),
    adults: int('adults', 2),
    children,
    child_ages: params.getAll('child_age').map((a) => Number(a)).slice(0, children),
  }
}

export default function CheckoutPage() {
  const [params] = useSearchParams()
  const stay = useMemo(() => readStay(params), [params])
  const resortSlug = params.get('resort')
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [coupon, setCoupon] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [serverError, setServerError] = useState(null)
  // One key per checkout attempt: double-clicks and retries reuse it, so only one booking exists.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const quote = useQuery({
    queryKey: ['quote', stay, appliedCoupon],
    queryFn: () => getQuote({ ...stay, coupon_code: appliedCoupon }),
    enabled: Boolean(stay.room_type_id && stay.check_in && stay.check_out),
    retry: false,
  })
  const resort = useResort(resortSlug)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(guestSchema),
    defaultValues: { name: user.name, email: user.email, phone: user.phone ?? '', nationality: 'IN', age: '', arrival_time: '', special_requests: '' },
  })

  useEffect(() => {
    document.title = 'Checkout · Vistara Stays'
  }, [])

  // Validate a coupon with the server before using it; show the reason if it's rejected.
  const applyCoupon = async (code) => {
    try {
      await getQuote({ ...stay, coupon_code: code })
      setAppliedCoupon(code)
    } catch (error) {
      toast.error(toApiError(error).message)
    }
  }

  const onSubmit = async ({ accept: _accept, special_requests, arrival_time, ...guest }) => {
    setServerError(null)
    try {
      const booking = await createBooking(
        {
          ...stay,
          coupon_code: appliedCoupon,
          guest_details: { ...guest, ...(arrival_time ? { arrival_time } : {}) },
          special_requests: special_requests || null,
        },
        idempotencyKey,
      )
      navigate(`/checkout/${booking.id}`, { replace: true })
    } catch (error) {
      const byField = fieldErrors(error)
      Object.entries(byField).forEach(([name, message]) => setError(name, { message }))
      if (!Object.keys(byField).length) setServerError(toApiError(error).message)
      if (error?.response?.status === 409) setIdempotencyKey(crypto.randomUUID())
    }
  }

  if (!stay.room_type_id || !stay.check_in) {
    return <ErrorState className="m-8" error={{ message: 'No stay selected.' }} title="Nothing to check out" />
  }

  const price = quote.data?.price
  const snapshot = resort.data
    ? { name: resort.data.name, cover: resort.data.images[0], room_type_name: resort.data.room_types.find((r) => r.id === stay.room_type_id)?.name, is_sample: resort.data.is_sample }
    : null

  return (
    <Container className="py-10">
      {resortSlug && (
        <Link to={`/resorts/${resortSlug}?${params.toString()}`} className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to the property
        </Link>
      )}
      <h1 className="mt-3 font-display text-4xl text-forest-900">Confirm your stay</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
          {!user.email_verified && (
            <FormAlert>
              Please verify your email before booking — we send your confirmation there.{' '}
              <button type="button" className="font-semibold underline" onClick={() => resendVerification().then(() => toast.success('Verification email sent.'))}>
                Resend verification email
              </button>
            </FormAlert>
          )}
          <FormAlert>{serverError}</FormAlert>

          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-2xl text-forest-900">Lead guest</h2>
            <p className="mt-1 text-sm text-ink-600">The person checking in. They must be 18 or older and show a photo ID at the property.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField label="Full name (as on ID)" autoComplete="name" error={errors.name?.message} {...register('name')} />
              <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
              <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="+919876543210" error={errors.phone?.message} {...register('phone')} />
              <TextField label="Age" type="number" inputMode="numeric" min="18" error={errors.age?.message} {...register('age')} />
              <TextField as="select" label="Nationality" error={errors.nationality?.message} {...register('nationality')}>
                {NATIONALITIES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </TextField>
              <TextField label="Estimated arrival time (optional)" type="time" error={errors.arrival_time?.message} {...register('arrival_time')} />
              <TextField
                as="textarea"
                className="sm:col-span-2"
                label="Special requests (optional)"
                hint="Not guaranteed — the property will try to help."
                error={errors.special_requests?.message}
                {...register('special_requests')}
              />
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-ink-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
              We never ask for ID numbers online. Your details are shared only with this property to prepare your stay.
            </p>
          </section>

          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-2xl text-forest-900">Cancellation policy</h2>
            {resort.data ? (
              <ul className="mt-3 space-y-1 text-sm text-ink-900">
                {resort.data.policies.cancellation_policy.tiers.map((t) => (
                  <li key={t.days_before_check_in}>
                    {t.days_before_check_in > 0 ? `${t.days_before_check_in}+ days before check-in` : 'After that'}: <strong>{t.refund_pct}% refund</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton className="mt-3 h-16" />
            )}
            <p className="mt-2 text-xs text-ink-600">Refunds exclude the platform service fee. The policy above is saved with your booking.</p>
            <label className="mt-4 flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-forest-800" aria-invalid={Boolean(errors.accept)} {...register('accept')} />
              I’ve read the cancellation policy and the property’s house rules.
            </label>
            {errors.accept && <p className="mt-1 text-xs text-clay-600">{errors.accept.message}</p>}
          </section>

          <SubmitButton loading={isSubmitting} disabled={!user.email_verified || !quote.data?.available || isSubmitting} className="w-full sm:w-auto">
            Hold room & continue to payment
          </SubmitButton>
          {quote.data && !quote.data.available && <p className="text-sm text-clay-600">This room is no longer available for these dates.</p>}
        </form>

        <aside aria-label="Price summary" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            {snapshot ? (
              <StaySummary
                snapshot={snapshot}
                checkIn={stay.check_in}
                checkOut={stay.check_out}
                nights={price?.nights_count ?? 0}
                rooms={stay.rooms}
                guests={stay}
                mealPlan={price?.meal_plan}
              />
            ) : (
              <Skeleton className="h-24" />
            )}
            <div className="mt-6 border-t border-forest-900/10 pt-5">
              {quote.isPending ? <Skeleton className="h-40" /> : quote.error ? <FormAlert>{toApiError(quote.error).message}</FormAlert> : <PriceBreakdown price={price} />}
            </div>
            <form
              className="mt-5 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (coupon.trim()) applyCoupon(coupon.trim().toUpperCase())
              }}
            >
              <label htmlFor="coupon" className="sr-only">
                Coupon code
              </label>
              <input id="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code" className="h-10 flex-1 rounded-lg border border-forest-900/15 bg-white px-3 text-sm uppercase" />
              <button type="submit" className="h-10 rounded-lg px-4 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100">
                Apply
              </button>
            </form>
            {appliedCoupon && price?.coupon_code && (
              <p className="mt-2 text-xs text-forest-700">
                Coupon {price.coupon_code} applied.{' '}
                <button type="button" className="underline" onClick={() => setAppliedCoupon(null)}>
                  Remove
                </button>
              </p>
            )}
          </div>
        </aside>
      </div>
    </Container>
  )
}
