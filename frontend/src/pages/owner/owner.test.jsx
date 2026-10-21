import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { USER, fakeServer, session } from '../../test/http'

vi.mock('../../api/catalog', () => import('../../test/mockCatalogApi'))
vi.mock('../../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))

const OWNER = { ...USER, id: 'o1', role: 'owner', name: 'Ravi Kumar' }
const RESORT = {
  id: 'r9', name: 'Hill Breeze', slug: 'hill-breeze-coorg', status: 'draft', destination_slug: 'coorg', property_type: 'cottage',
  booking_mode: 'instant', description: '', highlights: [], categories: [], amenities: [], surroundings: [], images: [],
  address: { line1: '', town: 'Coorg', district: 'Kodagu' }, location: null, nearby_attractions: [], contact: {},
  policies: { check_in_time: '14:00', check_out_time: '11:00', child_free_age: 5, pets_allowed: false, smoking_allowed: false, house_rules: [], accessibility: [], meals_note: null, cancellation_policy: { code: 'flexible', tiers: [] } },
  missing: ['At least 3 photos'],
}

describe('owner portal', () => {
  it('shows the dashboard KPIs', async () => {
    fakeServer({
      'POST /auth/refresh': () => [200, session(OWNER)],
      'GET /owner/dashboard': () => [200, {
        resorts_by_status: { published: 2 }, upcoming_arrivals: [], occupancy_next_30_days_pct: 42.5, room_nights_sold_next_30_days: 51,
        revenue_this_month_paise: 12500000, bookings_this_month: 7, pending_confirmations: 1, open_enquiries: 3, owner_confirmation_hours: 24,
      }],
    })
    renderApp('/owner')

    expect(await screen.findByText('42.5%')).toBeInTheDocument()
    expect(screen.getByText('₹1.3L')).toBeInTheDocument() // ₹1,25,000 in Indian compact notation
    expect(screen.getByText('51 room-nights booked')).toBeInTheDocument()
  })

  it('is closed to customers', async () => {
    fakeServer({ 'POST /auth/refresh': () => [200, session()] })
    renderApp('/owner')
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this page' })).toBeInTheDocument()
  })

  it('keeps unsaved edits in one section when another section saves (regression)', async () => {
    const user = userEvent.setup()
    let resort = RESORT
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session(OWNER)],
      'GET /owner/resorts/r9': () => [200, resort],
      'GET /owner/resorts/r9/room-types': () => [200, []],
      'PATCH /owner/resorts/r9': (config) => {
        resort = { ...resort, ...JSON.parse(config.data) }
        return [200, resort]
      },
    })
    renderApp('/owner/resorts/r9')

    await user.type(await screen.findByLabelText('Street address'), '7 Estate Road')
    await user.type(screen.getByLabelText('Description'), 'A quiet place.')
    await user.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(calls.filter((c) => c.key === 'GET /owner/resorts/r9').length).toBeGreaterThan(1)) // refetched

    expect(screen.getByLabelText('Street address')).toHaveValue('7 Estate Road')
  })
})
