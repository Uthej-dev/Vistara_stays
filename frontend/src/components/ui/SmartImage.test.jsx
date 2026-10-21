import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SmartImage from './SmartImage'

const IMAGE = { src: '/photos/coorg-1280.jpg', srcSet: { 500: '/photos/coorg-500.jpg' }, alt: 'Coorg hills' }

describe('SmartImage', () => {
  it('shows the photo when the image arrives after the first render', () => {
    const { rerender } = render(<SmartImage image={undefined} alt="" />)
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument()

    rerender(<SmartImage image={IMAGE} alt="Coorg hills" />)

    expect(screen.queryByText('Photo unavailable')).not.toBeInTheDocument()
    expect(screen.getByAltText('Coorg hills')).toHaveAttribute('srcset', '/photos/coorg-500.jpg 500w')
  })

  it('falls back when the photo fails, and retries for a new image', () => {
    const { rerender } = render(<SmartImage image={IMAGE} />)
    fireEvent.error(screen.getByAltText('Coorg hills'))
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument()

    rerender(<SmartImage image={{ ...IMAGE, src: '/photos/munnar-1280.jpg', alt: 'Munnar' }} />)
    expect(screen.getByAltText('Munnar')).toBeInTheDocument()
  })
})
