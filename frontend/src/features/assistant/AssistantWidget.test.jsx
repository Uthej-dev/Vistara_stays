import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import AssistantWidget from './AssistantWidget'
import { CATEGORIES, RESORT_CARD } from '../../test/fixtures'
import { fakeServer } from '../../test/http'
import { renderWithRouter } from '../../test/renderWithRouter'

const CRITERIA = {
  destination: 'coorg', destination_name: 'Coorg', state: null, check_in: '2026-12-12', check_out: '2026-12-14',
  adults: 2, children: 0, rooms: 1, min_price_per_night: null, max_price_per_night: 4000, amenities: ['pool'], sort: 'price_asc',
}

const RESULT = {
  id: 'r1', slug: RESORT_CARD.slug, name: RESORT_CARD.name, is_sample: true, destination: RESORT_CARD.destination,
  property_type: 'cottage', amenities: ['wifi', 'pool'], cover_image: RESORT_CARD.cover_image, rating: RESORT_CARD.rating,
  rooms: [
    { room_type_id: 'rt1', name: 'Garden cottage', available_units: 2, meal_plan: 'breakfast', per_night_paise: 735000, total_paise: 1470000 },
    { room_type_id: 'rt2', name: 'Pool villa', available_units: 1, meal_plan: 'half_board', per_night_paise: 1200000, total_paise: 2400000 },
  ],
  per_night_paise: 735000, total_paise: 1470000, nights: 2,
}

function server({ enabled = true, chat } = {}) {
  return fakeServer({
    'GET /assistant/status': () => [200, { enabled }],
    'GET /categories': () => [200, CATEGORIES],
    'POST /assistant/chat': chat ?? (() => [200, { reply: 'Found one stay.', criteria: CRITERIA, missing: [], results: { resorts: [RESULT], total: 1, relaxed: null } }]),
  })
}

async function openWidget(user) {
  await user.click(screen.getByRole('button', { name: /open the vistara booking assistant/i }))
  return screen.getByRole('region', { name: 'Vistara booking assistant' })
}

afterEach(() => sessionStorage.clear())

describe('AssistantWidget', () => {
  it('opens from the launcher with a welcome message, then minimizes, closes and reopens', async () => {
    server()
    const user = userEvent.setup()
    renderWithRouter(<AssistantWidget />)

    expect(screen.getByText(/need help finding a stay/i)).toBeInTheDocument()
    const panel = await openWidget(user)
    expect(within(panel).getByText(/I'm the Vistara assistant/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Minimize assistant' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue chat' }))
    expect(screen.getByRole('textbox', { name: 'Message the assistant' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close assistant' }))
    expect(screen.queryByRole('region', { name: 'Vistara booking assistant' })).not.toBeInTheDocument()
    await openWidget(user)
  })

  it('sends the message with history and criteria, and shows result cards with real prices', async () => {
    const calls = server()
    const user = userEvent.setup()
    renderWithRouter(<AssistantWidget />)
    await openWidget(user)

    await user.type(screen.getByRole('textbox', { name: 'Message the assistant' }), 'Coorg, 12 to 14 Dec, 2 adults{Enter}')

    expect(await screen.findByText('Found one stay.')).toBeInTheDocument()
    const request = calls.find((c) => c.key === 'POST /assistant/chat').data
    expect(request).toEqual({ message: 'Coorg, 12 to 14 Dec, 2 adults', history: [], criteria: {} })

    const card = screen.getByRole('article')
    expect(within(card).getByText(RESORT_CARD.name)).toBeInTheDocument()
    expect(within(card).getByText('₹7,350')).toBeInTheDocument()
    expect(within(card).getByText(/₹14,700 for 2 nights · incl. taxes & fees/)).toBeInTheDocument()
    expect(within(card).getByText('Garden cottage')).toBeInTheDocument()
    expect(within(card).getByText('Swimming pool')).toBeInTheDocument()
    const stay = 'check_in=2026-12-12&check_out=2026-12-14&rooms=1&adults=2&children=0&room=rt1'
    expect(within(card).getByRole('link', { name: 'Book now' })).toHaveAttribute('href', `/checkout?${stay}&resort=${RESORT_CARD.slug}`)
    expect(within(card).getByRole('link', { name: 'View details' })).toHaveAttribute('href', `/resorts/${RESORT_CARD.slug}?${stay}`)

    // What the assistant remembered is visible, and refinements are one tap away.
    const summary = screen.getByRole('list', { name: 'Your trip so far' })
    expect(within(summary).getByText('Coorg')).toBeInTheDocument()
    expect(within(summary).getByText('≤ ₹4,000/night')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show me cheaper resorts' }))
    await waitFor(() => expect(calls.filter((c) => c.key === 'POST /assistant/chat')).toHaveLength(2))
    const second = calls.filter((c) => c.key === 'POST /assistant/chat')[1].data
    expect(second.criteria).toEqual(CRITERIA)
    expect(second.history).toEqual([
      { role: 'user', content: 'Coorg, 12 to 14 Dec, 2 adults' },
      { role: 'assistant', content: 'Found one stay.' },
    ])
  })

  it('sends families to the resort page first so children’s ages can be given', async () => {
    server({
      chat: () => [200, { reply: 'Here.', criteria: { ...CRITERIA, children: 1 }, missing: [], results: { resorts: [RESULT], total: 1, relaxed: 'without the budget limit' } }],
    })
    const user = userEvent.setup()
    renderWithRouter(<AssistantWidget />)
    await openWidget(user)
    await user.type(screen.getByRole('textbox'), 'with my kid{Enter}')

    const book = await screen.findByRole('link', { name: 'Book now' })
    expect(book.getAttribute('href')).toMatch(new RegExp(`^/resorts/${RESORT_CARD.slug}\\?`))
    expect(screen.getByText(/No exact matches — showing stays without the budget limit/)).toBeInTheDocument()
  })

  it('shows a friendly error with a retry when the assistant fails', async () => {
    let attempts = 0
    server({
      chat: () => {
        attempts += 1
        return attempts === 1
          ? [503, { error: { code: 'ASSISTANT_UNAVAILABLE', message: 'The assistant is temporarily unavailable.' } }]
          : [200, { reply: 'Back again!', criteria: CRITERIA, missing: [], results: null }]
      },
    })
    const user = userEvent.setup()
    renderWithRouter(<AssistantWidget />)
    await openWidget(user)
    await user.type(screen.getByRole('textbox'), 'hello{Enter}')

    expect(await screen.findByText('The assistant is temporarily unavailable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Back again!')).toBeInTheDocument()
    expect(screen.queryByText('The assistant is temporarily unavailable.')).not.toBeInTheDocument()
  })

  it('points to the normal search when the assistant is not configured', async () => {
    server({ enabled: false })
    const user = userEvent.setup()
    renderWithRouter(<AssistantWidget />)
    await openWidget(user)

    expect(await screen.findByRole('link', { name: 'search and book stays' })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('remembers the conversation across reloads in the same tab', async () => {
    server()
    const user = userEvent.setup()
    const { unmount } = renderWithRouter(<AssistantWidget />)
    await openWidget(user)
    await user.type(screen.getByRole('textbox'), 'Coorg please{Enter}')
    await screen.findByText('Found one stay.')
    unmount()

    renderWithRouter(<AssistantWidget />)
    expect(screen.getByText('Coorg please')).toBeInTheDocument()
    expect(screen.getByRole('article')).toBeInTheDocument()
  })
})
