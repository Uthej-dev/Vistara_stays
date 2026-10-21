import { useEffect } from 'react'
import { useParams } from 'react-router'
import { ArrowRight, CalendarDays, MapPin, Mountain } from 'lucide-react'
import { Container } from '../components/ui/Section'
import SmartImage from '../components/ui/SmartImage'
import Button from '../components/ui/Button'
import { ErrorState, EmptyState, Skeleton } from '../components/ui/States'
import ResortCard, { ResortCardSkeleton } from '../components/resort/ResortCard'
import { useDestination, useResortSearch } from '../features/catalog/queries'
import { useAmenityLookup } from '../features/catalog/useAmenityLookup'
import { useFavouriteToggle } from '../features/favourites/useFavouriteToggle'
import NotFoundPage from './NotFoundPage'
import { DESTINATION_TYPE_LABELS, STATE_NAMES } from '../utils/labels'
import { formatINR, formatMonthRange, plural } from '../utils/format'

export default function DestinationPage() {
  const { slug } = useParams()
  const { data: destination, error, isPending, refetch } = useDestination(slug)
  const stays = useResortSearch({ destination: slug, page_size: 6 })
  const amenityLookup = useAmenityLookup()
  const favourites = useFavouriteToggle()

  useEffect(() => {
    if (destination) document.title = `${destination.name} travel guide & stays · Vistara Stays`
  }, [destination])

  if (error?.response?.status === 404) return <NotFoundPage />
  if (error) return <ErrorState className="m-8" error={error} onRetry={refetch} />

  return (
    <>
      <section className="relative isolate min-h-[420px] bg-forest-800">
        {destination?.image && <SmartImage image={destination.image} priority fill sizes="100vw" className="-z-10" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-950/85 via-forest-950/30 to-forest-950/40" />
        <Container className="flex min-h-[420px] flex-col justify-end pb-10 text-cream-50">
          {isPending ? (
            <Skeleton className="h-16 w-1/2 bg-white/20" />
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-sm text-cream-100/85">
                <MapPin className="size-4" aria-hidden="true" /> {destination.district} · {STATE_NAMES[destination.state]}
                {destination.region ? ` · ${destination.region}` : ''}
              </p>
              <h1 className="mt-2 font-display text-5xl sm:text-6xl">{destination.name}</h1>
              <p className="mt-3 max-w-2xl text-lg text-cream-100/90">{destination.summary}</p>
            </>
          )}
        </Container>
      </section>

      {destination && (
        <Container className="py-12">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
              <dt className="flex items-center gap-2 text-sm text-ink-600">
                <CalendarDays className="size-4" aria-hidden="true" /> Best time to visit
              </dt>
              <dd className="mt-1 font-display text-xl text-forest-900">{formatMonthRange(destination.best_months)}</dd>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
              <dt className="flex items-center gap-2 text-sm text-ink-600">
                <Mountain className="size-4" aria-hidden="true" /> Landscape
              </dt>
              <dd className="mt-1 font-display text-xl text-forest-900">{destination.types.map((t) => DESTINATION_TYPE_LABELS[t] ?? t).join(', ')}</dd>
            </div>
            <div className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
              <dt className="text-sm text-ink-600">Stays on Vistara</dt>
              <dd className="mt-1 font-display text-xl text-forest-900">
                {plural(destination.resort_count, 'stay')}
                {destination.starting_price_paise ? <span className="text-base text-ink-600"> · from {formatINR(destination.starting_price_paise)}/night</span> : null}
              </dd>
            </div>
          </dl>

          <div className="mt-14 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl text-forest-900">Where to stay in {destination.name}</h2>
            {destination.resort_count > 0 && (
              <Button to={`/search?destination=${destination.slug}`} variant="outline" size="sm">
                Search with dates <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="mt-6">
            {stays.isPending ? (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <li key={i} className="flex">
                    <ResortCardSkeleton />
                  </li>
                ))}
              </ul>
            ) : stays.data?.items.length ? (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {stays.data.items.map((r) => (
                  <li key={r.id} className="flex">
                    <ResortCard resort={r} amenityLookup={amenityLookup} {...favourites.cardProps(r)} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={MapPin} title="No stays listed here yet">
                Own a property in {destination.name}? List it on Vistara Stays.
              </EmptyState>
            )}
          </div>

          {destination.image?.credit && (
            <p className="mt-12 text-xs text-ink-600">
              Header photo: {destination.image.credit.author},{' '}
              <a className="underline" href={destination.image.credit.sourceUrl} target="_blank" rel="noreferrer">
                {destination.image.credit.license}
              </a>
              , via Wikimedia Commons.
            </p>
          )}
        </Container>
      )}
    </>
  )
}
