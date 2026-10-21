import { NavLink, Outlet } from 'react-router'
import { CalendarRange, ClipboardList, Hotel, LayoutDashboard, MessageSquare, Star } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import { cn } from '../../utils/cn'

const LINKS = [
  { to: '/owner', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/owner/resorts', label: 'Properties', icon: Hotel },
  { to: '/owner/bookings', label: 'Reservations', icon: ClipboardList },
  { to: '/owner/calendar', label: 'Rates & availability', icon: CalendarRange },
  { to: '/owner/reviews', label: 'Reviews', icon: Star },
  { to: '/owner/enquiries', label: 'Enquiries', icon: MessageSquare },
]

/** Owner portal frame: side navigation on desktop, scrollable tabs on mobile. */
export default function OwnerShell() {
  return (
    <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Owner portal">
        <p className="mb-3 hidden text-xs font-semibold tracking-[0.18em] text-clay-600 uppercase lg:block">Owner portal</p>
        <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-forest-800 text-cream-50' : 'text-ink-900 hover:bg-forest-100',
                  )
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

export function PageHeader({ title, description, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-forest-900 sm:text-4xl">{title}</h1>
        {description && <p className="mt-1 text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/** KPI tile: sentence-case label, sans-serif value (proportional figures), optional context. */
export function StatTile({ label, value, context, hero = false }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
      <p className="text-sm text-ink-600">{label}</p>
      <p className={cn('mt-1 font-sans font-semibold text-ink-900', hero ? 'text-5xl' : 'text-2xl')}>{value}</p>
      {context && <p className="mt-1 text-xs text-ink-600">{context}</p>}
    </div>
  )
}
