import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart } from 'lucide-react'
import { Container } from '../components/ui/Section'
import { EmptyState, ErrorState } from '../components/ui/States'
import Pagination from '../components/ui/Pagination'
import Button from '../components/ui/Button'
import ResortCard, { ResortCardSkeleton } from '../components/resort/ResortCard'
import * as authApi from '../api/auth'
import { favouriteKeys, useFavouriteToggle } from '../features/favourites/useFavouriteToggle'
import { useAmenityLookup } from '../features/catalog/useAmenityLookup'

export default function FavouritesPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: favouriteKeys.list(page), queryFn: () => authApi.getFavourites(page) })
  const favourites = useFavouriteToggle()
  const amenityLookup = useAmenityLookup()

  useEffect(() => {
    document.title = 'Your favourites · Vistara Stays'
  }, [])

  return (
    <Container className="py-12">
      <h1 className="font-display text-4xl text-forest-900">Your favourites</h1>
      <p className="mt-2 text-ink-600">Stays you’ve saved for later.</p>
      <div className="mt-8">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isPending ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex">
                <ResortCardSkeleton />
              </li>
            ))}
          </ul>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Heart} title="No favourites yet" action={<Button to="/search">Browse stays</Button>}>
            Tap the heart on any stay to save it here.
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.items.map((r) => (
                <li key={r.id} className="flex">
                  <ResortCard resort={r} amenityLookup={amenityLookup} {...favourites.cardProps(r)} />
                </li>
              ))}
            </ul>
            <Pagination className="mt-10" page={data.page} totalPages={data.total_pages} onChange={setPage} />
          </>
        )}
      </div>
    </Container>
  )
}
