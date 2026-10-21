import { NavLink, Outlet } from 'react-router'
import { ClipboardList, Flag, Gauge, Hotel, MapPinned, ScrollText, Settings, TicketPercent, Users } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { cn } from '../../utils/cn'

const LINKS = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/resorts', label: 'Listings', icon: Hotel },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { to: '/admin/reviews', label: 'Reviews & reports', icon: Flag },
  { to: '/admin/destinations', label: 'Destinations', icon: MapPinned },
  { to: '/admin/coupons', label: 'Coupons', icon: TicketPercent },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
]

export default function AdminShell() {
  return (
    <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Admin">
        <p className="mb-3 hidden text-xs font-semibold tracking-[0.18em] text-clay-600 uppercase lg:block">Administration</p>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-forest-800 text-cream-50' : 'text-ink-900 hover:bg-forest-100')
                }
              >
                <Icon className="size-4" aria-hidden="true" /> {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </Container>
  )
}

/** Small inline form asking for a reason before a destructive action. */
export function ReasonAction({ label, onConfirm, tone = 'danger', required = true }) {
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const reason = new FormData(e.currentTarget).get('reason')?.toString().trim()
        if (required && (!reason || reason.length < 3)) return
        onConfirm(reason || null)
        e.currentTarget.reset()
      }}
    >
      {required && (
        <>
          <label className="sr-only" htmlFor={`reason-${label}`}>
            Reason for {label.toLowerCase()}
          </label>
          <input id={`reason-${label}`} name="reason" required minLength={3} maxLength={500} placeholder="Reason (shown to the user)" className="h-9 min-w-48 flex-1 rounded-lg border border-forest-900/15 bg-white px-3 text-sm" />
        </>
      )}
      <button type="submit" className={cn('h-9 rounded-full px-4 text-sm font-semibold', tone === 'danger' ? 'text-clay-600 ring-1 ring-clay-600/30 hover:bg-clay-600/10' : 'bg-forest-800 text-cream-50 hover:bg-forest-700')}>
        {label}
      </button>
    </form>
  )
}
