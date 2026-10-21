import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Hotel, Plus } from 'lucide-react'
import { ownerApi } from '../../api/owner'
import { PageHeader } from '../../features/owner/OwnerShell'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import SmartImage from '../../components/ui/SmartImage'
import { useDestinations } from '../../features/catalog/queries'
import { toApiError } from '../../api/client'
import { PROPERTY_TYPE_LABELS, RESORT_STATUS_LABELS } from '../../utils/labels'
import { formatINR, plural } from '../../utils/format'
import { cn } from '../../utils/cn'

export const RESORT_STATUS_TONE = {
  draft: 'bg-ink-900/5 text-ink-600',
  pending_review: 'bg-clay-600/10 text-clay-600',
  published: 'bg-forest-100 text-forest-800',
  rejected: 'bg-clay-600/10 text-clay-600',
  suspended: 'bg-clay-600/10 text-clay-600',
  archived: 'bg-ink-900/5 text-ink-600',
}

export function ResortStatusBadge({ status }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', RESORT_STATUS_TONE[status])}>{RESORT_STATUS_LABELS[status]}</span>
}

function NewPropertyForm({ onCancel }) {
  const navigate = useNavigate()
  const { data: destinations = [] } = useDestinations()
  const [form, setForm] = useState({ name: '', destination: '', property_type: 'resort' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await ownerApi.createResort(form)
      navigate(`/owner/resorts/${created.id}`)
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-8 grid gap-4 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5 sm:grid-cols-3">
      <h2 className="font-display text-2xl text-forest-900 sm:col-span-3">New property</h2>
      <div className="sm:col-span-3">
        <FormAlert>{error}</FormAlert>
      </div>
      <TextField label="Property name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={3} />
      <TextField as="select" label="Destination" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} required>
        <option value="">Choose…</option>
        {destinations.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.name}
          </option>
        ))}
      </TextField>
      <TextField as="select" label="Type" value={form.property_type} onChange={(e) => setForm({ ...form, property_type: e.target.value })}>
        {Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </TextField>
      <div className="flex gap-3 sm:col-span-3">
        <SubmitButton loading={busy} disabled={!form.name || !form.destination}>
          Create draft
        </SubmitButton>
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15">
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function OwnerResortsPage() {
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['owner', 'resorts'], queryFn: ownerApi.resorts })

  useEffect(() => {
    document.title = 'Your properties · Vistara Stays'
  }, [])

  return (
    <>
      <PageHeader
        title="Properties"
        action={
          !creating && (
            <button type="button" onClick={() => setParams({ new: '1' })} className="inline-flex h-9 items-center gap-2 rounded-full bg-forest-800 px-4 text-sm font-medium text-cream-50 hover:bg-forest-700">
              <Plus className="size-4" aria-hidden="true" /> Add property
            </button>
          )
        }
      />
      {creating && <NewPropertyForm onCancel={() => setParams({})} />}
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-48" />
      ) : data.length === 0 ? (
        !creating && <EmptyState icon={Hotel} title="No properties yet">Add your first property to start taking bookings.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id}>
              <Link to={`/owner/resorts/${r.id}`} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-forest-900/5 transition-shadow hover:shadow-md">
                <SmartImage image={r.images?.[0]} alt="" sizes="120px" className="aspect-[4/3] w-28 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl text-forest-900">{r.name}</h2>
                    <ResortStatusBadge status={r.status} />
                    {r.is_sample && <span className="text-xs text-ink-600">Sample</span>}
                  </div>
                  <p className="text-sm text-ink-600">
                    {r.destination_name} · {PROPERTY_TYPE_LABELS[r.property_type]} · {plural(r.room_type_count, 'room type')}
                  </p>
                  {r.starting_price_paise > 0 && <p className="mt-1 text-sm">From {formatINR(r.starting_price_paise)}/night</p>}
                  {r.status === 'rejected' && r.rejection_reason && <p className="mt-1 text-sm text-clay-600">Changes requested: {r.rejection_reason}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
