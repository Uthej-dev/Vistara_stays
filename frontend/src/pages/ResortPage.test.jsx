import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'
import { fakeServer, session } from '../test/http'
import * as catalog from '../api/catalog'
import { RESORT_CARD } from '../test/fixtures'
import { addDays, todayIST } from '../utils/dates'

vi.mock('../api/catalog', () => import('../test/mockCatalogApi'))
vi.mock('../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))

const ROOM = {
  id: 'rt1', name: 'Garden Cottage', description: null, max_adults: 2, max_children: 1, max_occupancy: 3,
  base_occupancy: 2, beds: [{ type: 'queen', count: 1 }], size_sqft: 320, amenities: [], images: [],
  base_rate_paise: 640000, weekend_rate_paise: 740000, extra_adult_paise: 120000, extra_child_paise: 60000,
  meal_plan: 'breakfast', total_units: 6,
}
const DETAIL = {
  ...RESORT_CARD, status: 'published', description: 'A fictional cottage stay.', highlights: ['Evening campfires'],
  images: [RESORT_CARD.cover_image], address: { town: 'Coorg', district: 'Kodagu', state: 'karnataka', pincode: null },
  location: { lat: 12.4, lng: 75.7 }, distance_from_centre_km: 2.1, booking_mode: 'instant', starting_price_paise: 640000,
  policies: {
    check_in_time: '14:00', check_out_time: '11:00', child_free_age: 5, pets_allowed: false, smoking_allowed: false,
    house_rules: ['Quiet hours 10 pm – 7 am'], accessibility: [], id_required: true, meals_note: null,
    cancellation_policy: { code: 'flexible', description: 'Full refund up to 7 days before.', tiers: [{ days_before_check_in: 7, refund_pct: 100 }, { days_before_check_in: 0, refund_pct: 0 }] },
  },
  nearby_attractions: [{ name: 'Abbey Falls', distance_km: null, note: null }], room_types: [ROOM], is_favourite: false,
}
const PRICE = {
  currency: 'INR', nights: [{ date: '2026-12-01', rate_paise: 640000, source: 'base' }], nights_count: 1, rooms: 1,
  extra_adults: 0, extra_children: 0, room_subtotal_paise: 640000, extra_guest_paise: 0, discount_paise: 0, coupon_code: null,
  taxable_paise: 640000, taxes: [{ label: 'GST 5%', rate_pct: 5, amount_paise: 32000 }], tax_total_paise: 32000,
  service_fee_pct: 2, service_fee_paise: 12800, total_paise: 684800, avg_per_night_paise: 684800, meal_plan: 'breakfast', summary: '',
}
const availability = (bookable = true) => ({
  check_in: 'x', check_out: 'y', nights: 1, rooms: 1, adults: 2, children: 0, checked_at: '2026-10-18T00:00:00Z',
  room_types: [{ room_type_id: 'rt1', name: 'Garden Cottage', available_units: bookable ? 2 : 0, fits: true, bookable, unavailable_reason: bookable ? null : 'Sold out for these dates.', price: bookable ? PRICE : null }],
})

const checkIn = addDays(todayIST(), 20)
const checkOut = addDays(todayIST(), 21)
const path = `/resorts/${DETAIL.slug}?check_in=${checkIn}&check_out=${checkOut}&rooms=1&adults=2&children=0`

describe('ResortPage', () => {
  beforeEach(() => vi.mocked(catalog.getResort).mockResolvedValue(DETAIL))

  it('shows details, policies and the server’s price breakdown for the dates', async () => {
    const calls = fakeServer({ 'GET /resorts/r1/availability': () => [200, availability()] })
    renderApp(path)

    expect(await screen.findByRole('heading', { level: 1, name: DETAIL.name })).toBeInTheDocument()
    expect(screen.getByText(/Sample property\./)).toBeInTheDocument()
    expect(screen.getByText('Up to 2 adults, 1 child')).toBeInTheDocument()
    expect(screen.getByText('100% refund')).toBeInTheDocument()
    const panel = screen.getByRole('complementary', { name: 'Book this stay' })
    expect(await within(panel).findByText('GST 5%')).toBeInTheDocument()
    expect(within(panel).getAllByText('₹6,848').length).toBeGreaterThan(0)
    expect(calls.find((c) => c.key === 'GET /resorts/r1/availability').config.params).toMatchObject({ check_in: checkIn, adults: 2 })
  })

  it('asks visitors to log in before reserving, keeping their selection', async () => {
    const user = userEvent.setup()
    fakeServer({ 'GET /resorts/r1/availability': () => [200, availability()] })
    const { router } = renderApp(path)
    const panel = await screen.findByRole('complementary', { name: 'Book this stay' })

    await user.click(await within(panel).findByRole('button', { name: 'Reserve' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    const next = decodeURIComponent(router.state.location.search.replace('?next=', ''))
    expect(next).toBe(`/checkout?check_in=${checkIn}&check_out=${checkOut}&rooms=1&adults=2&children=0&room=rt1`)
  })

  it('sends signed-in customers straight to checkout', async () => {
    const user = userEvent.setup()
    fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, []],
      'GET /resorts/r1/availability': () => [200, availability()],
    })
    const { router } = renderApp(path)
    const panel = await screen.findByRole('complementary', { name: 'Book this stay' })

    await user.click(await within(panel).findByRole('button', { name: 'Reserve' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/checkout'))
  })

  it('disables reserving when sold out', async () => {
    fakeServer({ 'GET /resorts/r1/availability': () => [200, availability(false)] })
    renderApp(path)
    const panel = await screen.findByRole('complementary', { name: 'Book this stay' })

    expect(await within(panel).findByRole('button', { name: 'Not available' })).toBeDisabled()
  })

  it('shows starting prices until dates are chosen', async () => {
    renderApp(`/resorts/${DETAIL.slug}`)
    const panel = await screen.findByRole('complementary', { name: 'Book this stay' })
    expect(within(panel).getByRole('button', { name: 'Choose dates to see prices' })).toBeDisabled()
    expect(within(panel).getByText(/excl. taxes/)).toBeInTheDocument()
  })
})
