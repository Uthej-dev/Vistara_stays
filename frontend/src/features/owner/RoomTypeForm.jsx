import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import ImageUploader from './ImageUploader'
import { BED_LABELS, MEAL_PLAN_LABELS } from '../../utils/labels'
import { fieldErrors, toApiError } from '../../api/client'

const rupees = (paise) => (paise == null ? '' : String(paise / 100))
const paise = (value) => (value === '' || value == null ? null : Math.round(Number(value) * 100))

export function roomToForm(room) {
  return {
    name: room?.name ?? '',
    description: room?.description ?? '',
    max_adults: room?.max_adults ?? 2,
    max_children: room?.max_children ?? 1,
    max_occupancy: room?.max_occupancy ?? 3,
    base_occupancy: room?.base_occupancy ?? 2,
    beds: room?.beds ?? [{ type: 'queen', count: 1 }],
    size_sqft: room?.size_sqft ?? '',
    total_units: room?.total_units ?? 1,
    base_rate: rupees(room?.base_rate_paise),
    weekend_rate: rupees(room?.weekend_rate_paise),
    extra_adult: rupees(room?.extra_adult_paise ?? 0),
    extra_child: rupees(room?.extra_child_paise ?? 0),
    meal_plan: room?.meal_plan ?? 'room_only',
    images: room?.images ?? [],
    status: room?.status ?? 'active',
  }
}

function formToBody(f, isNew) {
  const body = {
    name: f.name,
    description: f.description || null,
    max_adults: Number(f.max_adults),
    max_children: Number(f.max_children),
    max_occupancy: Number(f.max_occupancy),
    base_occupancy: Number(f.base_occupancy),
    beds: f.beds.map((b) => ({ type: b.type, count: Number(b.count) })),
    size_sqft: f.size_sqft === '' ? null : Number(f.size_sqft),
    total_units: Number(f.total_units),
    base_rate_paise: paise(f.base_rate),
    weekend_rate_paise: paise(f.weekend_rate),
    extra_adult_paise: paise(f.extra_adult) ?? 0,
    extra_child_paise: paise(f.extra_child) ?? 0,
    meal_plan: f.meal_plan,
    images: f.images,
  }
  if (!isNew) body.status = f.status
  return body
}

/** Create or edit a room type. Prices are entered in rupees and sent to the API in paise. */
export default function RoomTypeForm({ room, onSave, onCancel }) {
  const [form, setForm] = useState(() => roomToForm(room))
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setServerError(null)
    setErrors({})
    try {
      await onSave(formToBody(form, !room))
    } catch (error) {
      const byField = fieldErrors(error)
      setErrors(byField)
      setServerError(toApiError(error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl bg-cream-50 p-5 ring-1 ring-forest-900/10">
      <FormAlert>{serverError}</FormAlert>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Room name" value={form.name} onChange={set('name')} error={errors.name} required />
        <TextField label="Number of identical rooms" type="number" min="1" value={form.total_units} onChange={set('total_units')} error={errors.total_units} hint="How many of this room you can sell each night." />
        <TextField as="textarea" className="sm:col-span-2" label="Description (optional)" value={form.description} onChange={set('description')} error={errors.description} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-forest-900">Occupancy (per room)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextField label="Max adults" type="number" min="1" value={form.max_adults} onChange={set('max_adults')} error={errors.max_adults} />
          <TextField label="Max children" type="number" min="0" value={form.max_children} onChange={set('max_children')} error={errors.max_children} />
          <TextField label="Max guests" type="number" min="1" value={form.max_occupancy} onChange={set('max_occupancy')} error={errors.max_occupancy} />
          <TextField label="Guests in price" type="number" min="1" value={form.base_occupancy} onChange={set('base_occupancy')} error={errors.base_occupancy} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-forest-900">Beds</legend>
        <ul className="space-y-2">
          {form.beds.map((bed, i) => (
            <li key={i} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`bed-count-${i}`}>
                Number of beds
              </label>
              <input id={`bed-count-${i}`} type="number" min="1" value={bed.count} onChange={(e) => setForm((f) => ({ ...f, beds: f.beds.map((b, j) => (j === i ? { ...b, count: e.target.value } : b)) }))} className="h-10 w-20 rounded-lg border border-forest-900/15 bg-white px-2 text-sm" />
              <label className="sr-only" htmlFor={`bed-type-${i}`}>
                Bed type
              </label>
              <select id={`bed-type-${i}`} value={bed.type} onChange={(e) => setForm((f) => ({ ...f, beds: f.beds.map((b, j) => (j === i ? { ...b, type: e.target.value } : b)) }))} className="h-10 rounded-lg border border-forest-900/15 bg-white px-2 text-sm">
                {Object.entries(BED_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {form.beds.length > 1 && (
                <button type="button" aria-label="Remove bed" onClick={() => setForm((f) => ({ ...f, beds: f.beds.filter((_, j) => j !== i) }))} className="grid size-9 place-items-center rounded-lg text-clay-600 hover:bg-clay-600/10">
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setForm((f) => ({ ...f, beds: [...f.beds, { type: 'twin', count: 1 }] }))} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-forest-700">
          <Plus className="size-4" aria-hidden="true" /> Add bed
        </button>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-forest-900">Prices (₹ per room per night, before taxes)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextField label="Weekday rate" type="number" min="500" value={form.base_rate} onChange={set('base_rate')} error={errors.base_rate_paise} />
          <TextField label="Fri & Sat rate" type="number" min="500" value={form.weekend_rate} onChange={set('weekend_rate')} error={errors.weekend_rate_paise} hint="Optional" />
          <TextField label="Extra adult" type="number" min="0" value={form.extra_adult} onChange={set('extra_adult')} error={errors.extra_adult_paise} />
          <TextField label="Extra child" type="number" min="0" value={form.extra_child} onChange={set('extra_child')} error={errors.extra_child_paise} />
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField as="select" label="Meals included" value={form.meal_plan} onChange={set('meal_plan')}>
          {Object.entries(MEAL_PLAN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </TextField>
        <TextField label="Size (sq ft, optional)" type="number" value={form.size_sqft} onChange={set('size_sqft')} error={errors.size_sqft} />
        {room && (
          <TextField as="select" label="Status" value={form.status} onChange={set('status')} hint="Inactive rooms can’t be booked.">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </TextField>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-forest-900">Room photos (optional)</p>
        <ImageUploader images={form.images} onChange={(images) => setForm((f) => ({ ...f, images }))} max={10} />
      </div>

      <div className="flex gap-3">
        <SubmitButton loading={busy}>{room ? 'Save room' : 'Add room'}</SubmitButton>
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15">
          Cancel
        </button>
      </div>
    </form>
  )
}
