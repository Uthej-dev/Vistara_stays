import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Info, ShieldCheck } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { FormAlert, PasswordField, SubmitButton, TextField } from '../../components/ui/Form'
import { ErrorState, Skeleton } from '../../components/ui/States'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { StaySummary } from '../../components/booking/BookingBits'
import { useAuth } from '../../features/auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import { getQuote } from '../../api/stays'
import { createBooking } from '../../api/bookings'
import { checkoutSignup } from '../../api/auth'
import { fieldErrors, toApiError } from '../../api/client'
import { useResort } from '../../features/catalog/queries'

const guestSchema = z.object({
  first_name: z.string().trim().min(1, 'Enter your first name').max(50),
  last_name: z.string().trim().min(1, 'Enter your last name').max(50),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210'),
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

/** Split a stored full name into first/last for prefilling. */
function nameParts(user) {
  if (!user) return { first_name: '', last_name: '' }
  if (user.first_name || user.last_name) return { first_name: user.first_name ?? '', last_name: user.last_name ?? '' }
  const parts = (user.name ?? '').trim().split(/\s+/)
  return { first_name: parts[0] ?? '', last_name: parts.slice(1).join(' ') }
}

/**
 * Checkout. No login needed first: a guest enters first name, last name, email and mobile, and
 * we create their account and sign them in as part of holding the room. If the email already
 * has an account, they enter their password right here instead.
 */
export default function CheckoutPage() {
  const [params] = useSearchParams()
  const stay = useMemo(() => readStay(params), [params])
  const resortSlug = params.get('resort')
  const { user, status, login, applySession } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [coupon, setCoupon] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [serverError, setServerError] = useState(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
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
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(guestSchema),
    defaultValues: { ...nameParts(user), email: user?.email ?? '', phone: user?.phone ?? '', special_requests: '' },
  })

  useEffect(() => {
    document.title = 'Checkout · Vistara Stays'
  }, [])

  // When the session finishes loading (or the guest logs in here), prefill from their account.
  const [prefilledFor, setPrefilledFor] = useState(user?.id ?? null)
  if (user && prefilledFor !== user.id) {
    setPrefilledFor(user.id)
    const current = getValues()
    reset({ ...current, ...nameParts(user), email: user.email, phone: current.phone || user.phone || '' })
  }

  // Validate a coupon with the server before using it; show the reason if it's rejected.
  const applyCoupon = async (code) => {
    try {
      await getQuote({ ...stay, coupon_code: code })
      setAppliedCoupon(code)
    } catch (error) {
      toast.error(toApiError(error).message)
    }
  }

  /** Make sure there's a signed-in customer: existing session, password login, or new account. */
  const ensureSignedIn = async (guest) => {
    if (status === 'authenticated') return true
    if (needsPassword) {
      await login({ email: guest.email, password })
      return true
    }
    try {
      applySession(await checkoutSignup(guest))
      return true
    } catch (error) {
      if (error?.response?.data?.error?.code === 'ACCOUNT_EXISTS') {
        setNeedsPassword(true)
        setServerError(null)
        return false
      }
      throw error
    }
  }

  const onSubmit = async ({ accept: _accept, special_requests, ...guest }) => {
    setServerError(null)
    try {
      if (!(await ensureSignedIn(guest))) return
      const booking = await createBooking(
        { ...stay, coupon_code: appliedCoupon, guest_details: guest, special_requests: special_requests || null },
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
  const wrongAccountType = user && user.role !== 'customer'

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
          {wrongAccountType && (
            <FormAlert>You’re signed in as a {user.role}. Bookings are made from guest accounts — log out to book.</FormAlert>
          )}
          <FormAlert>{serverError}</FormAlert>

          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-2xl text-forest-900">Your details</h2>
            <p className="mt-1 text-sm text-ink-600">
              {status === 'authenticated'
                ? 'The person checking in. Your booking confirmation is sent to this email and mobile number.'
                : 'No account needed — we’ll set one up with these details so you can manage your booking. Your confirmation is sent to this email and mobile number.'}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextField label="First name" autoComplete="given-name" error={errors.first_name?.message} {...register('first_name')} />
              <TextField label="Last name" autoComplete="family-name" error={errors.last_name?.message} {...register('last_name')} />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                readOnly={status === 'authenticated' || needsPassword}
                error={errors.email?.message}
                {...register('email')}
              />
              <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="+919876543210" error={errors.phone?.message} {...register('phone')} />
              <TextField
                as="textarea"
                className="sm:col-span-2"
                label="Special requests (optional)"
                hint="Not guaranteed — the property will try to help."
                error={errors.special_requests?.message}
                {...register('special_requests')}
              />
            </div>

            {needsPassword && (
              <div className="mt-5 rounded-2xl bg-cream-100 p-4">
                <p className="flex items-start gap-2 text-sm text-ink-900">
                  <Info className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
                  You already have an account with this email. Enter your password to continue.
                </p>
                <PasswordField className="mt-3" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-2 text-xs text-ink-600">
                  Booked with us before without a password?{' '}
                  <Link to="/forgot-password" className="font-medium underline">
                    Set a password
                  </Link>{' '}
                  ·{' '}
                  <button
                    type="button"
                    className="font-medium underline"
                    onClick={() => {
                      setNeedsPassword(false)
                      setPassword('')
                    }}
                  >
                    Use a different email
                  </button>
                </p>
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-ink-600">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
              Guests show a photo ID at check-in — we never ask for ID numbers online. Your details are shared only with this property.
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

          <SubmitButton
            loading={isSubmitting}
            disabled={wrongAccountType || status === 'loading' || !quote.data?.available || isSubmitting || (needsPassword && !password)}
            className="w-full sm:w-auto"
          >
            {needsPassword ? 'Log in & continue to payment' : 'Continue to payment'}
          </SubmitButton>
          {quote.data && !quote.data.available && <p className="text-sm text-clay-600">This room is no longer available for these dates.</p>}
          {status !== 'authenticated' && !needsPassword && (
            <p className="text-sm text-ink-600">
              Already have an account?{' '}
              <Link to={`/login?next=${encodeURIComponent(`/checkout?${params.toString()}`)}`} className="font-medium text-forest-800 underline">
                Log in
              </Link>
            </p>
          )}
        </form>

        <aside aria-label="Price summary" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            {snapshot ? (
              <StaySummary snapshot={snapshot} checkIn={stay.check_in} checkOut={stay.check_out} nights={price?.nights_count ?? 0} rooms={stay.rooms} guests={stay} mealPlan={price?.meal_plan} />
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
