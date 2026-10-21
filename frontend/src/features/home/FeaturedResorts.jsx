import { ArrowRight, Info } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import Button from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/States'
import ResortCard, { ResortCardSkeleton } from '../../components/resort/ResortCard'
import { useFeaturedResorts } from '../catalog/queries'
import { useAmenityLookup } from '../catalog/useAmenityLookup'
import { useFavouriteToggle } from '../favourites/useFavouriteToggle'

export default function FeaturedResorts() {
  const { data, isPending, error, refetch } = useFeaturedResorts()
  const amenityLookup = useAmenityLookup()
  const favourites = useFavouriteToggle()

  return (
    <Section
      id="featured"
      eyebrow="Handpicked stays"
      title="Featured resorts"
      description="Cottages, villas and camps chosen for their setting."
      className="bg-white/60"
      action={
        <Button to="/search" variant="outline" size="sm">
          Browse all stays <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      }
    >
      <p className="mb-6 flex items-start gap-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
        These are fictional sample properties for demonstration. Photos show the destination, not the property.
        Prices are starting rates per room per night and exclude taxes and fees.
      </p>
      {error ? (
        <ErrorState error={error} onRetry={refetch} title="Couldn’t load featured stays" />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy={isPending}>
          {isPending
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex">
                  <ResortCardSkeleton />
                </li>
              ))
            : data.map((r) => (
                <li key={r.id} className="flex">
                  <ResortCard resort={r} amenityLookup={amenityLookup} {...favourites.cardProps(r)} />
                </li>
              ))}
        </ul>
      )}
    </Section>
  )
}
