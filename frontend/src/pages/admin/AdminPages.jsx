import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../api/admin'
import { toApiError } from '../../api/client'
import { PageHeader, StatTile } from '../../features/owner/OwnerShell'
import { ReasonAction } from '../../features/admin/AdminShell'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { FormAlert } from '../../components/ui/Form'
import Pagination from '../../components/ui/Pagination'
import SmartImage from '../../components/ui/SmartImage'
import { StatusBadge } from '../../components/booking/BookingBits'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { ResortStatusBadge } from '../owner/OwnerResortsPage'
import { useToast } from '../../components/ui/Toast'
import { BED_LABELS, BOOKING_STATUS_LABELS, MEAL_PLAN_LABELS, PROPERTY_TYPE_LABELS, RESORT_STATUS_LABELS } from '../../utils/labels'
import { formatDate } from '../../utils/dates'
import { formatDateTime, formatINR } from '../../utils/format'
import { cn } from '../../utils/cn'

const compactINR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 })

function useTitle(title) {
  useEffect(() => {
    document.title = `${title} · Admin · Vistara Stays`
  }, [title])
}

function Tabs({ value, options, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="mb-5 flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v || 'all'} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn('rounded-full px-4 py-2 text-sm font-medium', value === v ? 'bg-forest-800 text-cream-50' : 'bg-white ring-1 ring-forest-900/10 hover:bg-forest-100')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function CountList({ title, counts, labels = {} }) {
  const entries = Object.entries(counts ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
      <h2 className="text-sm font-semibold text-forest-900">{title}</h2>
      <dl className="mt-3 space-y-1.5 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-ink-600">{labels[k] ?? k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
        {!entries.length && <p className="text-ink-600">None yet</p>}
      </dl>
    </section>
  )
}

// ---------- overview ----------

export function AdminOverviewPage() {
  useTitle('Overview')
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'metrics'], queryFn: adminApi.metrics })
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />
  return (
    <>
      <PageHeader title="Overview" description="Platform health at a glance. Sample data is excluded from booking figures." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2 xl:col-span-1">
          <StatTile hero label="Listings awaiting review" value={data.pending_approvals} context={<Link to="/admin/resorts" className="underline">Open the queue</Link>} />
        </div>
        <StatTile label="Open review reports" value={data.open_reports} context={<Link to="/admin/reviews" className="underline">Moderate</Link>} />
        <StatTile label="Gross booking value" value={compactINR.format(data.gross_booking_value_paise / 100)} context={`${data.paid_bookings} paid bookings, all time`} />
        <StatTile label="New bookings, last 30 days" value={data.bookings_last_30_days} context={`${data.new_users_last_30_days} new accounts`} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <CountList title="Users by role" counts={data.users_by_role} />
        <CountList title="Bookings by status" counts={data.bookings_by_status} labels={BOOKING_STATUS_LABELS} />
        <CountList title="Listings by status" counts={data.resorts_by_status} labels={RESORT_STATUS_LABELS} />
      </div>
    </>
  )
}

// ---------- listings ----------

export function AdminResortsPage() {
  useTitle('Listings')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'pending_review'
  const page = Number(params.get('page') ?? 1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'resorts', status, page], queryFn: () => adminApi.resorts(status, page) })
  return (
    <>
      <PageHeader title="Listings" description="Review new and changed listings before they go live." />
      <Tabs label="Listing status" value={status} onChange={(s) => setParams(s ? { status: s } : { status: '' })} options={[['pending_review', 'Awaiting review'], ['published', 'Published'], ['suspended', 'Suspended'], ['rejected', 'Changes requested'], ['draft', 'Drafts'], ['', 'All']]} />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing here">No listings with this status.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((r) => (
              <li key={r.id}>
                <Link to={`/admin/resorts/${r.id}`} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5 hover:shadow-md">
                  <SmartImage image={r.images?.[0]} alt="" sizes="120px" className="aspect-[4/3] w-24 shrink-0 rounded-xl" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg text-forest-900">{r.name}</p>
                      <ResortStatusBadge status={r.status} />
                      {r.is_sample && <span className="text-xs text-ink-600">Sample</span>}
                    </div>
                    <p className="text-sm text-ink-600">
                      {r.destination_name} · {PROPERTY_TYPE_LABELS[r.property_type]} · owner {r.owner?.name} ({r.owner?.email})
                    </p>
                    {r.submitted_at && <p className="text-xs text-ink-600">Submitted {formatDateTime(r.submitted_at)}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination className="mt-6" page={data.page} totalPages={data.total_pages} onChange={(p) => setParams({ status, page: p })} />
        </>
      )}
    </>
  )
}

