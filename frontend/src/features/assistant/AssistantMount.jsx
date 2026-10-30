import { Component, lazy, Suspense } from 'react'
import { useLocation } from 'react-router'

// Separate chunk: the chat code downloads after the page itself, never delaying it.
const AssistantWidget = lazy(() => import('./AssistantWidget'))

/** If the assistant ever crashes, it disappears instead of taking the page down with it. */
class AssistantBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Booking assistant crashed', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

// Checkout/payment need the guest's full attention; the owner and admin portals aren't for guests.
const HIDDEN_ON = /^\/(checkout|owner|admin)(\/|$)/

/** The floating booking assistant on the guest-facing pages. */
export default function AssistantMount() {
  const { pathname } = useLocation()
  if (HIDDEN_ON.test(pathname)) return null
  return (
    <AssistantBoundary>
      <Suspense fallback={null}>
        <AssistantWidget />
      </Suspense>
    </AssistantBoundary>
  )
}
