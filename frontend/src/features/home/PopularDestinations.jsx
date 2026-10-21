import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import Button from '../../components/ui/Button'
import DestinationCard from '../../components/destination/DestinationCard'
import { DESTINATIONS, DESTINATIONS_BY_SLUG, STATE_ORDER } from '../../data/destinations'
import { STATE_NAMES } from '../../utils/format'
import { cn } from '../../utils/cn'

const FEATURED = ['coorg', 'munnar', 'alleppey', 'ooty', 'hampi', 'wayanad', 'araku-valley', 'gokarna']

export default function PopularDestinations() {
  const [state, setState] = useState('all')

  const shown =
    state === 'all'
      ? FEATURED.map((s) => DESTINATIONS_BY_SLUG[s])
      : DESTINATIONS.filter((d) => d.state === state)

  const filters = [{ value: 'all', label: 'Popular' }, ...STATE_ORDER.map((s) => ({ value: s, label: STATE_NAMES[s] }))]

  return (
    <Section
      id="destinations"
      eyebrow="Where to go"
      title="Popular destinations"
      description={`${DESTINATIONS.length} destinations across the hills, coasts and backwaters of the south.`}
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
              state === f.value
                ? 'bg-forest-800 text-cream-50'
                : 'bg-white text-ink-900 ring-1 ring-forest-900/10 hover:bg-forest-100',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((d) => (
          <li key={d.slug}>
            <DestinationCard destination={d} />
          </li>
        ))}
      </ul>
    </Section>
  )
}
