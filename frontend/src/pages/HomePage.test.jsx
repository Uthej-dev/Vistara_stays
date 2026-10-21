import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'

vi.mock('../api/catalog', () => import('../test/mockCatalogApi'))
vi.mock('../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))


describe('HomePage', () => {
  it('renders every landing-page section', async () => {
    renderApp('/')

    expect(screen.getByRole('heading', { level: 1, name: /find your quiet corner of south india/i })).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(
      expect.arrayContaining([
        'Popular destinations',
        'Featured resorts',
        'Find the right kind of stay',
        'Collections & seasonal picks',
        'Booking you can trust',
        'Own a resort, villa or homestay?',
      ]),
    )
    expect(screen.getByRole('form', { name: 'Search stays' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Misty Fern Estate Stay' })).toBeInTheDocument()
  })

  it('filters popular destinations by state', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const section = screen.getByRole('region', { name: 'Popular destinations' })
    await within(section).findByRole('heading', { name: 'Coorg' })

    await user.click(within(section).getByRole('button', { name: 'Telangana' }))

    const names = within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Ananthagiri Hills', 'Laknavaram'])
  })

  it('shows a 404 page for unknown routes', () => {
    renderApp('/no-such-page')
    expect(screen.getByRole('heading', { name: /doesn’t lead anywhere/i })).toBeInTheDocument()
  })

  it('lists photo credits for every destination', async () => {
    renderApp('/credits')
    expect(await screen.findAllByRole('row')).toHaveLength(5) // header + 4 destinations
  })
})
