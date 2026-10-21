import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { ownerApi } from '../../api/owner'
import { toApiError } from '../../api/client'
import { PageHeader } from '../../features/owner/OwnerShell'
import { EmptyState, ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import { addDays, formatDate, todayIST } from '../../utils/dates'
import { formatINR } from '../../utils/format'
import { cn } from '../../utils/cn'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const monthStart = (iso) => `${iso.slice(0, 7)}-01`
const monthEnd = (iso) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}
const shiftMonth = (iso, delta) => {
  const [y, m] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10)
}
const weekdayIndex = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0

function RoomPicker({ value, onChange }) {
  const resorts = useQuery({ queryKey: ['owner', 'resorts'], queryFn: ownerApi.resorts })
  const [resortId, setResortId] = useState('')
  const active = (resorts.data ?? []).filter((r) => r.status !== 'archived')
  const chosenResort = resortId || active[0]?.id
  const rooms = useQuery({ queryKey: ['owner', 'rooms', chosenResort], queryFn: () => ownerApi.rooms(chosenResort), enabled: Boolean(chosenResort) })

  useEffect(() => {
    if (!value && rooms.data?.length) onChange(rooms.data[0].id)
  }, [value, rooms.data, onChange])

  if (resorts.isPending) return <Skeleton className="h-11" />
  if (!active.length) return <EmptyState title="No properties yet">Add a property and room types first.</EmptyState>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField as="select" label="Property" value={chosenResort} onChange={(e) => { setResortId(e.target.value); onChange('') }}>
        {active.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </TextField>
      <TextField as="select" label="Room type" value={value} onChange={(e) => onChange(e.target.value)}>
        {(rooms.data ?? []).map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </TextField>
    </div>
  )
}

function BulkEditor({ roomId, onDone }) {
  const today = todayIST()
  const toast = useToast()
  const [form, setForm] = useState({ from: today, to: addDays(today, 6), price: '', clearPrice: false, blocked: '', availability: 'keep' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const apply = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { from: form.from, to: form.to }
      if (form.clearPrice) body.clear_price_override = true
      else if (form.price) body.price_override_paise = Math.round(Number(form.price) * 100)
      if (form.blocked !== '') body.blocked_units = Number(form.blocked)
      if (form.availability !== 'keep') body.closed = form.availability === 'closed'
      const result = await ownerApi.updateCalendar(roomId, body)
      if (result.conflicts.length) toast.error(`Updated, but blocks couldn’t be applied on ${result.conflicts.map((d) => formatDate(d, { withYear: false })).join(', ')} — rooms are already booked.`)
      else toast.success(`Updated ${result.updated_nights} nights`)
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={apply} className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
      <h2 className="font-display text-xl text-forest-900">Change a date range</h2>
      <p className="mt-1 text-sm text-ink-600">Leave a field empty to keep it as it is. Blocks never cancel existing bookings.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="From" type="date" min={today} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        <TextField label="To (inclusive)" type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        <TextField label="Special price (₹/night)" type="number" min="500" value={form.price} disabled={form.clearPrice} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <TextField label="Rooms blocked" type="number" min="0" value={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.value })} hint="For maintenance or private use." />
        <TextField as="select" label="Selling" value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
          <option value="keep">Keep as is</option>
          <option value="open">Open for sale</option>
          <option value="closed">Closed (stop selling)</option>
        </TextField>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" className="size-4 accent-forest-800" checked={form.clearPrice} onChange={(e) => setForm({ ...form, clearPrice: e.target.checked })} /> Remove special prices
        </label>
      </div>
      <FormAlert>{error}</FormAlert>
      <button type="submit" disabled={busy} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 hover:bg-forest-700 disabled:opacity-60">
        {busy && <Spinner />} Apply to dates
      </button>
    </form>
  )
}

