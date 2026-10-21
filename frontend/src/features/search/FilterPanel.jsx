import { useEffect, useId, useState } from 'react'
import { Star } from 'lucide-react'
import { PROPERTY_TYPE_LABELS, STATE_NAMES, STATE_ORDER } from '../../utils/labels'

function Group({ title, children }) {
  return (
    <fieldset className="border-b border-forest-900/10 py-5 first:pt-0 last:border-0">
      <legend className="mb-3 text-sm font-semibold text-forest-900">{title}</legend>
      {children}
    </fieldset>
  )
}

function CheckList({ name, idPrefix, options, selected, counts = {}, onToggle }) {
  return (
    <ul className="space-y-2">
      {options.map((o) => {
        const id = `${idPrefix}-${name}-${o.value}`
        return (
          <li key={o.value} className="flex items-center gap-2.5">
            <input
              id={id}
              type="checkbox"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
              className="size-4 rounded border-forest-900/30 accent-forest-800"
            />
            <label htmlFor={id} className="flex-1 text-sm text-ink-900">
              {o.label}
            </label>
            {counts[o.value] !== undefined && <span className="text-xs text-ink-600 tabular-nums">{counts[o.value]}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function PriceRange({ min, max, basis, hasDates, onApply }) {
  const [values, setValues] = useState({ min: min ?? '', max: max ?? '' })
  const idMin = useId()
  const idMax = useId()
  useEffect(() => setValues({ min: min ?? '', max: max ?? '' }), [min, max])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onApply(values)
      }}
      className="space-y-3"
    >
      {hasDates && (
        <div className="flex gap-1 rounded-full bg-cream-100 p-1 text-xs" role="group" aria-label="Price basis">
          {['night', 'total'].map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={(basis ?? 'night') === b}
              onClick={() => onApply({ ...values, basis: b })}
              className={`flex-1 rounded-full px-3 py-1.5 font-medium ${(basis ?? 'night') === b ? 'bg-white text-forest-900 shadow-sm' : 'text-ink-600'}`}
            >
              {b === 'night' ? 'Per night' : 'Total stay'}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={idMin} className="mb-1 block text-xs text-ink-600">Min (₹)</label>
          <input
            id={idMin}
            type="number"
            min="0"
            inputMode="numeric"
            value={values.min}
            onChange={(e) => setValues((v) => ({ ...v, min: e.target.value }))}
            className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-2.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label htmlFor={idMax} className="mb-1 block text-xs text-ink-600">Max (₹)</label>
          <input
            id={idMax}
            type="number"
            min="0"
            inputMode="numeric"
            value={values.max}
            onChange={(e) => setValues((v) => ({ ...v, max: e.target.value }))}
            className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-2.5 text-sm"
          />
        </div>
        <button type="submit" className="h-10 rounded-lg bg-forest-800 px-3 text-sm font-medium text-cream-50 hover:bg-forest-700">
          Apply
        </button>
      </div>
    </form>
  )
}

/**
 * All search filters. `params` is the current URLSearchParams; `onChange(next)` receives the
 * new params. Option lists come from the categories API, counts from the search facets.
 */
export default function FilterPanel({ params, categories, facets = {}, actions }) {
  // The panel renders twice (sidebar + mobile drawer); unique ids keep labels paired correctly.
  const idPrefix = useId()
  const byKind = (kind) => (categories ?? []).filter((c) => c.kind === kind).map((c) => ({ value: c.slug, label: c.name }))
  const hasDates = Boolean(params.get('check_in'))
  const destination = params.get('destination')
  const rating = params.get('min_rating') ?? ''

  return (
    <div>
      {hasDates && (
        <Group title="Availability">
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={params.get('available_only') !== 'false'}
              onChange={(e) => actions.set('available_only', e.target.checked ? null : 'false')}
              className="size-4 accent-forest-800"
            />
            Only show stays available for my dates
          </label>
        </Group>
      )}

      <Group title={hasDates && params.get('price_basis') === 'total' ? 'Total price for your stay' : 'Price per night'}>
        <PriceRange
          min={params.get('min_price')}
          max={params.get('max_price')}
          basis={params.get('price_basis')}
          hasDates={hasDates}
          onApply={({ min, max, basis }) => actions.setMany({ min_price: min, max_price: max, price_basis: basis === 'total' ? 'total' : null })}
        />
      </Group>

      <Group title="Guest rating">
        <div className="space-y-2" role="radiogroup" aria-label="Minimum guest rating">
          {[
            ['', 'Any rating'],
            ['4.5', '4.5 and above'],
            ['4', '4 and above'],
            ['3.5', '3.5 and above'],
          ].map(([value, label]) => (
            <label key={value || 'any'} className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="min_rating"
                checked={rating === value}
                onChange={() => actions.set('min_rating', value || null)}
                className="size-4 accent-forest-800"
              />
              {value && <Star className="size-3.5 fill-clay-600 text-clay-600" aria-hidden="true" />}
              {label}
            </label>
          ))}
        </div>
      </Group>

      {!destination && (
        <Group title="State">
          <select
            aria-label="State"
            value={params.get('state') ?? ''}
            onChange={(e) => actions.set('state', e.target.value || null)}
            className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-2.5 text-sm"
          >
            <option value="">All states</option>
            {STATE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATE_NAMES[s]}
              </option>
            ))}
          </select>
        </Group>
      )}

      {destination && (
        <Group title="Distance from town centre">
          <select
            aria-label="Maximum distance from town centre"
            value={params.get('max_distance_km') ?? ''}
            onChange={(e) => actions.set('max_distance_km', e.target.value || null)}
            className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-2.5 text-sm"
          >
            <option value="">Any distance</option>
            {[2, 5, 10, 25].map((km) => (
              <option key={km} value={km}>
                Within {km} km
              </option>
            ))}
          </select>
        </Group>
      )}

      <Group title="Stay type">
        <CheckList
          idPrefix={idPrefix}
          name="property_type"
          options={Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          selected={params.getAll('property_type')}
          counts={facets.property_types}
          onToggle={(v) => actions.toggle('property_type', v)}
        />
      </Group>

      <Group title="Category">
        <CheckList idPrefix={idPrefix} name="category" options={byKind('category')} selected={params.getAll('category')} counts={facets.categories} onToggle={(v) => actions.toggle('category', v)} />
      </Group>

      <Group title="Amenities">
        <CheckList idPrefix={idPrefix} name="amenity" options={byKind('amenity')} selected={params.getAll('amenity')} counts={facets.amenities} onToggle={(v) => actions.toggle('amenity', v)} />
      </Group>

      <Group title="Surroundings">
        <CheckList idPrefix={idPrefix} name="surrounding" options={byKind('surrounding')} selected={params.getAll('surrounding')} counts={facets.surroundings} onToggle={(v) => actions.toggle('surrounding', v)} />
      </Group>
    </div>
  )
}
