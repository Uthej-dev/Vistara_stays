import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { adminApi } from '../../api/admin'
import { fieldErrors, toApiError } from '../../api/client'
import { PageHeader } from '../../features/owner/OwnerShell'
import { ReasonAction } from '../../features/admin/AdminShell'
import { ReviewCard } from '../../features/reviews/ReviewBits'
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import { DESTINATION_TYPE_LABELS, STATE_NAMES } from '../../utils/labels'
import { formatDateTime, formatINR } from '../../utils/format'
import { cn } from '../../utils/cn'

function useTitle(title) {
  useEffect(() => {
    document.title = `${title} · Admin · Vistara Stays`
  }, [title])
}

// ---------- reviews & reports ----------

export function AdminReviewsPage() {
  useTitle('Reviews & reports')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState('reports')
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => adminApi.reports('open'), enabled: tab === 'reports' })
  const hidden = useQuery({ queryKey: ['admin', 'reviews', 'hidden'], queryFn: () => adminApi.reviews({ status: 'hidden' }), enabled: tab === 'hidden' })

  const run = async (fn, message) => {
    try {
      await fn()
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.success(message)
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }
  const active = tab === 'reports' ? reports : hidden

  return (
    <>
      <PageHeader title="Reviews & reports" description="Hiding or removing a review recalculates the property’s rating." />
      <div role="group" aria-label="View" className="mb-5 flex gap-2">
        {[
          ['reports', 'Open reports'],
          ['hidden', 'Hidden reviews'],
        ].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)} className={cn('rounded-full px-4 py-2 text-sm font-medium', tab === v ? 'bg-forest-800 text-cream-50' : 'bg-white ring-1 ring-forest-900/10')}>
            {l}
          </button>
        ))}
      </div>
      {active.error ? (
        <ErrorState error={active.error} onRetry={active.refetch} />
      ) : active.isPending ? (
        <Skeleton className="h-48" />
      ) : active.data.items.length === 0 ? (
        <EmptyState title={tab === 'reports' ? 'No open reports' : 'No hidden reviews'} />
      ) : tab === 'reports' ? (
        <ul className="space-y-4">
          {active.data.items.map((report) => (
            <li key={report.id} className="space-y-3 rounded-2xl bg-cream-100 p-4">
              <p className="text-sm">
                <strong>Reported as {report.reason.replace('_', ' ')}</strong> · {formatDateTime(report.created_at)}
                {report.note && ` · “${report.note}”`}
              </p>
              {report.review && <ReviewCard review={report.review} />}
              {report.review && (
                <div className="flex flex-wrap items-center gap-3">
                  <ReasonAction label="Hide review" onConfirm={(reason) => run(() => adminApi.moderateReview(report.review.id, 'hide', reason), 'Review hidden')} />
                  <button type="button" onClick={() => run(() => adminApi.dismissReport(report.id), 'Report dismissed')} className="h-9 rounded-full px-4 text-sm font-medium ring-1 ring-forest-900/15">
                    Keep review (dismiss report)
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-4">
          {active.data.items.map((review) => (
            <li key={review.id} className="space-y-3">
              <ReviewCard review={review} showResort />
              <p className="text-sm text-ink-600">Hidden: {review.moderation?.reason}</p>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => run(() => adminApi.moderateReview(review.id, 'restore'), 'Review restored')} className="h-9 rounded-full bg-forest-800 px-4 text-sm font-medium text-cream-50">
                  Restore
                </button>
                <ReasonAction label="Remove permanently" onConfirm={(reason) => run(() => adminApi.moderateReview(review.id, 'remove', reason), 'Review removed')} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------- destinations ----------

const EMPTY_DEST = { slug: '', name: '', state: 'karnataka', district: '', region: '', types: 'hill_station', best_months: '10,11,12,1,2', summary: '', lat: '', lng: '' }

export function AdminDestinationsPage() {
  useTitle('Destinations')
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'destinations'], queryFn: adminApi.destinations })
  const [form, setForm] = useState(EMPTY_DEST)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [creating, setCreating] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'destinations'] })
    queryClient.invalidateQueries({ queryKey: ['destinations'] })
  }
  const create = async (e) => {
    e.preventDefault()
    setServerError(null)
    try {
      await adminApi.createDestination({
        ...form,
        region: form.region || null,
        types: form.types.split(',').map((s) => s.trim()).filter(Boolean),
        best_months: form.best_months.split(',').map((s) => Number(s.trim())).filter(Boolean),
        lat: Number(form.lat),
        lng: Number(form.lng),
      })
      setForm(EMPTY_DEST)
      setCreating(false)
      refresh()
      toast.success('Destination added — it’s live on the site now')
    } catch (err) {
      setErrors(fieldErrors(err))
      setServerError(toApiError(err).message)
    }
  }
  const toggle = async (d) => {
    try {
      await adminApi.updateDestination(d.id, { is_active: !d.is_active })
      refresh()
    } catch (err) {
      toast.error(toApiError(err).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Destinations"
        description="Destinations are data: adding one here updates the website immediately."
        action={!creating && <button type="button" onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-2 rounded-full bg-forest-800 px-4 text-sm font-medium text-cream-50"><Plus className="size-4" aria-hidden="true" /> Add destination</button>}
      />
      {creating && (
        <form onSubmit={create} className="mb-6 grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-forest-900/5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <FormAlert>{serverError}</FormAlert>
          </div>
          <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} />
          <TextField label="URL slug" value={form.slug} onChange={set('slug')} error={errors.slug} hint="lowercase-with-dashes" />
          <TextField as="select" label="State" value={form.state} onChange={set('state')}>
            {Object.entries(STATE_NAMES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </TextField>
          <TextField label="District" value={form.district} onChange={set('district')} error={errors.district} />
          <TextField label="Region (optional)" value={form.region} onChange={set('region')} />
          <TextField label="Types (comma separated)" value={form.types} onChange={set('types')} error={errors.types} hint={Object.keys(DESTINATION_TYPE_LABELS).join(', ')} />
          <TextField label="Best months (1–12, comma separated)" value={form.best_months} onChange={set('best_months')} error={errors.best_months} />
          <TextField label="Latitude" type="number" step="0.0001" value={form.lat} onChange={set('lat')} error={errors.lat} />
          <TextField label="Longitude" type="number" step="0.0001" value={form.lng} onChange={set('lng')} error={errors.lng} />
          <TextField as="textarea" className="sm:col-span-2 lg:col-span-3" label="Summary" value={form.summary} onChange={set('summary')} error={errors.summary} />
          <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
            <SubmitButton>Add destination</SubmitButton>
            <button type="button" onClick={() => setCreating(false)} className="h-11 rounded-full px-5 text-sm ring-1 ring-forest-900/15">
              Cancel
            </button>
          </div>
        </form>
      )}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-cream-100 text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Destination</th>
                <th scope="col" className="px-4 py-3 font-medium">State</th>
                <th scope="col" className="px-4 py-3 font-medium">Featured</th>
                <th scope="col" className="px-4 py-3 font-medium">Visible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-900/5">
              {data.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3">{STATE_NAMES[d.state]}</td>
                  <td className="px-4 py-3">{d.featured_rank < 1000 ? `#${d.featured_rank}` : '—'}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={d.is_active} onChange={() => toggle(d)} className="size-4 accent-forest-800" />
                      <span className="sr-only">Show {d.name} on the site</span>
                      {d.is_active ? 'Shown' : 'Hidden'}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------- coupons ----------

const EMPTY_COUPON = { code: '', type: 'percent', value: '10', max_discount: '', min_subtotal: '', valid_from: '', valid_to: '', usage_limit: '', per_user_limit: '1' }

export function AdminCouponsPage() {
  useTitle('Coupons')
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'coupons'], queryFn: adminApi.coupons })
  const [form, setForm] = useState(EMPTY_COUPON)
  const [serverError, setServerError] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const paise = (v) => (v === '' ? null : Math.round(Number(v) * 100))
  const toBody = (c) => ({
    code: c.code,
    type: c.type,
    value: c.type === 'flat' ? paise(c.value) : Number(c.value),
    max_discount_paise: paise(c.max_discount),
    min_subtotal_paise: paise(c.min_subtotal) ?? 0,
    valid_from: c.valid_from || null,
    valid_to: c.valid_to || null,
    usage_limit: c.usage_limit === '' ? null : Number(c.usage_limit),
    per_user_limit: c.per_user_limit === '' ? null : Number(c.per_user_limit),
    is_active: true,
  })
  const create = async (e) => {
    e.preventDefault()
    setServerError(null)
    try {
      await adminApi.createCoupon(toBody(form))
      setForm(EMPTY_COUPON)
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
      toast.success('Coupon created')
    } catch (err) {
      setServerError(toApiError(err).message)
    }
  }
  const toggle = async (c) => {
    try {
      const { id, used_count, created_at, ...rest } = c // eslint-disable-line no-unused-vars
      await adminApi.updateCoupon(id, { ...rest, resort_ids: rest.resort_ids ?? null, is_active: !c.is_active })
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] })
    } catch (err) {
      toast.error(toApiError(err).message)
    }
  }
  return (
    <>
      <PageHeader title="Coupons" description="Discounts are validated on the server at quote and booking time." />
      <form onSubmit={create} className="mb-6 grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-forest-900/5 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <FormAlert>{serverError}</FormAlert>
        </div>
        <TextField label="Code" value={form.code} onChange={set('code')} className="uppercase" hint="4–20 letters/numbers" />
        <TextField as="select" label="Type" value={form.type} onChange={set('type')}>
          <option value="percent">Percent off</option>
          <option value="flat">Flat amount off (₹)</option>
        </TextField>
        <TextField label={form.type === 'percent' ? 'Percent' : 'Amount (₹)'} type="number" value={form.value} onChange={set('value')} />
        <TextField label="Max discount (₹, optional)" type="number" value={form.max_discount} onChange={set('max_discount')} />
        <TextField label="Minimum booking (₹, optional)" type="number" value={form.min_subtotal} onChange={set('min_subtotal')} />
        <TextField label="Total uses (optional)" type="number" value={form.usage_limit} onChange={set('usage_limit')} />
        <TextField label="Valid from (optional)" type="date" value={form.valid_from} onChange={set('valid_from')} />
        <TextField label="Valid to (optional)" type="date" value={form.valid_to} onChange={set('valid_to')} />
        <TextField label="Uses per customer" type="number" value={form.per_user_limit} onChange={set('per_user_limit')} />
        <div className="sm:col-span-3">
          <SubmitButton disabled={form.code.length < 4}>Create coupon</SubmitButton>
        </div>
      </form>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-40" />
      ) : data.length === 0 ? (
        <EmptyState title="No coupons yet" />
      ) : (
        <ul className="space-y-2">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-forest-900/5">
              <span>
                <strong className="font-mono">{c.code}</strong> · {c.type === 'percent' ? `${c.value}% off` : `${formatINR(c.value)} off`}
                {c.max_discount_paise ? ` (max ${formatINR(c.max_discount_paise)})` : ''} · used {c.used_count}
                {c.usage_limit ? `/${c.usage_limit}` : ''}
                {c.valid_to ? ` · until ${c.valid_to}` : ''}
              </span>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={c.is_active} onChange={() => toggle(c)} className="size-4 accent-forest-800" /> Active
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ---------- settings ----------

export function AdminSettingsPage() {
  useTitle('Settings')
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings })
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (isPending) return <Skeleton className="h-96" />
  return <SettingsForm key={JSON.stringify(data)} data={data} />
}

function SettingsForm({ data }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(() => ({
    ...data,
    tax_slabs: data.tax_slabs.map((s) => ({ upTo: s.up_to_paise_per_night == null ? '' : String(s.up_to_paise_per_night / 100), rate: String(s.rate_pct) })),
  }))
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setServerError(null)
    try {
      await adminApi.updateSettings({
        tax_slabs: form.tax_slabs.map((s, i) => ({ up_to_paise_per_night: i === form.tax_slabs.length - 1 ? null : Math.round(Number(s.upTo) * 100), rate_pct: Number(s.rate) })),
        service_fee_pct: Number(form.service_fee_pct),
        hold_minutes: Number(form.hold_minutes),
        max_advance_days: Number(form.max_advance_days),
        max_nights: Number(form.max_nights),
        max_rooms_per_booking: Number(form.max_rooms_per_booking),
        owner_confirmation_hours: Number(form.owner_confirmation_hours),
      })
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      toast.success('Settings saved. They apply to new quotes; existing bookings keep their terms.')
    } catch (err) {
      setServerError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }
  const slab = (i, key) => (e) => setForm({ ...form, tax_slabs: form.tax_slabs.map((s, j) => (j === i ? { ...s, [key]: e.target.value } : s)) })

  return (
    <>
      <PageHeader title="Platform settings" description="Every change is recorded in the audit log with before and after values." />
      <form onSubmit={save} className="space-y-6">
        <FormAlert>{serverError}</FormAlert>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
          <h2 className="font-semibold text-forest-900">GST slabs (by room price per night)</h2>
          <p className="mt-1 text-xs text-ink-600">Defaults reflect hotel GST as revised in September 2025. Verify current law with a tax professional before real use.</p>
          <ul className="mt-4 space-y-3">
            {form.tax_slabs.map((s, i) => {
              const last = i === form.tax_slabs.length - 1
              return (
                <li key={i} className="flex flex-wrap items-end gap-3">
                  <TextField label={last ? 'Above the previous slab' : 'Up to ₹ per night'} type="number" value={last ? '' : s.upTo} disabled={last} onChange={slab(i, 'upTo')} />
                  <TextField label="GST %" type="number" step="0.5" value={s.rate} onChange={slab(i, 'rate')} />
                  {form.tax_slabs.length > 1 && (
                    <button type="button" aria-label="Remove slab" onClick={() => setForm({ ...form, tax_slabs: form.tax_slabs.filter((_, j) => j !== i) })} className="mb-1 grid size-9 place-items-center rounded-lg text-clay-600 hover:bg-clay-600/10">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setForm({ ...form, tax_slabs: [{ upTo: '', rate: '' }, ...form.tax_slabs] })} className="mt-3 text-sm font-medium text-forest-700">
            + Add slab
          </button>
        </section>
        <section className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-forest-900/5 sm:grid-cols-3">
          <TextField label="Service fee (%)" type="number" step="0.5" value={form.service_fee_pct} onChange={(e) => setForm({ ...form, service_fee_pct: e.target.value })} />
          <TextField label="Hold length (minutes)" type="number" value={form.hold_minutes} onChange={(e) => setForm({ ...form, hold_minutes: e.target.value })} />
          <TextField label="Owner confirmation window (hours)" type="number" value={form.owner_confirmation_hours} onChange={(e) => setForm({ ...form, owner_confirmation_hours: e.target.value })} />
          <TextField label="Book up to (days ahead)" type="number" value={form.max_advance_days} onChange={(e) => setForm({ ...form, max_advance_days: e.target.value })} />
          <TextField label="Max nights per stay" type="number" value={form.max_nights} onChange={(e) => setForm({ ...form, max_nights: e.target.value })} />
          <TextField label="Max rooms per booking" type="number" value={form.max_rooms_per_booking} onChange={(e) => setForm({ ...form, max_rooms_per_booking: e.target.value })} />
        </section>
        <SubmitButton loading={busy}>Save settings</SubmitButton>
      </form>
    </>
  )
}

// ---------- audit log ----------

export function AdminAuditPage() {
  useTitle('Audit log')
  const [action, setAction] = useState('')
  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit', action],
    queryFn: ({ pageParam }) => adminApi.auditLogs({ action: action || undefined, before: pageParam || undefined }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_before,
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sensitive actions." />
      <label className="mb-4 flex items-center gap-2 text-sm">
        Action
        <input value={action} onChange={(e) => setAction(e.target.value.trim())} placeholder="e.g. resort.approve" className="h-10 rounded-lg border border-forest-900/15 bg-white px-3" />
      </label>
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isPending ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState title="No entries" />
      ) : (
        <>
          <ol className="divide-y divide-forest-900/5 rounded-2xl bg-white ring-1 ring-forest-900/5">
            {items.map((log) => (
              <li key={log.id} className="px-4 py-3 text-sm">
                <p>
                  <strong className="font-mono text-xs">{log.action}</strong> · {formatDateTime(log.at)} · {log.actor_role}
                  {log.actor_email ? ` (${log.actor_email})` : ''}
                </p>
                <p className="text-ink-600">
                  {log.target_type} {log.target_id}
                  {log.reason ? ` · “${log.reason}”` : ''}
                </p>
                {(log.before || log.after) && (
                  <details className="mt-1 text-xs text-ink-600">
                    <summary className="cursor-pointer">Changes</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-cream-100 p-2">{JSON.stringify({ before: log.before, after: log.after }, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {query.hasNextPage && (
            <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15">
              {query.isFetchingNextPage && <Spinner />} Load older entries
            </button>
          )}
        </>
      )}
    </>
  )
}
