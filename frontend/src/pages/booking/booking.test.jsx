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
  guest_details: { first_name: 'Asha', last_name: 'Rao', name: 'Asha Rao', email: 'asha@example.com', phone: '+919876543210' },
  hold_expires_at: new Date(Date.now() + 10 * 60000).toISOString(), price: PRICE, policy_snapshot: POLICY,
  resort_snapshot: { name: 'Misty Fern Estate Stay', room_type_name: 'Garden Cottage', cover: null, is_sample: true },
  status_history: [], created_at: '2026-10-18T05:00:00Z', can_review: false,
}
const DETAIL = { ...RESORT_CARD, images: [], room_types: [{ id: 'rt1', name: 'Garden Cottage' }], policies: { cancellation_policy: POLICY.cancellation_policy } }
const checkoutPath = '/checkout?check_in=2026-12-01&check_out=2026-12-02&rooms=1&adults=2&children=0&room=rt1&resort=misty-fern-estate-coorg'

describe('checkout', () => {
  beforeEach(() => vi.mocked(catalog.getResort).mockResolvedValue(DETAIL))
  const quoteOk = () => [200, { available: true, available_units: 3, price: PRICE, hold_minutes: 15 }]
  const fillDetails = async (user, { email = 'meera@example.com' } = {}) => {
    await user.type(screen.getByLabelText('First name'), 'Meera')
    await user.type(screen.getByLabelText('Last name'), 'Nair')
    await user.type(screen.getByLabelText('Email'), email)
    await user.type(screen.getByLabelText('Mobile number'), '+919812345678')
    await user.click(screen.getByRole('checkbox'))
  }

  it('lets a visitor book without logging in: account is created from their details', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      'POST /bookings/quote': quoteOk,
      'POST /auth/checkout-signup': () => [201, session({ ...USER, email: 'meera@example.com', name: 'Meera Nair', email_verified: false })],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings': () => [201, BOOKING],
      'GET /bookings/b1': () => [200, BOOKING],
      'GET /payments/config': () => [200, { provider: 'simulated', simulated: true, razorpay_key_id: null }],
    })
    const { router } = renderApp(checkoutPath)

    expect(await screen.findByText('₹5,350')).toBeInTheDocument()
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout/b1'))
    const keys = calls.map((c) => c.key)
    expect(keys.indexOf('POST /auth/checkout-signup')).toBeLessThan(keys.indexOf('POST /bookings'))
    expect(calls.find((c) => c.key === 'POST /auth/checkout-signup').data).toEqual({ first_name: 'Meera', last_name: 'Nair', email: 'meera@example.com', phone: '+919812345678' })
    const create = calls.find((c) => c.key === 'POST /bookings')
    expect(create.config.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(create.data.guest_details).toEqual({ first_name: 'Meera', last_name: 'Nair', email: 'meera@example.com', phone: '+919812345678' })
    expect(create.data).not.toHaveProperty('total_paise')
  })

  it('asks for the password when the email already has an account', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      'POST /bookings/quote': quoteOk,
      'POST /auth/checkout-signup': () => [409, { error: { code: 'ACCOUNT_EXISTS', message: 'You already have an account with this email.' } }],
      'POST /auth/login': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings': () => [201, BOOKING],
      'GET /bookings/b1': () => [200, BOOKING],
      'GET /payments/config': () => [200, { provider: 'simulated', simulated: true, razorpay_key_id: null }],
    })
    const { router } = renderApp(checkoutPath)
    await screen.findByText('₹5,350')

    await fillDetails(user, { email: 'asha@example.com' })
    await user.click(screen.getByRole('button', { name: 'Continue to payment' }))
    await user.type(await screen.findByLabelText('Password'), 'Correct-Horse-42')
    await user.click(screen.getByRole('button', { name: 'Log in & continue to payment' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout/b1'))
    expect(calls.find((c) => c.key === 'POST /auth/login').data).toEqual({ email: 'asha@example.com', password: 'Correct-Horse-42' })
  })

  it('validates the four details before contacting the server', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({ 'POST /bookings/quote': quoteOk })
    renderApp(checkoutPath)
    await screen.findByText('₹5,350')

    await user.click(screen.getByRole('button', { name: 'Continue to payment' }))

    expect(await screen.findByText('Enter your first name')).toBeInTheDocument()
    expect(screen.getByText('Enter your last name')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'POST /auth/checkout-signup' || c.key === 'POST /bookings')).toBe(false)
  })

  it('prefills the details of a signed-in customer', async () => {
    fakeServer({
      'POST /auth/refresh': () => [200, session({ ...USER, phone: '+919876543210' })],
      'GET /favourites/ids': () => [200, []],
      'POST /bookings/quote': quoteOk,
    })
    renderApp(checkoutPath)

    expect(await screen.findByDisplayValue('Asha')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Rao')).toBeInTheDocument()
    expect(screen.getByDisplayValue('+919876543210')).toBeInTheDocument()
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
