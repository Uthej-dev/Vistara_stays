import { useEffect } from 'react'
import { BadgeCheck, CalendarRange, ClipboardList, IndianRupee } from 'lucide-react'
import { Container } from '../components/ui/Section'
import Button from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthProvider'

const STEPS = [
  { icon: ClipboardList, title: 'Create your listing', body: 'Describe your property, add photos, rooms, prices and policies.' },
  { icon: BadgeCheck, title: 'We review it', body: 'Our team checks every listing before it goes live, so guests can trust what they see.' },
  { icon: CalendarRange, title: 'Manage availability', body: 'Set weekday, weekend, seasonal and special-date prices. Block rooms for maintenance anytime.' },
  { icon: IndianRupee, title: 'Get bookings', body: 'Guests pay upfront. Choose instant confirmation or approve each request yourself.' },
]

export default function OwnersLandingPage() {
  const { user } = useAuth()
  useEffect(() => {
    document.title = 'List your property · Vistara Stays'
  }, [])
  return (
    <Container className="py-16">
      <p className="text-xs font-semibold tracking-[0.2em] text-clay-600 uppercase">For property owners</p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl text-forest-900 sm:text-5xl">Share your corner of South India with travellers</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-600">Resorts, villas, cottages, homestays and camps — list them on Vistara Stays and manage everything from one dashboard.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {user?.role === 'owner' ? (
          <Button to="/owner" size="lg">Go to your dashboard</Button>
        ) : (
          <>
            <Button to="/owners/register" size="lg">Create an owner account</Button>
            <Button to="/login?next=/owner" variant="outline" size="lg">I already have one</Button>
          </>
        )}
      </div>
      <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <span className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-800">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-semibold text-forest-900">
              {i + 1}. {title}
            </h2>
            <p className="mt-1 text-sm text-ink-600">{body}</p>
          </li>
        ))}
      </ol>
    </Container>
  )
}
