import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderApp } from '../../test/renderApp'
import { USER, fakeServer, session } from '../../test/http'
import ReviewForm from '../../features/reviews/ReviewForm'
import { RatingHistogram } from '../../features/reviews/ReviewBits'

vi.mock('../../api/catalog', () => import('../../test/mockCatalogApi'))
vi.mock('../../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))

const ADMIN = { ...USER, id: 'a1', role: 'admin', name: 'Dev Admin' }
const withClient = (ui) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

describe('reviews UI', () => {
  it('requires a rating and enough text, then sends the review', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({ 'POST /reviews': () => [201, { id: 'rv1' }] })
    const onDone = vi.fn()
    withClient(<ReviewForm bookingId="b1" onDone={onDone} />)

    await user.click(screen.getByRole('button', { name: 'Publish review' }))
    expect(screen.getByText('Choose an overall rating')).toBeInTheDocument()
    expect(calls).toHaveLength(0)

    await user.click(screen.getAllByRole('radio', { name: '4 stars' })[0])
    await user.type(screen.getByLabelText('Your review'), 'Lovely quiet stay with great food.')
    await user.click(screen.getByRole('button', { name: 'Publish review' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls[0].data).toEqual({ booking_id: 'b1', rating: 4, sub_ratings: null, title: null, body: 'Lovely quiet stay with great food.' })
  })

  it('labels every star row with its count', () => {
    render(<RatingHistogram histogram={{ 5: 3, 4: 1, 3: 0, 2: 0, 1: 1 }} total={5} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows).toEqual(['5 star3', '4 star1', '3 star0', '2 star0', '1 star1'])
  })
})

describe('admin portal', () => {
  it('shows platform metrics to admins', async () => {
    fakeServer({
      'POST /auth/refresh': () => [200, session(ADMIN)],
      'GET /admin/metrics': () => [200, {
        users_by_role: { customer: 10, owner: 3 }, bookings_by_status: { confirmed: 4 }, resorts_by_status: { published: 37, pending_review: 2 },
        bookings_last_30_days: 4, new_users_last_30_days: 2, gross_booking_value_paise: 4200000, paid_bookings: 4, pending_approvals: 2, open_reports: 1,
      }],
    })
    renderApp('/admin')

    expect(await screen.findByText('Listings awaiting review')).toBeInTheDocument()
    expect(screen.getByText('₹42K')).toBeInTheDocument()
    expect(screen.getByText('Pending review')).toBeInTheDocument()
  })

  it('is closed to owners', async () => {
    fakeServer({ 'POST /auth/refresh': () => [200, session({ ...USER, role: 'owner' })] })
    renderApp('/admin/users')
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this page' })).toBeInTheDocument()
  })

  it('requires a reason before suspending a user', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session(ADMIN)],
      'GET /admin/users': () => [200, { items: [{ id: 'u9', name: 'Ravi', email: 'ravi@example.com', role: 'customer', status: 'active', email_verified: true, created_at: '2026-10-01T00:00:00Z' }], page: 1, page_size: 20, total: 1, total_pages: 1 }],
      'POST /admin/users/u9/suspend': () => [200, {}],
    })
    renderApp('/admin/users')

    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(calls.some((c) => c.key === 'POST /admin/users/u9/suspend')).toBe(false) // blocked: no reason

    await user.type(screen.getByLabelText('Reason for suspend'), 'Chargeback fraud')
    await user.click(screen.getByRole('button', { name: 'Suspend' }))
    await waitFor(() => expect(calls.find((c) => c.key === 'POST /admin/users/u9/suspend')?.data).toEqual({ reason: 'Chargeback fraud' }))
  })
})
