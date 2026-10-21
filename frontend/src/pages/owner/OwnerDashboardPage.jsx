import { useEffect } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { ownerApi } from '../../api/owner'
import { PageHeader, StatTile } from '../../features/owner/OwnerShell'
import { ErrorState, Skeleton } from '../../components/ui/States'
import Button from '../../components/ui/Button'
import { StatusBadge } from '../../components/booking/BookingBits'
import { formatDate } from '../../utils/dates'
import { plural } from '../../utils/format'
import { RESORT_STATUS_LABELS } from '../../utils/labels'

const compactINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })

export default function OwnerDashboardPage() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['owner', 'dashboard'], queryFn: ownerApi.dashboard })

  useEffect(() => {
    document.title = 'Owner dashboard · Vistara Stays'
  }, [])

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />

  const hasProperties = Object.keys(data.resorts_by_status).length > 0

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your next 30 days at a glance."
        action={
          <Button to="/owner/resorts?new=1" size="sm">
            <Plus className="size-4" aria-hidden="true" /> Add property
          </Button>
        }
      />

      {!hasProperties ? (
        <div className="rounded-3xl bg-white p-8 ring-1 ring-forest-900/5">
          <h2 className="font-display text-2xl text-forest-900">Welcome! Let’s list your first property.</h2>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-ink-600">
            <li>Add the basics, location, amenities, policies and at least 3 photos.</li>
            <li>Add your room types with prices and how many rooms you have.</li>
            <li>Submit for review — our team checks every listing before it goes live.</li>
          </ol>
          <Button to="/owner/resorts?new=1" className="mt-6">
            Start your listing
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sm:col-span-2 xl:col-span-1">
              <StatTile hero label="Occupancy, next 30 days" value={`${data.occupancy_next_30_days_pct}%`} context={`${plural(data.room_nights_sold_next_30_days, 'room-night')} booked`} />
            </div>
            <StatTile label="Booking value this month" value={compactINR.format(data.revenue_this_month_paise / 100)} context={`${plural(data.bookings_this_month, 'booking')}, before taxes`} />
            <StatTile label="Awaiting your confirmation" value={data.pending_confirmations} context={`Respond within ${data.owner_confirmation_hours} hours`} />
            <StatTile label="Open enquiries" value={data.open_enquiries} context={<Link to="/owner/enquiries" className="underline">View enquiries</Link>} />
          </div>

          <section className="mt-8 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl text-forest-900">Upcoming arrivals</h2>
              <Link to="/owner/bookings" className="text-sm font-medium text-forest-700 hover:underline">
                All reservations
              </Link>
            </div>
            {data.upcoming_arrivals.length === 0 ? (
              <p className="mt-4 text-ink-600">No arrivals in the next 30 days.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-ink-600">
                    <tr>
                      <th scope="col" className="py-2 font-medium">Guest</th>
                      <th scope="col" className="py-2 font-medium">Property · room</th>
                      <th scope="col" className="py-2 font-medium">Dates</th>
                      <th scope="col" className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-forest-900/5">
                    {data.upcoming_arrivals.map((b) => (
                      <tr key={b.id}>
                        <td className="py-3">
                          <Link to={`/owner/bookings/${b.id}`} className="font-medium text-forest-800 hover:underline">
                            {b.guest_details.name}
                          </Link>
                          <span className="block text-xs text-ink-600">{b.booking_ref}</span>
                        </td>
                        <td className="py-3">
                          {b.resort_snapshot.name}
                          <span className="block text-xs text-ink-600">{b.resort_snapshot.room_type_name}</span>
                        </td>
                        <td className="py-3">
                          {formatDate(b.check_in, { withYear: false })} → {formatDate(b.check_out, { withYear: false })}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={b.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-2xl text-forest-900">Properties</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.resorts_by_status).map(([status, count]) => (
                <li key={status} className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-forest-900/10">
                  {RESORT_STATUS_LABELS[status]}: <strong>{count}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  )
}
