import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/renderApp'
import * as api from '../api/catalog'
import { searchResponse } from '../test/fixtures'

vi.mock('../api/catalog', () => import('../test/mockCatalogApi'))
vi.mock('../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))


describe('SearchPage', () => {
  beforeEach(() => vi.mocked(api.searchResorts).mockClear())

  it('sends URL parameters to the API and shows results', async () => {
    renderApp('/search?destination=coorg&amenity=pool&amenity=wifi&sort=price_asc')

    expect(await screen.findByRole('heading', { name: 'Stays in Coorg' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Misty Fern Estate Stay' })).toBeInTheDocument()
    expect(api.searchResorts).toHaveBeenLastCalledWith(
      expect.objectContaining({ destination: 'coorg', amenity: ['pool', 'wifi'], sort: 'price_asc', page_size: 12 }),
    )
  })

  it('turns a filter click into a URL change and a new search', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/search?destination=coorg&page=2')
    const filters = await screen.findByRole('complementary', { name: 'Filters' })

    await user.click(await within(filters).findByRole('checkbox', { name: 'Swimming pool' }))

    expect(router.state.location.search).toBe('?destination=coorg&amenity=pool') // page reset to 1
    expect(api.searchResorts).toHaveBeenLastCalledWith(expect.objectContaining({ amenity: ['pool'] }))
  })

  it('shows applied filters as chips with a clear-all option', async () => {
    const user = userEvent.setup()
    const { router } = renderApp('/search?amenity=pool&min_rating=4&q=mist')
    const chips = await screen.findByRole('list', { name: 'Applied filters' })

    expect(await within(chips).findByRole('button', { name: 'Remove filter: Swimming pool' })).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: 'Remove filter: 4+ rating' })).toBeInTheDocument()

    await user.click(within(chips).getByRole('button', { name: 'Clear all' }))
    expect(router.state.location.search).toBe('?q=mist') // search text is kept, filters cleared
  })

  it('shows a helpful empty state', async () => {
    vi.mocked(api.searchResorts).mockResolvedValueOnce(searchResponse([]))
    renderApp('/search?amenity=pool')

    expect(await screen.findByRole('heading', { name: 'No stays match your search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('paginates through results', async () => {
    const user = userEvent.setup()
    vi.mocked(api.searchResorts).mockResolvedValue(searchResponse(undefined, { total: 30, total_pages: 3 }))
    const { router } = renderApp('/search')

    await user.click(await screen.findByRole('button', { name: 'Page 2' }))

    expect(router.state.location.search).toBe('?page=2')
    vi.mocked(api.searchResorts).mockReset()
  })
})
