import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCloseOnNavigate } from '../../hooks/useCloseOnNavigate'
import { ChevronDown, LogOut } from 'lucide-react'
import { cn } from '../../utils/cn'

export function menuLinksFor(user) {
  if (user.role === 'owner') {
    return [
      { to: '/owner', label: 'Owner dashboard' },
      { to: '/owner/bookings', label: 'Reservations' },
      { to: '/account', label: 'Account' },
    ]
  }
  if (user.role === 'admin') {
    return [
      { to: '/admin', label: 'Admin dashboard' },
      { to: '/account', label: 'Account' },
    ]
  }
  return [
    { to: '/trips', label: 'Your trips' },
    { to: '/favourites', label: 'Favourites' },
    { to: '/account', label: 'Account' },
  ]
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function UserMenu({ user, onLogout, transparent }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef(null)

  useCloseOnNavigate(() => setOpen(false))
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition-colors',
          transparent ? 'bg-white/15 text-cream-50 ring-1 ring-white/30 hover:bg-white/25' : 'bg-white text-ink-900 ring-1 ring-forest-900/15 hover:bg-forest-100',
        )}
      >
        <span className="grid size-8 place-items-center rounded-full bg-forest-800 text-xs font-semibold text-cream-50">{initials(user.name)}</span>
        <span className="max-w-32 truncate">{user.name.split(' ')[0]}</span>
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 mt-2 w-60 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-forest-900/10">
          <p className="px-3 py-2 text-xs text-ink-600">
            Signed in as <span className="font-medium text-ink-900">{user.email}</span>
          </p>
          <ul>
            {menuLinksFor(user).map(({ to, label }) => (
              <li key={to}>
                <Link to={to} className="block rounded-xl px-3 py-2 text-sm text-ink-900 hover:bg-forest-100">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onLogout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-clay-600 hover:bg-clay-600/10">
            <LogOut className="size-4" aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
