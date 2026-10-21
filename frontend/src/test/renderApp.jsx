import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { AuthProvider } from '../features/auth/AuthProvider'
import { ToastProvider } from '../components/ui/Toast'
import { routes as appRoutes } from '../routes/router'

/** Render the real app (all routes and providers) at `path`. */
export function renderApp(path = '/', { routes = appRoutes } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { router, queryClient, ...utils }
}
