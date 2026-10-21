import { useSearchParams } from 'react-router'
import { SearchX } from 'lucide-react'
import { Container } from '../components/ui/Section'
import Button from '../components/ui/Button'
import { DESTINATIONS_BY_SLUG } from '../data/destinations'
import { formatDate, nightsBetween } from '../utils/dates'

/**
 * Phase 3 placeholder: proves the search widget produces the right URL. The real results page
 * (filters, sorting, pagination against the API) is built in Phase 4.
 */
export default function SearchPage() {
  const [params] = useSearchParams()
  const destination = DESTINATIONS_BY_SLUG[params.get('destination')]
  const checkIn = params.get('check_in')
  const checkOut = params.get('check_out')

  const rows = [
    ['Destination', destination?.name ?? params.get('q') ?? 'Anywhere'],
    ['Category', params.get('category') ?? '—'],
    [
      'Dates',
      checkIn && checkOut
        ? `${formatDate(checkIn)} → ${formatDate(checkOut)} (${nightsBetween(checkIn, checkOut)} nights)`
        : 'Flexible',
    ],
    ['Guests', `${params.get('adults') ?? 2} adults, ${params.get('children') ?? 0} children, ${params.get('rooms') ?? 1} room(s)`],
  ]

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-forest-900/5">
        <SearchX className="mx-auto size-10 text-forest-700" aria-hidden="true" />
        <h1 className="mt-4 font-display text-3xl text-forest-900">Search results are on the way</h1>
        <p className="mt-2 text-ink-600">
          Live results with filters and sorting arrive in Phase 4. Here is the search you asked for:
        </p>
        <dl className="mt-6 divide-y divide-forest-900/5 text-left">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-ink-600">{label}</dt>
              <dd className="text-right font-medium text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
        <Button to="/" variant="outline" className="mt-6">
          Back to home
        </Button>
      </div>
    </Container>
  )
}
