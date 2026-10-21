import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { router } from './routes/router'
import { AuthProvider } from './features/auth/AuthProvider'
import { ToastProvider } from './components/ui/Toast'
// Self-hosted fonts (no request to Google at runtime).
import '@fontsource-variable/fraunces'
import '@fontsource-variable/inter'
import './index.css'

// One cache for all server data (resorts, bookings, ...). Data is considered fresh for 30s.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't retry client errors (404, 403...); retry network/server errors once.
      retry: (count, error) => count < 1 && !(error?.response?.status >= 400 && error?.response?.status < 500),
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
