import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { Building2, Heart, Menu, User, X } from 'lucide-react'
import Logo from './Logo'
import UserMenu, { menuLinksFor } from './UserMenu'
import NotificationBell from './NotificationBell'
import { useAuth } from '../../features/auth/AuthProvider'
import { cn } from '../../utils/cn'

const LINKS = [
  { to: '/destinations', label: 'Destinations' },
  { to: '/search', label: 'Stays' },
  { to: '/favourites', label: 'Favourites', icon: Heart },
]

/**
 * `overlay` = transparent over the hero image until the user scrolls, then solid.
 * Profile/avatar menu replaces "Log in" once authentication exists (Phase 5).
 */
export default function Navbar({ overlay = false }) {
  const { user, status, logout } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (!overlay) return undefined
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [overlay])

  // Close the mobile menu after navigating, and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname])
  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const transparent = overlay && !scrolled && !menuOpen
  const linkTone = transparent ? 'text-cream-50 hover:text-white' : 'text-ink-900 hover:text-forest-700'

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-colors duration-300',
        transparent ? 'bg-transparent' : 'border-b border-forest-900/5 bg-cream-50/95 shadow-sm backdrop-blur',
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo tone={transparent ? 'light' : 'dark'} />

        <ul className="ml-6 hidden items-center gap-6 md:flex">
          {LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn('text-sm font-medium transition-colors', linkTone, isActive && 'underline underline-offset-8')
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <NavLink
            to="/owners"
            className={cn('flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium', linkTone)}
          >
            <Building2 className="size-4" aria-hidden="true" />
            List your property
          </NavLink>
          {status === 'authenticated' ? (
            <>
              <NotificationBell transparent={transparent} />
              <UserMenu user={user} onLogout={logout} transparent={transparent} />
            </>
          ) : (
            <NavLink
              to="/login"
              className={cn(
                'flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                transparent ? 'bg-cream-50 text-forest-900 hover:bg-white' : 'bg-forest-800 text-cream-50 hover:bg-forest-700',
              )}
            >
              <User className="size-4" aria-hidden="true" />
              Log in
            </NavLink>
          )}
        </div>

        <button
          type="button"
          className={cn('ml-auto grid size-10 place-items-center rounded-full md:hidden', linkTone)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </nav>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-forest-900/5 bg-cream-50 px-4 pb-6 md:hidden">
          <ul className="flex flex-col py-2">
            {[...LINKS, { to: '/owners', label: 'List your property' }].map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} className="block rounded-lg px-2 py-3 text-base font-medium text-ink-900 hover:bg-forest-100">
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          {status === 'authenticated' ? (
            <div className="border-t border-forest-900/10 pt-3">
              <p className="px-2 pb-2 text-sm text-ink-600">Signed in as {user.name}</p>
              <ul>
                {menuLinksFor(user).map(({ to, label }) => (
                  <li key={to}>
                    <NavLink to={to} className="block rounded-lg px-2 py-3 font-medium text-ink-900 hover:bg-forest-100">
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={logout} className="mt-2 h-11 w-full rounded-full font-semibold text-clay-600 ring-1 ring-clay-600/30">
                Log out
              </button>
            </div>
          ) : (
            <NavLink to="/login" className="flex h-11 items-center justify-center gap-2 rounded-full bg-forest-800 font-semibold text-cream-50">
              <User className="size-4" aria-hidden="true" />
              Log in or sign up
            </NavLink>
          )}
        </div>
      )}
    </header>
  )
}
