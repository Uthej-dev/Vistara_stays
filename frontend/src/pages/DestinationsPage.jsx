import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Container } from '../components/ui/Section'
import { ErrorState } from '../components/ui/States'
import DestinationCard, { DestinationCardSkeleton } from '../components/destination/DestinationCard'
import { useDestinations } from '../features/catalog/queries'
import { DESTINATION_TYPE_LABELS, STATE_NAMES, STATE_ORDER } from '../utils/labels'
import { cn } from '../utils/cn'

export default function DestinationsPage() {
  const [params, setParams] = useSearchParams()
  const state = params.get('state')
  const type = params.get('type')
  const { data, isPending, error, refetch } = useDestinations()

  useEffect(() => {
    document.title = 'Destinations across South India · Vistara Stays'
  }, [])

  const filtered = (data ?? []).filter((d) => (!state || d.state === state) && (!type || d.types.includes(type)))
  const states = STATE_ORDER.filter((s) => !state || s === state)
  const types = [...new Set((data ?? []).flatMap((d) => d.types))]

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const chip = (active) =>
    cn('shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors', active ? 'bg-forest-800 text-cream-50' : 'bg-white ring-1 ring-forest-900/10 hover:bg-forest-100')

  return (
    <Container className="py-12">
      <h1 className="font-display text-4xl text-forest-900 sm:text-5xl">Destinations</h1>
      <p className="mt-3 max-w-2xl text-ink-600">Hill stations, beaches, backwaters, forests and heritage towns across five southern states.</p>

      <div className="mt-8 space-y-3">
        <div role="group" aria-label="Filter by state" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!state} className={chip(!state)} onClick={() => setFilter('state', null)}>
            All states
          </button>
          {STATE_ORDER.map((s) => (
            <button key={s} type="button" aria-pressed={state === s} className={chip(state === s)} onClick={() => setFilter('state', s)}>
              {STATE_NAMES[s]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!type} className={chip(!type)} onClick={() => setFilter('type', null)}>
            All types
          </button>
          {types.map((t) => (
            <button key={t} type="button" aria-pressed={type === t} className={chip(type === t)} onClick={() => setFilter('type', t)}>
              {DESTINATION_TYPE_LABELS[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState className="mt-10" error={error} onRetry={refetch} />
      ) : isPending ? (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <DestinationCardSkeleton />
            </li>
          ))}
        </ul>
      ) : (
        states.map((s) => {
          const inState = filtered.filter((d) => d.state === s)
          if (!inState.length) return null
          return (
            <section key={s} aria-labelledby={`state-${s}`} className="mt-12">
              <h2 id={`state-${s}`} className="font-display text-2xl text-forest-900">
                {STATE_NAMES[s]}
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {inState.map((d) => (
                  <li key={d.slug}>
                    <DestinationCard destination={d} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
      {data && filtered.length === 0 && <p className="mt-10 text-ink-600">No destinations match these filters.</p>}
    </Container>
  )
}
