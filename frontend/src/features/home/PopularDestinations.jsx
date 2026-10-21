import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import Button from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/States'
import DestinationCard, { DestinationCardSkeleton } from '../../components/destination/DestinationCard'
import { useDestinations } from '../catalog/queries'
import { STATE_NAMES, STATE_ORDER } from '../../utils/labels'
import { cn } from '../../utils/cn'

export default function PopularDestinations() {
  const [state, setState] = useState('all')
  const { data, isPending, error, refetch } = useDestinations()

  const shown =
    state === 'all'
      ? (data ?? []).filter((d) => d.featured_rank < 1000).slice(0, 8)
      : (data ?? []).filter((d) => d.state === state)

  const filters = [{ value: 'all', label: 'Popular' }, ...STATE_ORDER.map((s) => ({ value: s, label: STATE_NAMES[s] }))]

  return (
    <Section
      id="destinations"
      eyebrow="Where to go"
      title="Popular destinations"
      description={data ? `${data.length} destinations across the hills, coasts and backwaters of the south.` : ' '}
      action={
        <Button to="/destinations" variant="outline" size="sm">
          All destinations <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      }
    >
      <div role="group" aria-label="Filter destinations by state" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={state === f.value}
            onClick={() => setState(f.value)}
            className={cn(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              state === f.value ? 'bg-forest-800 text-cream-50' : 'bg-white text-ink-900 ring-1 ring-forest-900/10 hover:bg-forest-100',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load destinations" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={isPending}>
          {isPending
            ? Array.from({ length: 8 }, (_, i) => (
                <li key={i}>
                  <DestinationCardSkeleton />
                </li>
              ))
            : shown.map((d) => (
                <li key={d.slug}>
                  <DestinationCard destination={d} />
                </li>
              ))}
        </ul>
      )}
    </Section>
  )
}
