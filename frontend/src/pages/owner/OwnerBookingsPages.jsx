import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Mail } from 'lucide-react'
import { ownerApi } from '../../api/owner'
import { toApiError } from '../../api/client'
import { PageHeader } from '../../features/owner/OwnerShell'
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert } from '../../components/ui/Form'
import Pagination from '../../components/ui/Pagination'
import PriceBreakdown from '../../components/booking/PriceBreakdown'
import { StatusBadge } from '../../components/booking/BookingBits'
import { useToast } from '../../components/ui/Toast'
import { BOOKING_STATUS_LABELS } from '../../utils/labels'
import { formatDate, todayIST } from '../../utils/dates'
import { formatDateTime, formatINR, plural } from '../../utils/format'

export function OwnerBookingsPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['owner', 'bookings', status, page],
    queryFn: () => ownerApi.bookings({ status: status || undefined, page, page_size: 15 }),
  })

  useEffect(() => {
    document.title = 'Reservations · Vistara Stays'
  }, [])

  return (
    <>
      <PageHeader title="Reservations" />
      <label className="mb-4 flex items-center gap-2 text-sm">
        Status
        <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})} className="h-10 rounded-lg border border-forest-900/15 bg-white px-3">
          <option value="">All</option>
          {Object.entries(BOOKING_STATUS_LABELS)
            .filter(([s]) => s !== 'expired')
            .map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
        </select>
      </label>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No reservations here yet" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-cream-100 text-ink-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Booking</th>
                  <th scope="col" className="px-4 py-3 font-medium">Guest</th>
                  <th scope="col" className="px-4 py-3 font-medium">Stay</th>
                  <th scope="col" className="px-4 py-3 font-medium">Room</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-900/5">
                {data.items.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3">
                      <Link to={`/owner/bookings/${b.id}`} className="font-medium text-forest-800 hover:underline">
                        {b.booking_ref}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {b.guest_details.name}
                      <span className="block text-xs text-ink-600">{plural(b.guests.adults, 'adult')}{b.guests.children ? `, ${plural(b.guests.children, 'child', 'children')}` : ''}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatDate(b.check_in, { withYear: false })} → {formatDate(b.check_out, { withYear: false })}
                    </td>
                    <td className="px-4 py-3">
                      {b.resort_snapshot.name}
                      <span className="block text-xs text-ink-600">
                        {b.resort_snapshot.room_type_name} × {b.rooms}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatINR(b.price.total_paise)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-6" page={data.page} totalPages={data.total_pages} onChange={(p) => setParams({ ...(status ? { status } : {}), page: p })} />
        </>
      )}
    </>
  )
}

