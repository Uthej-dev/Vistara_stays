import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as authApi from '../../api/auth'
import { hasSessionHint, onSessionChange, refreshSession, setAccessToken } from '../../api/client'

const AuthContext = createContext(null)

/**
 * Holds the signed-in user. If the browser may have a session (non-secret hint cookie), it
 * silently calls /auth/refresh on page load and restores the user without logging in again.
 * status: 'loading' → 'authenticated' | 'anonymous'
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState({ status: 'loading', user: null })

  const signIn = useCallback((data) => {
    setAccessToken(data.access_token)
    setState({ status: 'authenticated', user: data.user })
  }, [])

  const signOutLocally = useCallback(() => {
    setAccessToken(null)
    setState({ status: 'anonymous', user: null })
    queryClient.removeQueries({ queryKey: ['me'] })
    queryClient.removeQueries({ queryKey: ['favourites'] })
    queryClient.removeQueries({ queryKey: ['bookings'] })
    queryClient.removeQueries({ queryKey: ['owner'] })
    queryClient.removeQueries({ queryKey: ['admin'] })
  }, [queryClient])

  useEffect(() => {
    let cancelled = false
    if (hasSessionHint()) {
      refreshSession()
        .then((data) => !cancelled && signIn(data))
        .catch(() => !cancelled && setState({ status: 'anonymous', user: null }))
    } else {
      // No session hint cookie: skip the refresh call entirely for anonymous visitors.
      setState({ status: 'anonymous', user: null })
    }
    const unsubscribe = onSessionChange((event) => {
      if (event.type === 'refreshed') setState({ status: 'authenticated', user: event.data.user })
      if (event.type === 'expired') signOutLocally()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [signIn, signOutLocally])

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === 'authenticated',
      login: async (credentials) => {
        const data = await authApi.login(credentials)
        signIn(data)
        return data.user
      },
      signup: async (body) => {
        const data = await authApi.signup(body)
        signIn(data)
        return data.user
      },
      logout: async () => {
        try {
          await authApi.logout()
        } finally {
          signOutLocally()
        }
      },
      /** Session data from change-password (new tokens) or profile edits (new user). */
      applySession: signIn,
      setUser: (user) => setState((s) => ({ ...s, user })),
      signOutLocally,
    }),
    [state, signIn, signOutLocally],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where each role lands after logging in (unless a ?next= page was requested). */
export function homeFor(role) {
  if (role === 'owner') return '/owner'
  if (role === 'admin') return '/admin'
  return '/'
}
