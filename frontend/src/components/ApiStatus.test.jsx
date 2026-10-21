import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiStatus from './ApiStatus'
import { renderWithProviders } from '../test/renderWithProviders'
import * as healthApi from '../api/health'

describe('ApiStatus', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows online when the API and database are ready', async () => {
    vi.spyOn(healthApi, 'getReadiness').mockResolvedValue({ status: 'ok', database: 'ok' })

    renderWithProviders(<ApiStatus />)

    expect(await screen.findByText(/API online/i)).toBeInTheDocument()
  })

  it('shows the backend error message when the API is unavailable', async () => {
    vi.spyOn(healthApi, 'getReadiness').mockRejectedValue({
      response: { data: { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unreachable.' } } },
    })

    renderWithProviders(<ApiStatus />)

    expect(await screen.findByText(/Database is unreachable/i)).toBeInTheDocument()
  })
})