export function OwnerBookingPage() {
  const { bookingId } = useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: b, isPending, error, refetch } = useQuery({ queryKey: ['owner', 'booking', bookingId], queryFn: () => ownerApi.booking(bookingId) })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)

  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />

  const act = async (action) => {
    if (['reject', 'cancel'].includes(action) && reason.trim().length < 3) {
      setActionError('Please give the guest a reason (at least 3 characters).')
      return
    }
    if (action === 'cancel' && !window.confirm('Cancel this booking? The guest will get a full refund.')) return
    setBusy(action)
    setActionError(null)
    try {
      const updated = await ownerApi.bookingAction(bookingId, action, ['reject', 'cancel'].includes(action) ? reason.trim() : undefined)
      queryClient.setQueryData(['owner', 'booking', bookingId], updated)
      queryClient.invalidateQueries({ queryKey: ['owner'] })
      toast.success(`Booking ${BOOKING_STATUS_LABELS[updated.status].toLowerCase()}`)
    } catch (e) {
      setActionError(toApiError(e).message)
    } finally {
      setBusy(null)
    }
  }
  const g = b.guest_details
  const canNoShow = b.status === 'confirmed' && b.check_in <= todayIST()

  return (
    <div className="space-y-6">
      <Link to="/owner/bookings" className="text-sm font-medium text-forest-700 hover:underline">
        ← Reservations
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl text-forest-900">{b.booking_ref}</h1>
        <StatusBadge status={b.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-xl text-forest-900">Stay</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-600">Property · room</dt>
                <dd className="font-medium">
                  {b.resort_snapshot.name} · {b.resort_snapshot.room_type_name} × {b.rooms}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600">Dates</dt>
                <dd className="font-medium">
                  {formatDate(b.check_in)} → {formatDate(b.check_out)} ({plural(b.nights, 'night')})
                </dd>
              </div>
              <div>
                <dt className="text-ink-600">Guests</dt>
                <dd className="font-medium">
                  {plural(b.guests.adults, 'adult')}
                  {b.guests.children ? `, ${plural(b.guests.children, 'child', 'children')} (ages ${b.guests.child_ages.join(', ')})` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-ink-600">Booked</dt>
                <dd className="font-medium">{formatDateTime(b.created_at)}</dd>
              </div>
              {b.special_requests && (
                <div className="sm:col-span-2">
                  <dt className="text-ink-600">Special requests</dt>
                  <dd>{b.special_requests}</dd>
                </div>
              )}
            </dl>
          </section>
          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-xl text-forest-900">Lead guest</h2>
            {g.email ? (
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-600">Name</dt>
                  <dd className="font-medium">{g.name}</dd>
                </div>
                <div>
                  <dt className="text-ink-600">Phone</dt>
                  <dd className="font-medium">
                    <a href={`tel:${g.phone}`} className="underline">
                      {g.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-600">Email</dt>
                  <dd className="font-medium">
                    <a href={`mailto:${g.email}`} className="inline-flex items-center gap-1 underline">
                      <Mail className="size-3.5" aria-hidden="true" /> {g.email}
                    </a>
                  </dd>
                </div>
                {g.arrival_time && (
                  <div>
                    <dt className="text-ink-600">Expected arrival</dt>
                    <dd className="font-medium">{g.arrival_time}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink-600">
                {g.name}. Contact details are shared from {g.contact_hidden_until ? formatDate(g.contact_hidden_until) : '30 days before check-in'} to protect guest privacy.
              </p>
            )}
            <p className="mt-4 text-xs text-ink-600">Use guest details only to prepare and deliver this stay. Check photo ID for every adult at check-in.</p>
          </section>
          {b.cancellation && (
            <section className="rounded-3xl bg-white p-6 text-sm ring-1 ring-forest-900/5">
              <h2 className="font-display text-xl text-forest-900">Cancellation</h2>
              <p className="mt-2">
                By {b.cancellation.by} on {formatDateTime(b.cancellation.cancelled_at)}. {b.cancellation.reason}
              </p>
              <p className="mt-1">Refund to guest: {formatINR(b.cancellation.refund_paise)}</p>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
            <h2 className="font-display text-xl text-forest-900">Payment</h2>
            <PriceBreakdown price={b.price} className="mt-3" />
          </section>
          {['pending_owner', 'confirmed'].includes(b.status) && (
            <section className="space-y-3 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
              <h2 className="font-display text-xl text-forest-900">Actions</h2>
              <FormAlert>{actionError}</FormAlert>
              {b.status === 'pending_owner' && (
                <button type="button" disabled={Boolean(busy)} onClick={() => act('confirm')} className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-forest-800 text-sm font-semibold text-cream-50 disabled:opacity-60">
                  {busy === 'confirm' && <Spinner />} Confirm booking
                </button>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-ink-600">Reason (sent to the guest)</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20 w-full rounded-lg border border-forest-900/15 bg-white p-2" />
              </label>
              {b.status === 'pending_owner' ? (
                <button type="button" disabled={Boolean(busy)} onClick={() => act('reject')} className="flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-clay-600 ring-1 ring-clay-600/30 disabled:opacity-60">
                  {busy === 'reject' && <Spinner />} Decline (full refund)
                </button>
              ) : (
                <button type="button" disabled={Boolean(busy)} onClick={() => act('cancel')} className="flex h-10 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-clay-600 ring-1 ring-clay-600/30 disabled:opacity-60">
                  {busy === 'cancel' && <Spinner />} Cancel booking (full refund)
                </button>
              )}
              {canNoShow && (
                <button type="button" disabled={Boolean(busy)} onClick={() => act('no-show')} className="h-10 w-full rounded-full text-sm font-medium ring-1 ring-forest-900/15">
                  Mark as no-show
                </button>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

export function OwnerEnquiriesPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('open')
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['owner', 'enquiries', status], queryFn: () => ownerApi.enquiries(status) })

  useEffect(() => {
    document.title = 'Enquiries · Vistara Stays'
  }, [])

  return (
    <>
      <PageHeader title="Enquiries" description="Questions guests sent from your property pages. Reply by email." />
      <div role="group" aria-label="Filter enquiries" className="mb-4 flex gap-2">
        {['open', 'closed'].map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`rounded-full px-4 py-2 text-sm font-medium ${status === s ? 'bg-forest-800 text-cream-50' : 'bg-white ring-1 ring-forest-900/10'}`}>
            {s === 'open' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-48" />
      ) : data.length === 0 ? (
        <EmptyState icon={Mail} title={status === 'open' ? 'No open enquiries' : 'No closed enquiries'} />
      ) : (
        <ul className="space-y-3">
          {data.map((q) => (
            <li key={q.id} className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink-900">
                    {q.name} · <span className="text-ink-600">{q.resort_name}</span>
                  </p>
                  <p className="text-xs text-ink-600">{formatDateTime(q.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`mailto:${q.email}?subject=${encodeURIComponent(`Your question about ${q.resort_name}`)}`} className="h-9 rounded-full bg-forest-800 px-4 text-sm leading-9 font-medium text-cream-50">
                    Reply by email
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      await ownerApi.updateEnquiry(q.id, status === 'open' ? 'closed' : 'open')
                      queryClient.invalidateQueries({ queryKey: ['owner', 'enquiries'] })
                    }}
                    className="h-9 rounded-full px-4 text-sm font-medium ring-1 ring-forest-900/15"
                  >
                    {status === 'open' ? 'Mark done' : 'Reopen'}
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm whitespace-pre-line text-ink-900">{q.message}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
