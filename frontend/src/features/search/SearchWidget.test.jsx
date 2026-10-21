import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import SearchWidget from './SearchWidget'
import { renderWithRouter } from '../../test/renderWithRouter'
import { addDays, todayIST } from '../../utils/dates'

const setDate = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('SearchWidget', () => {
  it('navigates to /search with destination slug, dates and guests', async () => {
    const user = userEvent.setup()
    renderWithRouter(<SearchWidget />)
    const checkIn = addDays(todayIST(), 10)
    const checkOut = addDays(todayIST(), 12)

    await user.type(screen.getByLabelText('Where to?'), 'Coorg')
    setDate('Check-in', checkIn)
    setDate('Check-out', checkOut)
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/search?destination=coorg&check_in=${checkIn}&check_out=${checkOut}&rooms=1&adults=2&children=0`,
    )
  })

  it('suggests the next day as check-out when check-in is chosen', () => {
    renderWithRouter(<SearchWidget />)
    const checkIn = addDays(todayIST(), 5)

    setDate('Check-in', checkIn)

    expect(screen.getByLabelText('Check-out')).toHaveValue(addDays(checkIn, 1))
  })

  it('shows an error and stays on the page when check-out is before check-in', async () => {
    const user = userEvent.setup()
    renderWithRouter(<SearchWidget />)

    setDate('Check-in', addDays(todayIST(), 5))
    setDate('Check-out', addDays(todayIST(), 3))
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText('Check-out must be after check-in')).toBeInTheDocument()
    expect(screen.getByLabelText('Check-out')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()
  })

  it('keeps at least one adult per room when rooms are increased', async () => {
    const user = userEvent.setup()
    renderWithRouter(<SearchWidget />)

    await user.click(screen.getByRole('button', { name: /2 adults/i }))
    await user.click(screen.getByRole('button', { name: 'Increase rooms' }))
    await user.click(screen.getByRole('button', { name: 'Increase rooms' }))

    expect(screen.getByRole('button', { name: /3 adults · 3 rooms/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decrease adults' })).toBeDisabled()
  })

  it('closes the guest picker with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderWithRouter(<SearchWidget />)
    const trigger = screen.getByRole('button', { name: /2 adults/i })

    await user.click(trigger)
    expect(screen.getByRole('group', { name: 'Rooms and guests' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Rooms and guests' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
