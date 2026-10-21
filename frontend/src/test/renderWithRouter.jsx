import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'

/** Shows the current URL so tests can assert where navigation went. */
export function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

/**
 * Render `ui` at `initialPath` inside a real (in-memory) router. Any other path renders
 * <LocationDisplay/> so navigation can be asserted.
 */
export function renderWithRouter(ui, { initialPath = '/' } = {}) {
  const router = createMemoryRouter(
    [
      { path: initialPath.split('?')[0], element: ui },
      { path: '*', element: <LocationDisplay /> },
    ],
    { initialEntries: [initialPath] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}
