import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SearchX, SlidersHorizontal, X } from 'lucide-react'
import { Container } from '../components/ui/Section'
import { ErrorState, EmptyState } from '../components/ui/States'
import Pagination from '../components/ui/Pagination'
import Drawer from '../components/ui/Drawer'
import ResortCard, { ResortCardSkeleton } from '../components/resort/ResortCard'
import SearchWidget from '../features/search/SearchWidget'
import FilterPanel from '../features/search/FilterPanel'
import { useCategories, useDestinations, useResortSearch } from '../features/catalog/queries'
import { useFavouriteToggle } from '../features/favourites/useFavouriteToggle'
import { fromSearchParams } from '../features/search/searchSchema'
import {
  appliedChips,
  clearFilters,
  filterEntries,
  removeChip,
  toApiParams,
  toggleListValue,
  withParam,
} from '../features/search/searchParams'
import { PROPERTY_TYPE_LABELS, SORT_OPTIONS, STATE_NAMES } from '../utils/labels'
import { formatDate, nightsBetween } from '../utils/dates'
import { plural } from '../utils/format'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const apiParams = useMemo(() => toApiParams(params), [params])
  const { data, error, isPending, isFetching, refetch } = useResortSearch(apiParams)
  const { data: categories } = useCategories()
  const { data: destinations = [] } = useDestinations()
  const favourites = useFavouriteToggle()

  const destination = destinations.find((d) => d.slug === params.get('destination'))
  const checkIn = params.get('check_in')
  const checkOut = params.get('check_out')
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : null
  const categoryNames = Object.fromEntries((categories ?? []).map((c) => [c.slug, c.name]))
  const amenityLookup = Object.fromEntries((categories ?? []).map((c) => [c.slug, c]))

  const heading = destination ? `Stays in ${destination.name}` : params.get('q') ? `Results for “${params.get('q')}”` : 'All stays'

  useEffect(() => {
    document.title = `${heading} · Vistara Stays`
  }, [heading])

  const go = (next) => setParams(next, { preventScrollReset: true })
  const actions = {
    set: (key, value) => go(withParam(params, key, value)),
    setMany: (entries) => {
      let next = params
      for (const [key, value] of Object.entries(entries)) next = withParam(next, key, value)
      go(next)
    },
    toggle: (key, value) => go(toggleListValue(params, key, value)),
  }

  const labelFor = (key, value) => {
    switch (key) {
      case 'property_type':
        return PROPERTY_TYPE_LABELS[value] ?? value
      case 'state':
        return STATE_NAMES[value] ?? value
      case 'min_price':
        return `Min ₹${Number(value).toLocaleString('en-IN')}`
      case 'max_price':
        return `Max ₹${Number(value).toLocaleString('en-IN')}`
      case 'min_rating':
        return `${value}+ rating`
      case 'max_distance_km':
        return `Within ${value} km`
      case 'available_only':
        return 'Including unavailable'
      case 'price_basis':
        return 'Total-stay prices'
      default:
        return categoryNames[value] ?? value
    }
  }
  const chips = appliedChips(params, { labelFor })

  const panel = <FilterPanel params={params} categories={categories} facets={data?.facets} actions={actions} />

  return (
    <div className="bg-cream-50 pb-20">
      <div className="bg-forest-900 py-6">
        <Container>
          <SearchWidget
            key={params.toString()}
            initialValues={fromSearchParams(params, destinations)}
            keepParams={filterEntries(params)}
            className="shadow-none"
          />
        </Container>
      </div>

      <Container className="mt-8 grid gap-8 lg:grid-cols-[17rem_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">{panel}</div>
        </aside>

        <section aria-labelledby="results-heading" aria-busy={isFetching}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="results-heading" className="font-display text-3xl text-forest-900">
                {heading}
              </h1>
              <p className="mt-1 text-sm text-ink-600" aria-live="polite">
                {data ? plural(data.total, 'stay') : 'Searching…'}
                {nights ? ` · ${formatDate(checkIn, { withYear: false })} – ${formatDate(checkOut, { withYear: false })} (${plural(nights, 'night')})` : ' · Add dates to see total prices'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-forest-900/15 lg:hidden"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters{chips.length ? ` (${chips.length})` : ''}
              </button>
              <label className="sr-only" htmlFor="sort">
                Sort by
              </label>
              <select
                id="sort"
                value={params.get('sort') ?? 'recommended'}
                onChange={(e) => actions.set('sort', e.target.value === 'recommended' ? null : e.target.value)}
                className="h-10 rounded-full border border-forest-900/15 bg-white px-4 text-sm"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="Applied filters">
              {chips.map((chip) => (
                <li key={`${chip.key}-${chip.value}`}>
                  <button
                    type="button"
                    onClick={() => go(removeChip(params, chip))}
                    className="inline-flex items-center gap-1.5 rounded-full bg-forest-100 px-3 py-1.5 text-sm text-forest-900 hover:bg-forest-100/70"
                    aria-label={`Remove filter: ${chip.label}`}
                  >
                    {chip.label} <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => go(clearFilters(params))} className="px-2 text-sm font-medium text-clay-600 underline-offset-4 hover:underline">
                  Clear all
                </button>
              </li>
            </ul>
          )}

          <div className="mt-6">
            {error ? (
              <ErrorState error={error} onRetry={refetch} title="We couldn’t load stays" />
            ) : isPending ? (
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="flex">
                    <ResortCardSkeleton />
                  </li>
                ))}
              </ul>
            ) : data.items.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No stays match your search"
                action={
                  chips.length > 0 && (
                    <button type="button" onClick={() => go(clearFilters(params))} className="rounded-full bg-forest-800 px-5 py-2.5 text-sm font-medium text-cream-50 hover:bg-forest-700">
                      Clear filters
                    </button>
                  )
                }
              >
                {chips.length > 0 ? 'Try removing a filter or two.' : nights ? 'Try different dates or a nearby destination.' : 'Try a different destination or search term.'}
              </EmptyState>
            ) : (
              <>
                <h2 className="sr-only">Results</h2>
                <ul className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
                  {data.items.map((r) => (
                    <li key={r.id} className="flex">
                      <ResortCard
                        resort={r}
                        amenityLookup={amenityLookup}
                        linkSearch={checkIn ? `?check_in=${checkIn}&check_out=${checkOut}&adults=${params.get('adults') ?? 2}&children=${params.get('children') ?? 0}&rooms=${params.get('rooms') ?? 1}` : ''}
                        {...favourites.cardProps(r)}
                      />
                    </li>
                  ))}
                </ul>
                <Pagination
                  className="mt-10"
                  page={data.page}
                  totalPages={data.total_pages}
                  onChange={(page) => {
                    setParams(withParam(params, 'page', page === 1 ? null : page))
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              </>
            )}
          </div>
        </section>
      </Container>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => go(clearFilters(params))} className="h-11 flex-1 rounded-full text-sm font-medium ring-1 ring-forest-900/15">
              Clear all
            </button>
            <button type="button" onClick={() => setFiltersOpen(false)} className="h-11 flex-1 rounded-full bg-forest-800 text-sm font-semibold text-cream-50">
              Show {data ? plural(data.total, 'stay') : 'stays'}
            </button>
          </div>
        }
      >
        {panel}
      </Drawer>
    </div>
  )
}
