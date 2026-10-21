import { useState } from 'react'
import { useLocation } from 'react-router'

/**
 * Calls `close()` when the route changes. Uses React's "adjust state while rendering" pattern
 * (compare with the previous value) instead of an effect, avoiding an extra render pass.
 */
export function useCloseOnNavigate(close) {
  const { pathname } = useLocation()
  const [previous, setPrevious] = useState(pathname)
  if (previous !== pathname) {
    setPrevious(pathname)
    close()
  }
}
