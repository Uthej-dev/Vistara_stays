import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import ResortCard from './ResortCard'
import SmartImage from '../ui/SmartImage'
import { SAMPLE_RESORTS } from '../../data/sampleResorts'
import { renderWithRouter } from '../../test/renderWithRouter'

const resort = SAMPLE_RESORTS.find((r) => r.slug === 'misty-fern-estate-coorg')

describe('ResortCard', () => {
  it('labels sample data and shows a starting price that excludes taxes', () => {
    renderWithRouter(<ResortCard resort={resort} />)

    expect(screen.getByText('Sample property')).toBeInTheDocument()
    expect(screen.getByText('18 sample reviews')).toBeInTheDocument()
    expect(screen.getByText('from')).toBeInTheDocument()
    expect(screen.getByText('₹6,400')).toBeInTheDocument()
    expect(screen.getByText(/Excl. taxes & fees · Breakfast included/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: resort.name })).toHaveAttribute('href', `/resorts/${resort.slug}`)
  })

  it('sends visitors to log in when they try to save a favourite', async () => {
    const user = userEvent.setup()
    renderWithRouter(<ResortCard resort={resort} />)

    await user.click(screen.getByRole('button', { name: /save .* to favourites/i }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/login?next=${encodeURIComponent(`/resorts/${resort.slug}`)}`,
    )
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
