import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { USER, fakeServer, session } from '../../test/http'
import * as catalog from '../../api/catalog'
import { RESORT_CARD } from '../../test/fixtures'

vi.mock('../../api/catalog', () => import('../../test/mockCatalogApi'))
vi.mock('../../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))

const PRICE = {
  currency: 'INR', nights: [{ date: '2026-12-01', rate_paise: 500000, source: 'base' }], nights_count: 1, rooms: 1, extra_adults: 0,
  extra_children: 0, room_subtotal_paise: 500000, extra_guest_paise: 0, discount_paise: 0, coupon_code: null, taxable_paise: 500000,
  taxes: [{ label: 'GST 5%', rate_pct: 5, amount_paise: 25000 }], tax_total_paise: 25000, service_fee_pct: 2, service_fee_paise: 10000,
  total_paise: 535000, avg_per_night_paise: 535000, meal_plan: 'breakfast', summary: '',
}
const POLICY = { cancellation_policy: { tiers: [{ days_before_check_in: 7, refund_pct: 100 }, { days_before_check_in: 0, refund_pct: 0 }] }, check_in_time: '14:00', check_out_time: '11:00', meal_plan: 'breakfast' }
const BOOKING = {
  id: 'b1', booking_ref: 'VS-ABC234', status: 'pending_payment', payment_status: 'unpaid', resort_id: 'r1', room_type_id: 'rt1',
  check_in: '2026-12-01', check_out: '2026-12-02', nights: 1, rooms: 1, guests: { adults: 2, children: 0, child_ages: [] },
  guest_details: { name: 'Asha Rao', email: 'asha@example.com', phone: '+919876543210', age: 34, nationality: 'IN' },
  hold_expires_at: new Date(Date.now() + 10 * 60000).toISOString(), price: PRICE, policy_snapshot: POLICY,
  resort_snapshot: { name: 'Misty Fern Estate Stay', room_type_name: 'Garden Cottage', cover: null, is_sample: true },
  status_history: [], created_at: '2026-10-18T05:00:00Z', can_review: false,
}
const DETAIL = { ...RESORT_CARD, images: [], room_types: [{ id: 'rt1', name: 'Garden Cottage' }], policies: { cancellation_policy: POLICY.cancellation_policy } }
const checkoutPath = '/checkout?check_in=2026-12-01&check_out=2026-12-02&rooms=1&adults=2&children=0&room=rt1&resort=misty-fern-estate-coorg'

describe('checkout', () => {
  beforeEach(() => vi.mocked(catalog.getResort).mockResolvedValue(DETAIL))

  it('creates the booking with an idempotency key and the lead guest’s details', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings/quote': () => [200, { available: true, available_units: 3, price: PRICE, hold_minutes: 15 }],
      'POST /bookings': () => [201, BOOKING],
      'GET /bookings/b1': () => [200, BOOKING],
      'GET /payments/config': () => [200, { provider: 'simulated', simulated: true, razorpay_key_id: null }],
    })
    const { router } = renderApp(checkoutPath)

    expect(await screen.findByText('₹5,350')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Mobile number'), '+919876543210')
    await user.type(screen.getByLabelText('Age'), '34')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /hold room/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout/b1'))
    const create = calls.find((c) => c.key === 'POST /bookings')
    expect(create.config.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(create.data).toMatchObject({ room_type_id: 'rt1', check_in: '2026-12-01', guest_details: { name: 'Asha Rao', age: 34, nationality: 'IN' } })
    expect(create.data).not.toHaveProperty('total_paise')
    expect(await screen.findByText(/Room held for/)).toBeInTheDocument()
  })

  it('rejects an under-18 lead guest before calling the server', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings/quote': () => [200, { available: true, available_units: 3, price: PRICE, hold_minutes: 15 }],
    })
    renderApp(checkoutPath)
    await screen.findByText('₹5,350')

    await user.type(screen.getByLabelText('Age'), '16')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /hold room/i }))

    expect(await screen.findByText('The lead guest must be 18 or older')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'POST /bookings')).toBe(false)
  })

  it('blocks booking until the email is verified', async () => {
    fakeServer({
      'POST /auth/refresh': () => [200, session({ ...USER, email_verified: false })],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings/quote': () => [200, { available: true, available_units: 3, price: PRICE, hold_minutes: 15 }],
    })
    renderApp(checkoutPath)

    expect(await screen.findByText(/Please verify your email before booking/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hold room/i })).toBeDisabled()
  })
})

describe('payment and trips', () => {
  it('confirms with a clearly labelled simulated payment', async () => {
    const user = userEvent.setup()
    const confirmed = { ...BOOKING, status: 'confirmed', payment_status: 'paid', payment: { provider: 'simulated', simulated: true }, cancellation_preview: { eligible: true, refund_pct: 100, refund_paise: 525000, days_before_check_in: 40 } }
    let current = BOOKING
    fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'GET /bookings/b1': () => [200, current],
      'GET /payments/config': () => [200, { provider: 'simulated', simulated: true, razorpay_key_id: null }],
      'POST /payments/simulated/b1/succeed': () => {
        current = confirmed
        return [200, confirmed]
      },
    })
    const { router } = renderApp('/checkout/b1')

    expect(await screen.findByText(/Simulated payment \(development mode\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simulate successful payment' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/trips/b1'))
    expect(await screen.findByText('Simulated payment — no money was charged')).toBeInTheDocument()
  })

  it('shows the refund before cancelling and calls the API', async () => {
    const user = userEvent.setup()
    const confirmed = { ...BOOKING, status: 'confirmed', payment_status: 'paid', cancellation_preview: { eligible: true, refund_pct: 100, refund_paise: 525000, days_before_check_in: 40 } }
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'GET /bookings/b1': () => [200, confirmed],
      'POST /bookings/b1/cancel': () => [200, { ...confirmed, status: 'cancelled', cancellation_preview: null, cancellation: { cancelled_at: '2026-10-18T06:00:00Z', by: 'customer', reason: 'Plans changed', refund_pct: 100, refund_paise: 525000, refund_status: 'simulated_refund' } }],
    })
    renderApp('/trips/b1')

    await user.click(await screen.findByRole('button', { name: /cancel this booking/i }))
    expect(screen.getByText(/You’ll get/)).toHaveTextContent('₹5,250')
    await user.type(screen.getByLabelText('Reason (optional)'), 'Plans changed')
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }))

    expect(await screen.findByText(/Simulated refund — no real money was involved/)).toBeInTheDocument()
    expect(calls.find((c) => c.key === 'POST /bookings/b1/cancel').data).toEqual({ reason: 'Plans changed' })
  })
})
