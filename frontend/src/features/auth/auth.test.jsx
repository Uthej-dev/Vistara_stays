import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { USER, fakeServer, session } from '../../test/http'
import { apiClient, setAccessToken } from '../../api/client'
import { safeNext } from './schemas'

vi.mock('../../api/catalog', () => import('../../test/mockCatalogApi'))
vi.mock('../../api/health', () => ({ getReadiness: vi.fn(async () => ({ status: 'ok', database: 'ok' })) }))

const anonymous = { 'POST /auth/refresh': () => [401, { error: { code: 'NO_SESSION', message: 'No session' } }] }

async function fillLogin(user, email = 'asha@example.com', password = 'Correct-Horse-42') {
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('login', () => {
  it('signs in and returns to the page the user came from', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({ ...anonymous, 'POST /auth/login': () => [200, session()], 'GET /favourites/ids': () => [200, []] })
    const { router } = renderApp('/login?next=%2Fsearch%3Fdestination%3Dcoorg')

    await fillLogin(user)

    await waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/search?destination=coorg'))
    expect(calls.find((c) => c.key === 'POST /auth/login').data).toEqual({ email: 'asha@example.com', password: 'Correct-Horse-42' })
    expect(await screen.findByRole('button', { name: 'Account menu for Asha Rao' })).toBeInTheDocument()
  })

  it('shows the server’s message on wrong credentials', async () => {
    const user = userEvent.setup()
    fakeServer({ ...anonymous, 'POST /auth/login': () => [401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' } }] })
    renderApp('/login')

    await fillLogin(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })

  it('never redirects off-site after login', async () => {
    const user = userEvent.setup()
    fakeServer({ ...anonymous, 'POST /auth/login': () => [200, session()], 'GET /favourites/ids': () => [200, []] })
    const { router } = renderApp('/login?next=%2F%2Fevil.example%2Fphish')

    await fillLogin(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it.each([
    ['/trips', '/trips'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['/\\evil.example', '/'],
    [null, '/'],
  ])('safeNext(%s) → %s', (next, expected) => {
    expect(safeNext(next)).toBe(expected)
  })
})

describe('route guards', () => {
  it('sends anonymous visitors to login with a return path', async () => {
    fakeServer(anonymous)
    const { router } = renderApp('/account')

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Faccount')
  })

  it('shows a forbidden page to the wrong account type', async () => {
    fakeServer({ 'POST /auth/refresh': () => [200, session({ ...USER, role: 'owner' })] })
    renderApp('/favourites')

    expect(await screen.findByRole('heading', { name: 'You don’t have access to this page' })).toBeInTheDocument()
  })

  it('restores the session from the refresh cookie on page load', async () => {
    fakeServer({ 'POST /auth/refresh': () => [200, session()], 'GET /favourites/ids': () => [200, []] })
    renderApp('/account')

    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Asha Rao')).toBeInTheDocument()
  })
})

describe('API client', () => {
  it('refreshes once for concurrent 401s and retries each request', async () => {
    setAccessToken('expired-token')
    let refreshes = 0
    const calls = fakeServer({
      'POST /auth/refresh': async () => {
        refreshes += 1
        await new Promise((r) => setTimeout(r, 20))
        return [200, session()]
      },
      'GET /users/me': (config) =>
        config.headers.Authorization === 'Bearer token-123' ? [200, USER] : [401, { error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }],
    })

    const results = await Promise.all([apiClient.get('/users/me'), apiClient.get('/users/me'), apiClient.get('/users/me')])

    expect(results.every((r) => r.data.name === 'Asha Rao')).toBe(true)
    expect(refreshes).toBe(1)
    expect(calls.filter((c) => c.key === 'GET /users/me')).toHaveLength(6) // 3 failed + 3 retried
  })
})

describe('sign-up', () => {
  it('validates before sending and maps server field errors', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({
      ...anonymous,
      'POST /auth/signup': () => [422, { error: { code: 'VALIDATION_ERROR', message: 'Invalid', details: { fields: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] } } }],
    })
    renderApp('/signup')

    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Enter your name')).toBeInTheDocument()
    expect(calls.some((c) => c.key === 'POST /auth/signup')).toBe(false)

    await user.type(screen.getByLabelText('Full name'), 'Asha Rao')
    await user.type(screen.getByLabelText('Email'), 'asha@example.com')
    await user.type(screen.getByLabelText('Password'), 'Monsoon-Trail-2026')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('value is not a valid email address')).toBeInTheDocument()
    expect(calls.find((c) => c.key === 'POST /auth/signup').data).toMatchObject({ account_type: 'customer', email: 'asha@example.com' })
  })

  it('creates owner accounts from the owner registration page', async () => {
    const user = userEvent.setup()
    const calls = fakeServer({ ...anonymous, 'POST /auth/signup': () => [201, session({ ...USER, role: 'owner' })] })
    const { router } = renderApp('/owners/register')

    await user.type(screen.getByLabelText('Full name'), 'Ravi Kumar')
    await user.type(screen.getByLabelText('Email'), 'ravi@example.com')
    await user.type(screen.getByLabelText('Password'), 'Coffee-Estate-2026')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Create owner account' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/owner'))
    expect(calls.find((c) => c.key === 'POST /auth/signup').data.account_type).toBe('owner')
  })
})

describe('favourites', () => {
  it('lets a signed-in customer save a resort from a card', async () => {
    const user = userEvent.setup()
    const saved = []
    const calls = fakeServer({
      'POST /auth/refresh': () => [200, session()],
      'GET /favourites/ids': () => [200, [...saved]],
      'PUT /favourites/r1': () => {
        saved.push('r1')
        return [204, null]
      },
    })
    renderApp('/')
    const section = await screen.findByRole('region', { name: 'Featured resorts' })
    const heart = await within(section).findByRole('button', { name: 'Save Misty Fern Estate Stay to favourites' })

    await user.click(heart)

    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /favourites/r1')).toBe(true))
    expect(await within(section).findByRole('button', { name: 'Remove Misty Fern Estate Stay from favourites' })).toHaveAttribute('aria-pressed', 'true')
  })
})
