import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { routes } from '../routes/router'
import * as healthApi from '../api/health'

function renderApp(path = '/') {
  vi.spyOn(healthApi, 'getReadiness').mockResolvedValue({ status: 'ok', database: 'ok' })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('HomePage', () => {
  it('renders every landing-page section in order', () => {
    renderApp('/')

    expect(screen.getByRole('heading', { level: 1, name: /find your quiet corner of south india/i })).toBeInTheDocument()
    const sectionHeadings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(sectionHeadings).toEqual(
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
    expect(screen.getByRole('contentinfo')).toBeInTheDocument() // footer
  })

  it('filters popular destinations by state', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const section = screen.getByRole('region', { name: 'Popular destinations' })

    await user.click(within(section).getByRole('button', { name: 'Telangana' }))

    const names = within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual(['Ananthagiri Hills', 'Laknavaram', 'Nagarjuna Sagar'])
    expect(within(section).getByRole('button', { name: 'Telangana' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a 404 page for unknown routes and a placeholder for upcoming ones', () => {
    renderApp('/no-such-page')
    expect(screen.getByRole('heading', { name: /doesn’t lead anywhere/i })).toBeInTheDocument()
  })

  it('lists photo credits for every destination', () => {
    renderApp('/credits')
    expect(screen.getAllByRole('row')).toHaveLength(26) // header + 25 destinations
  })
})
