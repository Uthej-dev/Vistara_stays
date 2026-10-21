import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ResortCard from './ResortCard'
import SmartImage from '../ui/SmartImage'
import { RESORT_CARD } from '../../test/fixtures'
import { renderWithRouter } from '../../test/renderWithRouter'

describe('ResortCard', () => {
  it('labels sample data and shows a starting price that excludes taxes', () => {
    renderWithRouter(<ResortCard resort={RESORT_CARD} />)

    expect(screen.getByText('Sample property')).toBeInTheDocument()
    expect(screen.getByText('18 sample reviews')).toBeInTheDocument()
    expect(screen.getByText('from')).toBeInTheDocument()
    expect(screen.getByText('₹6,400')).toBeInTheDocument()
    expect(screen.getByText(/Excl. taxes & fees · Breakfast included/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: RESORT_CARD.name })).toHaveAttribute('href', `/resorts/${RESORT_CARD.slug}`)
  })

  it('shows the total for the searched dates, including taxes', () => {
    const resort = {
      ...RESORT_CARD,
      price: { kind: 'stay', per_night_paise: 700000, total_paise: 1470000, nights: 2, rooms: 1, taxes_included: true, meal_plan: 'breakfast' },
      available: true,
    }
    renderWithRouter(<ResortCard resort={resort} linkSearch="?check_in=2026-12-12&check_out=2026-12-14" />)

    expect(screen.getByText('₹14,700')).toBeInTheDocument()
    expect(screen.getByText(/for 2 nights/)).toBeInTheDocument()
    expect(screen.getByText(/Incl. taxes & fees · 1 room/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: RESORT_CARD.name })).toHaveAttribute(
      'href',
      `/resorts/${RESORT_CARD.slug}?check_in=2026-12-12&check_out=2026-12-14`,
    )
  })

  it('says clearly when the stay is not available for the dates', () => {
    renderWithRouter(<ResortCard resort={{ ...RESORT_CARD, available: false }} />)
    expect(screen.getByText('Not available for your dates')).toBeInTheDocument()
  })

  it('sends visitors to log in when they try to save a favourite', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ResortCard resort={RESORT_CARD} />)

    await user.click(screen.getByRole('button', { name: /save .* to favourites/i }))

    expect(screen.getByTestId('location')).toHaveTextContent(`/login?next=${encodeURIComponent(`/resorts/${RESORT_CARD.slug}`)}`)
  })
})

describe('SmartImage', () => {
  it('replaces a failed image with an accessible fallback', () => {
    renderWithRouter(<SmartImage image={{ src: 'https://example.invalid/x.jpg', alt: 'Tea estates in Munnar' }} />)

    fireEvent.error(screen.getByRole('img', { name: 'Tea estates in Munnar' }))

    expect(screen.getByText('Photo unavailable')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Tea estates in Munnar' })).toBeInTheDocument()
  })

  it('shows the fallback immediately when there is no image', () => {
    renderWithRouter(<SmartImage image={null} alt="Missing photo" />)
    expect(screen.getByRole('img', { name: 'Missing photo' })).toHaveTextContent('Photo unavailable')
  })
})