function RateRules({ roomId }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = ['owner', 'rules', roomId]
  const { data: rules = [] } = useQuery({ queryKey: key, queryFn: () => ownerApi.rules(roomId) })
  const today = todayIST()
  const [form, setForm] = useState({ name: '', start_date: today, end_date: addDays(today, 30), adjustment_type: 'percent', value: '20', priority: 1 })
  const [error, setError] = useState(null)

  const add = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const value = form.adjustment_type === 'fixed_rate' ? Math.round(Number(form.value) * 100) : Number(form.value)
      await ownerApi.createRule(roomId, { ...form, value, priority: Number(form.priority) })
      queryClient.invalidateQueries({ queryKey: ['owner'] })
      setForm({ ...form, name: '' })
      toast.success('Seasonal price added')
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
      <h2 className="font-display text-xl text-forest-900">Seasonal prices</h2>
      <p className="mt-1 text-sm text-ink-600">Raise or lower prices for a season. Special date prices above override these.</p>
      {rules.length > 0 && (
        <ul className="mt-4 divide-y divide-forest-900/5">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span>
                <strong>{r.name}</strong> · {formatDate(r.start_date)} – {formatDate(r.end_date)} ·{' '}
                {r.adjustment.type === 'percent' ? `${r.adjustment.value > 0 ? '+' : ''}${r.adjustment.value}%` : `${formatINR(r.adjustment.value)}/night`} · priority {r.priority}
              </span>
              <button
                type="button"
                aria-label={`Delete ${r.name}`}
                onClick={async () => {
                  await ownerApi.deleteRule(r.id)
                  queryClient.invalidateQueries({ queryKey: ['owner'] })
                }}
                className="grid size-8 place-items-center rounded-lg text-clay-600 hover:bg-clay-600/10"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Christmas peak" />
        <TextField label="Starts" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <TextField label="Ends (inclusive)" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        <TextField as="select" label="Adjustment" value={form.adjustment_type} onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}>
          <option value="percent">Percent change</option>
          <option value="fixed_rate">Fixed nightly price (₹)</option>
        </TextField>
        <TextField label={form.adjustment_type === 'percent' ? 'Change (%)' : 'Price (₹)'} type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        <TextField label="Priority" type="number" min="0" max="100" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} hint="Higher wins when seasons overlap." />
        <div className="sm:col-span-2 lg:col-span-3">
          <FormAlert>{error}</FormAlert>
          <button type="submit" disabled={form.name.trim().length < 2} className="mt-2 h-10 rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 disabled:opacity-50">
            Add seasonal price
          </button>
        </div>
      </form>
    </section>
  )
}

export default function OwnerCalendarPage() {
  const [params, setParams] = useSearchParams()
  const roomId = params.get('room') ?? ''
  const [month, setMonth] = useState(() => monthStart(todayIST()))
  const queryClient = useQueryClient()
  const calendar = useQuery({
    queryKey: ['owner', 'calendar', roomId, month],
    queryFn: () => ownerApi.calendar(roomId, month, monthEnd(month)),
    enabled: Boolean(roomId),
  })
  const today = todayIST()
  const leading = useMemo(() => weekdayIndex(month), [month])

  useEffect(() => {
    document.title = 'Rates & availability · Vistara Stays'
  }, [])

  return (
    <>
      <PageHeader title="Rates & availability" description="See every night at a glance and adjust prices, blocks and closures." />
      <div className="space-y-6">
        <RoomPicker value={roomId} onChange={(id) => setParams(id ? { room: id } : {}, { replace: true })} />
        {roomId && (
          <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5" aria-labelledby="cal-h">
            <div className="flex items-center justify-between">
              <h2 id="cal-h" className="font-display text-xl text-forest-900">
                {new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </h2>
              <div className="flex gap-1">
                <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-9 place-items-center rounded-full hover:bg-forest-100">
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-9 place-items-center rounded-full hover:bg-forest-100">
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            {calendar.error ? (
              <ErrorState error={calendar.error} onRetry={calendar.refetch} />
            ) : calendar.isPending ? (
              <Skeleton className="mt-4 h-80" />
            ) : (
              <>
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-600" aria-hidden="true">
                  {WEEKDAYS.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <ol className="mt-1 grid grid-cols-7 gap-1">
                  {Array.from({ length: leading }, (_, i) => (
                    <li key={`pad-${i}`} aria-hidden="true" />
                  ))}
                  {calendar.data.days.map((d) => {
                    const past = d.date < today
                    const soldOut = !d.closed && d.available_units === 0
                    return (
                      <li
                        key={d.date}
                        className={cn(
                          'min-h-20 rounded-lg p-1.5 text-left text-[11px] ring-1 sm:p-2 sm:text-xs',
                          past ? 'bg-cream-100 text-ink-600/60 ring-transparent' : d.closed ? 'bg-ink-900/5 ring-ink-900/10' : soldOut ? 'bg-clay-600/10 ring-clay-600/20' : 'bg-white ring-forest-900/10',
                        )}
                      >
                        <span className="font-semibold">{Number(d.date.slice(8))}</span>
                        <span className="sr-only"> {formatDate(d.date)}</span>
                        <span className="block font-medium text-ink-900">{formatINR(d.rate_paise)}</span>
                        <span className="block">{d.closed ? 'Closed' : `${d.available_units}/${d.total_units} left`}</span>
                        {d.blocked_units > 0 && <span className="block text-clay-600">{d.blocked_units} blocked</span>}
                        {d.rate_source !== 'base' && d.rate_source !== 'weekend' && <span className="block truncate text-forest-700">{d.rate_source === 'date_override' ? 'Special' : d.rate_source.slice(5)}</span>}
                      </li>
                    )
                  })}
                </ol>
                <p className="mt-3 text-xs text-ink-600">Prices are per room per night, before taxes. “Left” = rooms still bookable.</p>
              </>
            )}
          </section>
        )}
        {roomId && <BulkEditor roomId={roomId} onDone={() => queryClient.invalidateQueries({ queryKey: ['owner', 'calendar', roomId] })} />}
        {roomId && <RateRules roomId={roomId} />}
      </div>
    </>
  )
}
