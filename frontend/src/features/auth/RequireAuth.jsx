import { Navigate, Outlet, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { Container } from '../../components/ui/Section'
import { Spinner } from '../../components/ui/States'
import Button from '../../components/ui/Button'

export function FullPageSpinner() {
  return (
    <div role="status" className="grid min-h-[100svh] place-items-center text-forest-700">
      <Spinner className="size-6" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

export function Forbidden() {
  return (
    <Container className="py-24 text-center">
      <ShieldAlert className="mx-auto size-10 text-clay-600" aria-hidden="true" />
      <h1 className="mt-4 font-display text-3xl text-forest-900">You don’t have access to this page</h1>
      <p className="mt-2 text-ink-600">This area is for a different type of account.</p>
      <Button to="/" variant="outline" className="mt-6">
        Back to home
      </Button>
    </Container>
  )
}

/**
 * Route guard for the user interface. The backend enforces the same rules on every API call —
 * this only decides what to *show*.
 */
export default function RequireAuth({ roles, children }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (roles && !roles.includes(user.role)) return <Forbidden />
  return children ?? <Outlet />
}