export function AdminResortPage() {
  const { resortId } = useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [error, setError] = useState(null)
  const { data: r, isPending, error: loadError, refetch } = useQuery({ queryKey: ['admin', 'resort', resortId], queryFn: () => adminApi.resort(resortId) })
  useTitle(r?.name ?? 'Listing')
  if (loadError) return <ErrorState error={loadError} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />

  const decide = async (action, reason) => {
    setError(null)
    try {
      await adminApi.moderateResort(resortId, action, reason)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success(`Listing ${action === 'approve' ? 'approved' : action + 'ed'}`)
    } catch (e) {
      setError(toApiError(e).message)
    }
  }
  const p = r.policies
  return (
    <div className="space-y-6">
      <Link to="/admin/resorts" className="text-sm font-medium text-forest-700 hover:underline">
        ← Listings
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-forest-900">{r.name}</h1>
        <ResortStatusBadge status={r.status} />
      </div>
      <p className="text-sm text-ink-600">
        Owner: {r.owner?.name} · {r.owner?.email} {r.owner?.phone && `· ${r.owner.phone}`}
      </p>

      <section className="space-y-3 rounded-2xl bg-cream-100 p-5">
        <h2 className="font-semibold text-forest-900">Decision</h2>
        <FormAlert>{error}</FormAlert>
        {r.status === 'pending_review' && (
          <>
            <button type="button" onClick={() => decide('approve')} className="h-10 rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 hover:bg-forest-700">
              Approve and publish
            </button>
            <ReasonAction label="Request changes" onConfirm={(reason) => decide('reject', reason)} />
          </>
        )}
        {r.status === 'published' && <ReasonAction label="Suspend listing" onConfirm={(reason) => decide('suspend', reason)} />}
        {r.status === 'suspended' && <ReasonAction label="Reinstate listing" tone="primary" required={false} onConfirm={() => decide('unsuspend')} />}
        {!['pending_review', 'published', 'suspended'].includes(r.status) && <p className="text-sm text-ink-600">No action needed for listings that are {RESORT_STATUS_LABELS[r.status].toLowerCase()}.</p>}
        <p className="text-xs text-ink-600">Check: photos are real and appropriate, the address and map pin match the destination, prices and policies are clear.</p>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
        <h2 className="font-semibold text-forest-900">Photos</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {r.images.map((img, i) => (
            <li key={img.src + i}>
              <SmartImage image={img} sizes="200px" className="aspect-[4/3] rounded-lg" />
              <p className="mt-1 truncate text-xs text-ink-600">{img.alt}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 rounded-2xl bg-white p-5 text-sm ring-1 ring-forest-900/5 md:grid-cols-2">
        <div>
          <h2 className="font-semibold text-forest-900">Listing</h2>
          <p className="mt-2 whitespace-pre-line">{r.description || <em>No description</em>}</p>
          <p className="mt-2 text-ink-600">Amenities: {r.amenities.join(', ') || '—'}</p>
          <p className="text-ink-600">Booking mode: {r.booking_mode}</p>
        </div>
        <div>
          <h2 className="font-semibold text-forest-900">Location</h2>
          <p className="mt-2">{[r.address?.line1, r.address?.line2, r.address?.town, r.address?.district, r.address?.pincode].filter(Boolean).join(', ')}</p>
          {r.location && (
            <p className="text-ink-600">
              {r.location.coordinates[1]}, {r.location.coordinates[0]} · {r.distance_from_centre_km} km from {r.destination_name} centre ·{' '}
              <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${r.location.coordinates[1]}&mlon=${r.location.coordinates[0]}#map=14/${r.location.coordinates[1]}/${r.location.coordinates[0]}`}>
                open map
              </a>
            </p>
          )}
          <h2 className="mt-4 font-semibold text-forest-900">Policies</h2>
          <p className="mt-2 text-ink-600">
            Check-in {p.check_in_time}, check-out {p.check_out_time} · cancellation: {p.cancellation_policy.tiers.map((t) => `${t.days_before_check_in}d → ${t.refund_pct}%`).join(', ')}
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
        <h2 className="font-semibold text-forest-900">Rooms</h2>
        <ul className="mt-3 divide-y divide-forest-900/5 text-sm">
          {r.room_types.map((room) => (
            <li key={room.id} className="py-2">
              <strong>{room.name}</strong> ({room.status}) · {room.total_units} units · {room.beds.map((b) => `${b.count} ${BED_LABELS[b.type]}`).join(' + ')} · {formatINR(room.base_rate_paise)} weekday · {MEAL_PLAN_LABELS[room.meal_plan]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------- users ----------

export function AdminUsersPage() {
  useTitle('Users')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'users', search, role, page], queryFn: () => adminApi.users({ q: search || undefined, role: role || undefined, page }) })

  const act = async (user, action, reason) => {
    try {
      await adminApi.userAction(user.id, action, reason)
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success(action === 'suspend' ? `${user.name} suspended and signed out` : `${user.name} reactivated`)
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }

  return (
    <>
      <PageHeader title="Users" />
      <form
        className="mb-5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
          setPage(1)
        }}
      >
        <label className="sr-only" htmlFor="user-search">
          Search users
        </label>
        <input id="user-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" className="h-10 min-w-56 flex-1 rounded-lg border border-forest-900/15 bg-white px-3 text-sm" />
        <label className="sr-only" htmlFor="user-role">
          Role
        </label>
        <select id="user-role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }} className="h-10 rounded-lg border border-forest-900/15 bg-white px-3 text-sm">
          <option value="">All roles</option>
          <option value="customer">Customers</option>
          <option value="owner">Owners</option>
          <option value="admin">Admins</option>
        </select>
        <button type="submit" className="h-10 rounded-full bg-forest-800 px-5 text-sm font-medium text-cream-50">
          Search
        </button>
      </form>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <ul className="space-y-2">
            {data.items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5">
                <div>
                  <p className="font-medium text-ink-900">
                    {u.name} <span className="text-xs font-normal text-ink-600">· {u.role}</span>
                    {u.is_sample && <span className="text-xs font-normal text-ink-600"> · sample</span>}
                  </p>
                  <p className="text-sm text-ink-600">
                    {u.email} · {u.email_verified ? 'verified' : 'unverified'} · joined {u.created_at ? formatDate(u.created_at.slice(0, 10)) : '—'}
                  </p>
                  {u.status === 'suspended' && <p className="text-sm text-clay-600">Suspended: {u.suspended_reason}</p>}
                </div>
                {u.role !== 'admin' && u.status !== 'deleted' && (u.status === 'suspended' ? <ReasonAction label="Reactivate" tone="primary" required={false} onConfirm={() => act(u, 'reactivate')} /> : <ReasonAction label="Suspend" onConfirm={(reason) => act(u, 'suspend', reason)} />)}
              </li>
            ))}
          </ul>
          <Pagination className="mt-6" page={data.page} totalPages={data.total_pages} onChange={setPage} />
        </>
      )}
    </>
  )
}

// ---------- bookings ----------

export function AdminBookingsPage() {
  useTitle('Bookings')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'bookings', status, q, page], queryFn: () => adminApi.bookings({ status: status || undefined, q: q || undefined, page }) })
  return (
    <>
      <PageHeader title="Bookings" description="All bookings and their payment status." />
      <div className="mb-5 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="booking-ref">
          Booking reference
        </label>
        <input id="booking-ref" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Booking reference" className="h-10 rounded-lg border border-forest-900/15 bg-white px-3 text-sm uppercase" />
        <label className="sr-only" htmlFor="booking-status">
          Status
        </label>
        <select id="booking-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-10 rounded-lg border border-forest-900/15 bg-white px-3 text-sm">
          <option value="">All statuses</option>
          {Object.entries(BOOKING_STATUS_LABELS).map(([s, l]) => (
            <option key={s} value={s}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-cream-100 text-ink-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Reference</th>
                  <th scope="col" className="px-4 py-3 font-medium">Property</th>
                  <th scope="col" className="px-4 py-3 font-medium">Stay</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-900/5">
                {data.items.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <Link to={`/admin/bookings/${b.id}`} className="font-medium text-forest-800 hover:underline">
                        {b.booking_ref}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{b.resort_snapshot.name}</td>
                    <td className="px-4 py-3">
                      {formatDate(b.check_in, { withYear: false })} → {formatDate(b.check_out, { withYear: false })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.price.total_paise)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {b.payment_status.replace('_', ' ')}
                      {b.payment?.simulated && ' (simulated)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-6" page={data.page} totalPages={data.total_pages} onChange={setPage} />
        </>
      )}
    </>
  )
}

export function AdminBookingPage() {
  const { bookingId } = useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: b, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'booking', bookingId], queryFn: () => adminApi.booking(bookingId) })
  useTitle(b?.booking_ref ?? 'Booking')
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />
  const cancel = async (reason) => {
    try {
      await adminApi.cancelBooking(bookingId, reason)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success('Booking cancelled with a full refund')
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }
  return (
    <div className="space-y-6">
      <Link to="/admin/bookings" className="text-sm font-medium text-forest-700 hover:underline">
        ← Bookings
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-forest-900">{b.booking_ref}</h1>
        <StatusBadge status={b.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-2 rounded-2xl bg-white p-5 text-sm ring-1 ring-forest-900/5">
          <p>
            <strong>{b.resort_snapshot.name}</strong> · {b.resort_snapshot.room_type_name} × {b.rooms}
          </p>
          <p>
            {formatDate(b.check_in)} → {formatDate(b.check_out)} · {b.guests.adults} adults, {b.guests.children} children
          </p>
          <p>
            Lead guest: {b.guest_details.name} · {b.guest_details.email} · {b.guest_details.phone}
          </p>
          <p>Payment: {b.payment_status}{b.payment?.simulated ? ' (simulated)' : ''}</p>
          {b.payments?.map((p) => (
            <p key={p.id} className="text-ink-600">
              {p.provider} · {p.status} · {formatINR(p.amount_paise)} · {p.reference ?? p.provider_payment_id ?? ''}
            </p>
          ))}
          {b.cancellation && (
            <p className="text-clay-600">
              Cancelled by {b.cancellation.by}: {b.cancellation.reason} · refund {formatINR(b.cancellation.refund_paise)} ({b.cancellation.refund_status})
            </p>
          )}
          <h2 className="pt-3 font-semibold text-forest-900">History</h2>
          <ol className="space-y-1 text-ink-600">
            {b.status_history.map((h, i) => (
              <li key={i}>
                {formatDateTime(h.at)} — {BOOKING_STATUS_LABELS[h.status] ?? h.status} ({h.by})
              </li>
            ))}
          </ol>
          {['pending_payment', 'pending_owner', 'confirmed'].includes(b.status) && (
            <div className="pt-4">
              <ReasonAction label="Cancel with full refund" onConfirm={cancel} />
            </div>
          )}
        </section>
        <aside className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
          <PriceBreakdown price={b.price} />
        </aside>
      </div>
    </div>
  )
}
