import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, ExternalLink, Pencil, Plus } from 'lucide-react'
import { ownerApi } from '../../api/owner'
import { toApiError } from '../../api/client'
import { ErrorState, Skeleton, Spinner } from '../../components/ui/States'
import { FormAlert, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import ImageUploader from '../../features/owner/ImageUploader'
import RoomTypeForm from '../../features/owner/RoomTypeForm'
import { useCategories, useDestinations } from '../../features/catalog/queries'
import { ResortStatusBadge } from './OwnerResortsPage'
import { BED_LABELS, MEAL_PLAN_LABELS, PROPERTY_TYPE_LABELS } from '../../utils/labels'
import { formatINR } from '../../utils/format'

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean)

const PRESETS = {
  flexible: [[7, 100], [2, 50], [0, 0]],
  moderate: [[14, 100], [5, 50], [0, 0]],
  strict: [[21, 50], [0, 0]],
}

function Card({ id, title, description, children, onSave, saving, dirty = true }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
      <h2 id={`${id}-h`} className="font-display text-2xl text-forest-900">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      <div className="mt-5">{children}</div>
      {onSave && (
        <button type="button" onClick={onSave} disabled={saving || !dirty} className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 hover:bg-forest-700 disabled:opacity-50">
          {saving && <Spinner />} Save {title.toLowerCase()}
        </button>
      )}
    </section>
  )
}

function CheckGroup({ options, value, onChange, legend }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-forest-900">{legend}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label key={o.slug} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-forest-800"
              checked={value.includes(o.slug)}
              onChange={() => onChange(value.includes(o.slug) ? value.filter((v) => v !== o.slug) : [...value, o.slug])}
            />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Local form state for one editor section. It's initialised once per listing — NOT on every
 * refetch — so saving one section never wipes unsaved edits in another.
 */
function useSection(resort, pick) {
  const [form, setForm] = useState(() => pick(resort))
  useEffect(() => setForm(pick(resort)), [resort.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return [form, setForm]
}

export default function ResortEditorPage() {
  const { resortId } = useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const resortQuery = useQuery({ queryKey: ['owner', 'resort', resortId], queryFn: () => ownerApi.resort(resortId) })
  const roomsQuery = useQuery({ queryKey: ['owner', 'rooms', resortId], queryFn: () => ownerApi.rooms(resortId) })

  useEffect(() => {
    if (resortQuery.data) document.title = `Edit ${resortQuery.data.name} · Vistara Stays`
  }, [resortQuery.data])

  if (resortQuery.error) return <ErrorState error={resortQuery.error} onRetry={resortQuery.refetch} />
  if (resortQuery.isPending) return <Skeleton className="h-96" />

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['owner'] })
  }
  return <Editor resort={resortQuery.data} rooms={roomsQuery.data ?? []} refresh={refresh} toast={toast} />
}

function Editor({ resort, rooms, refresh, toast }) {
  const { data: categories = [] } = useCategories()
  const { data: destinations = [] } = useDestinations()
  const [saving, setSaving] = useState(null)
  const [error, setError] = useState(null)
  const [editingRoom, setEditingRoom] = useState(null) // room object, 'new' or null
  const byKind = (kind) => categories.filter((c) => c.kind === kind)

  const [details, setDetails] = useSection(resort, (r) => ({
    name: r.name,
    destination: r.destination_slug,
    property_type: r.property_type,
    booking_mode: r.booking_mode,
    description: r.description ?? '',
    highlights: (r.highlights ?? []).join('\n'),
    categories: r.categories ?? [],
  }))
  const [location, setLocation] = useSection(resort, (r) => ({
    line1: r.address?.line1 ?? '',
    line2: r.address?.line2 ?? '',
    town: r.address?.town ?? '',
    district: r.address?.district ?? '',
    pincode: r.address?.pincode ?? '',
    lat: r.location ? r.location.coordinates[1] : '',
    lng: r.location ? r.location.coordinates[0] : '',
    attractions: (r.nearby_attractions ?? []).map((a) => a.name).join('\n'),
    contact_phone: r.contact?.phone ?? '',
    contact_email: r.contact?.email ?? '',
  }))
  const [features, setFeatures] = useSection(resort, (r) => ({ amenities: r.amenities ?? [], surroundings: r.surroundings ?? [] }))
  const [policies, setPolicies] = useSection(resort, (r) => ({
    ...r.policies,
    house_rules: (r.policies.house_rules ?? []).join('\n'),
    accessibility: (r.policies.accessibility ?? []).join('\n'),
    preset: r.policies.cancellation_policy.code,
  }))
  const [images, setImages] = useSection(resort, (r) => r.images ?? [])

  const save = async (section, body) => {
    setSaving(section)
    setError(null)
    try {
      const updated = await ownerApi.updateResort(resort.id, body)
      refresh()
      toast.success(updated.status === 'pending_review' && resort.status === 'published' ? 'Saved. These changes will be reviewed before going live.' : 'Saved')
    } catch (e) {
      setError(toApiError(e).message)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(null)
    }
  }

  const act = async (action) => {
    setSaving(action)
    setError(null)
    try {
      await (action === 'submit' ? ownerApi.submitResort(resort.id) : ownerApi.archiveResort(resort.id))
      refresh()
      toast.success(action === 'submit' ? 'Submitted for review. We’ll email you when it’s approved.' : 'Property archived.')
    } catch (e) {
      const details = e?.response?.data?.error?.details?.missing
      setError(details ? `Still needed: ${details.join(', ')}.` : toApiError(e).message)
    } finally {
      setSaving(null)
    }
  }

  const tiers = PRESETS[policies.preset]
    ? PRESETS[policies.preset].map(([d, p]) => ({ days_before_check_in: d, refund_pct: p }))
    : policies.cancellation_policy.tiers
  const archived = resort.status === 'archived'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/owner/resorts" className="text-sm font-medium text-forest-700 hover:underline">
            ← Properties
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl text-forest-900">{resort.name}</h1>
            <ResortStatusBadge status={resort.status} />
          </div>
        </div>
        {resort.status === 'published' && (
          <a href={`/resorts/${resort.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-forest-700 hover:underline">
            View public page <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="rounded-2xl bg-cream-100 p-4 text-sm">
        {resort.status === 'draft' && <p>This listing is a draft — only you can see it. Complete the sections below, then submit it for review.</p>}
        {resort.status === 'pending_review' && <p>Submitted for review. Our team usually checks listings within two working days.</p>}
        {resort.status === 'rejected' && (
          <p className="flex items-start gap-2 text-clay-600">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Changes requested: {resort.rejection_reason}. Update the listing and submit again.
          </p>
        )}
        {resort.status === 'published' && <p>Live and bookable. Changing the name, destination, type, address or map location sends it back for a quick review.</p>}
        {resort.status === 'suspended' && <p className="text-clay-600">Hidden from guests by an administrator: {resort.suspended_reason}</p>}
        {resort.missing?.length > 0 && ['draft', 'rejected'].includes(resort.status) && <p className="mt-2 text-ink-600">Still needed: {resort.missing.join(' · ')}</p>}
        {['draft', 'rejected'].includes(resort.status) && (
          <button type="button" disabled={saving === 'submit'} onClick={() => act('submit')} className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-clay-600 px-5 text-sm font-semibold text-white hover:bg-clay-500 disabled:opacity-60">
            {saving === 'submit' && <Spinner />} Submit for review
          </button>
        )}
      </div>
      <FormAlert>{error}</FormAlert>

      <fieldset disabled={archived} className="space-y-6">
        <Card
          id="details"
          title="Details"
          saving={saving === 'details'}
          onSave={() =>
            save('details', {
              name: details.name,
              destination: details.destination,
              property_type: details.property_type,
              booking_mode: details.booking_mode,
              description: details.description,
              highlights: lines(details.highlights).slice(0, 8),
              categories: details.categories,
            })
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Property name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            <TextField as="select" label="Destination" value={details.destination} onChange={(e) => setDetails({ ...details, destination: e.target.value })}>
              {destinations.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </TextField>
            <TextField as="select" label="Type" value={details.property_type} onChange={(e) => setDetails({ ...details, property_type: e.target.value })}>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </TextField>
            <TextField as="select" label="Booking confirmation" value={details.booking_mode} onChange={(e) => setDetails({ ...details, booking_mode: e.target.value })} hint="Request mode: you confirm each paid booking within 24 hours.">
              <option value="instant">Instant — confirmed when paid</option>
              <option value="request">On request — you confirm each booking</option>
            </TextField>
            <TextField as="textarea" className="sm:col-span-2" label="Description" value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} hint={`${details.description.length} characters (at least 50)`} />
            <TextField as="textarea" className="sm:col-span-2" label="Highlights (one per line, up to 8)" value={details.highlights} onChange={(e) => setDetails({ ...details, highlights: e.target.value })} />
          </div>
          <div className="mt-5">
            <CheckGroup legend="Categories" options={byKind('category')} value={details.categories} onChange={(categories) => setDetails({ ...details, categories })} />
          </div>
        </Card>

        <Card
          id="location"
          title="Location"
          description="The street address is shared with guests only after their booking is confirmed."
          saving={saving === 'location'}
          onSave={() =>
            save('location', {
              address: { line1: location.line1, line2: location.line2 || null, town: location.town, district: location.district, pincode: location.pincode || null },
              ...(location.lat !== '' && location.lng !== '' ? { location: { lat: Number(location.lat), lng: Number(location.lng) } } : {}),
              nearby_attractions: lines(location.attractions).slice(0, 12).map((name) => ({ name })),
              contact: { phone: location.contact_phone || null, email: location.contact_email || null },
            })
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label="Street address" value={location.line1} onChange={(e) => setLocation({ ...location, line1: e.target.value })} />
            <TextField label="Area / landmark (optional)" value={location.line2} onChange={(e) => setLocation({ ...location, line2: e.target.value })} />
            <TextField label="Town" value={location.town} onChange={(e) => setLocation({ ...location, town: e.target.value })} />
            <TextField label="District" value={location.district} onChange={(e) => setLocation({ ...location, district: e.target.value })} />
            <TextField label="PIN code" inputMode="numeric" value={location.pincode} onChange={(e) => setLocation({ ...location, pincode: e.target.value })} />
            <TextField label="Latitude" type="number" step="0.00001" value={location.lat} onChange={(e) => setLocation({ ...location, lat: e.target.value })} hint="On openstreetmap.org, right-click your property → Show address to copy coordinates." />
            <TextField label="Longitude" type="number" step="0.00001" value={location.lng} onChange={(e) => setLocation({ ...location, lng: e.target.value })} />
            <TextField label="Front desk phone" type="tel" value={location.contact_phone} onChange={(e) => setLocation({ ...location, contact_phone: e.target.value })} placeholder="+919876543210" />
            <TextField label="Reservations email" type="email" value={location.contact_email} onChange={(e) => setLocation({ ...location, contact_email: e.target.value })} />
            <TextField as="textarea" className="sm:col-span-2" label="Nearby attractions (one per line)" value={location.attractions} onChange={(e) => setLocation({ ...location, attractions: e.target.value })} />
          </div>
        </Card>

        <Card id="amenities" title="Amenities" saving={saving === 'amenities'} onSave={() => save('amenities', features)}>
          <div className="space-y-5">
            <CheckGroup legend="Amenities" options={byKind('amenity')} value={features.amenities} onChange={(amenities) => setFeatures({ ...features, amenities })} />
            <CheckGroup legend="Surroundings" options={byKind('surrounding')} value={features.surroundings} onChange={(surroundings) => setFeatures({ ...features, surroundings })} />
          </div>
        </Card>

        <Card
          id="policies"
          title="Policies"
          description="Policy changes apply to new bookings only — existing bookings keep the terms they were made with."
          saving={saving === 'policies'}
          onSave={() =>
            save('policies', {
              policies: {
                check_in_time: policies.check_in_time,
                check_out_time: policies.check_out_time,
                child_free_age: Number(policies.child_free_age),
                pets_allowed: policies.pets_allowed,
                smoking_allowed: policies.smoking_allowed,
                id_required: true,
                meals_note: policies.meals_note || null,
                house_rules: lines(policies.house_rules),
                accessibility: lines(policies.accessibility),
                cancellation_policy: { code: policies.preset, description: null, tiers },
              },
            })
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Check-in from" type="time" value={policies.check_in_time} onChange={(e) => setPolicies({ ...policies, check_in_time: e.target.value })} />
            <TextField label="Check-out by" type="time" value={policies.check_out_time} onChange={(e) => setPolicies({ ...policies, check_out_time: e.target.value })} />
            <TextField label="Children stay free under age" type="number" min="0" max="12" value={policies.child_free_age} onChange={(e) => setPolicies({ ...policies, child_free_age: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-forest-800" checked={policies.pets_allowed} onChange={(e) => setPolicies({ ...policies, pets_allowed: e.target.checked })} /> Pets allowed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-forest-800" checked={policies.smoking_allowed} onChange={(e) => setPolicies({ ...policies, smoking_allowed: e.target.checked })} /> Smoking allowed (designated areas)
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-semibold text-forest-900">Cancellation policy</legend>
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map((p) => (
                <label key={p} className={`cursor-pointer rounded-full px-4 py-2 text-sm ring-1 ${policies.preset === p ? 'bg-forest-800 text-cream-50 ring-forest-800' : 'ring-forest-900/15'}`}>
                  <input type="radio" name="preset" className="sr-only" checked={policies.preset === p} onChange={() => setPolicies({ ...policies, preset: p })} />
                  {p[0].toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
            <ul className="mt-3 text-sm text-ink-600">
              {tiers.map((t) => (
                <li key={t.days_before_check_in}>
                  {t.days_before_check_in > 0 ? `${t.days_before_check_in}+ days before check-in` : 'After that'}: {t.refund_pct}% refund
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField as="textarea" label="House rules (one per line)" value={policies.house_rules} onChange={(e) => setPolicies({ ...policies, house_rules: e.target.value })} />
            <TextField as="textarea" label="Accessibility (one per line)" value={policies.accessibility} onChange={(e) => setPolicies({ ...policies, accessibility: e.target.value })} />
            <TextField as="textarea" className="sm:col-span-2" label="Meals note (optional)" value={policies.meals_note ?? ''} onChange={(e) => setPolicies({ ...policies, meals_note: e.target.value })} />
          </div>
        </Card>

        <Card id="photos" title="Photos" description="At least 3 photos. The first one is the cover." saving={saving === 'photos'} onSave={() => save('photos', { images })}>
          <ImageUploader images={images} onChange={setImages} />
        </Card>

        <section id="rooms" aria-labelledby="rooms-h" className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="rooms-h" className="font-display text-2xl text-forest-900">
              Rooms
            </h2>
            {editingRoom === null && (
              <button type="button" onClick={() => setEditingRoom('new')} className="inline-flex h-9 items-center gap-2 rounded-full bg-forest-800 px-4 text-sm font-medium text-cream-50">
                <Plus className="size-4" aria-hidden="true" /> Add room type
              </button>
            )}
          </div>
          <div className="mt-5 space-y-3">
            {editingRoom === 'new' && (
              <RoomTypeForm
                onCancel={() => setEditingRoom(null)}
                onSave={async (body) => {
                  await ownerApi.createRoom(resort.id, body)
                  setEditingRoom(null)
                  refresh()
                  toast.success('Room type added')
                }}
              />
            )}
            {rooms.length === 0 && editingRoom !== 'new' && <p className="text-ink-600">No room types yet.</p>}
            {rooms.map((room) =>
              editingRoom?.id === room.id ? (
                <RoomTypeForm
                  key={room.id}
                  room={room}
                  onCancel={() => setEditingRoom(null)}
                  onSave={async (body) => {
                    await ownerApi.updateRoom(room.id, body)
                    setEditingRoom(null)
                    refresh()
                    toast.success('Room type saved')
                  }}
                />
              ) : (
                <div key={room.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ring-1 ring-forest-900/10">
                  <div>
                    <p className="font-medium text-ink-900">
                      {room.name} {room.status === 'inactive' && <span className="text-xs text-clay-600">(inactive)</span>}
                    </p>
                    <p className="text-sm text-ink-600">
                      {room.total_units} rooms · up to {room.max_occupancy} guests · {room.beds.map((b) => `${b.count} ${BED_LABELS[b.type]}`).join(' + ')} · {MEAL_PLAN_LABELS[room.meal_plan]}
                    </p>
                    <p className="text-sm">
                      {formatINR(room.base_rate_paise)} weekdays{room.weekend_rate_paise ? ` · ${formatINR(room.weekend_rate_paise)} Fri & Sat` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/owner/calendar?room=${room.id}`} className="h-9 rounded-full px-4 text-sm leading-9 font-medium ring-1 ring-forest-900/15 hover:bg-forest-100">
                      Rates & availability
                    </Link>
                    <button type="button" onClick={() => setEditingRoom(room)} className="inline-flex h-9 items-center gap-1 rounded-full px-4 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100">
                      <Pencil className="size-3.5" aria-hidden="true" /> Edit
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      </fieldset>

      {!archived && resort.status !== 'pending_review' && (
        <div className="border-t border-forest-900/10 pt-6">
          <button type="button" onClick={() => window.confirm('Archive this property? It will be hidden and can no longer be booked.') && act('archive')} className="text-sm font-medium text-clay-600 hover:underline">
            Archive this property
          </button>
        </div>
      )}
    </div>
  )
}
