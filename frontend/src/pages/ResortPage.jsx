import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Heart, MapPin, Star } from 'lucide-react'
import { Container } from '../components/ui/Section'
import { ErrorState, Skeleton } from '../components/ui/States'
import Gallery from '../components/resort/Gallery'
import RatingBadge from '../components/resort/RatingBadge'
import BookingPanel from '../features/resort/BookingPanel'
import { Amenities, EnquiryForm, LocationMap, Policies, RoomCard, SectionTitle } from '../features/resort/ResortSections'
import ResortReviews from '../features/reviews/ResortReviews'
import { hasValidDates, useStayParams } from '../features/resort/useStayParams'
import { useResort } from '../features/catalog/queries'
import { useAmenityLookup } from '../features/catalog/useAmenityLookup'
import { useFavouriteToggle } from '../features/favourites/useFavouriteToggle'
import { useAuth } from '../features/auth/AuthProvider'
import { getAvailability } from '../api/stays'
import NotFoundPage from './NotFoundPage'
import { PROPERTY_TYPE_LABELS } from '../utils/labels'
import { formatINR, formatPlace } from '../utils/format'

const NAV = [
  ['overview', 'Overview'],
  ['rooms', 'Rooms'],
  ['policies', 'Policies'],
  ['location', 'Location'],
  ['reviews', 'Reviews'],
]

export default function ResortPage() {
  const { slug } = useParams()
  const { data: resort, error, isPending, refetch } = useResort(slug)
  const stayState = useStayParams()
  const { stay } = stayState
  const datesValid = hasValidDates(stay)
  const { user } = useAuth()
  const amenityLookup = useAmenityLookup()
  const favourites = useFavouriteToggle()
  const [panelOpen, setPanelOpen] = useState(false)

  const availability = useQuery({
    queryKey: ['availability', resort?.id, stay.checkIn, stay.checkOut, stay.rooms, stay.adults, stay.children, stay.childAges.join(',')],
    queryFn: () =>
      getAvailability(resort.id, {
        check_in: stay.checkIn,
        check_out: stay.checkOut,
        rooms: stay.rooms,
        adults: stay.adults,
        children: stay.children,
        child_ages: stay.childAges,
      }),
    enabled: Boolean(resort?.id) && datesValid,
    staleTime: 15_000,
  })

  useEffect(() => {
    if (!panelOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setPanelOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [panelOpen])

  useEffect(() => {
    if (resort) document.title = `${resort.name}, ${resort.destination.name} · Vistara Stays`
  }, [resort])

  if (error?.response?.status === 404) return <NotFoundPage />
  if (error) return <ErrorState className="m-8" error={error} onRetry={refetch} />
  if (isPending) {
    return (
      <Container className="py-10">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 aspect-[16/7] w-full rounded-3xl" />
      </Container>
    )
  }

  const byRoom = Object.fromEntries((availability.data?.room_types ?? []).map((r) => [r.room_type_id, r]))
  const selectRoom = (id) => {
    stayState.update({ roomTypeId: id })
    setPanelOpen(true)
    if (window.matchMedia?.('(min-width: 1024px)').matches) document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const panel = <BookingPanel resort={resort} stayState={stayState} availability={availability} />

  return (
    <div className="pb-28 lg:pb-16">
      <Container className="pt-8">
        {resort.is_sample && (
          <p className="mb-4 rounded-xl bg-cream-200 px-4 py-2.5 text-sm text-ink-900">
            <strong>Sample property.</strong> This is fictional demo data — not a real business. Photos show the destination, not the property.
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-ink-600">
              <MapPin className="size-4" aria-hidden="true" />
              {formatPlace(resort.destination.name, resort.destination.state)} · {PROPERTY_TYPE_LABELS[resort.property_type]}
            </p>
            <h1 className="mt-1 font-display text-4xl text-forest-900 sm:text-5xl">{resort.name}</h1>
            <div className="mt-2">
              <RatingBadge rating={resort.rating} isSample={resort.is_sample} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => favourites.toggle(resort)}
            aria-pressed={favourites.isFavourite(resort.id)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100"
          >
            <Heart className={favourites.isFavourite(resort.id) ? 'size-4 fill-clay-600 text-clay-600' : 'size-4'} aria-hidden="true" />
            {favourites.isFavourite(resort.id) ? 'Saved' : 'Save'}
          </button>
        </div>

        <div className="mt-6">
          <Gallery images={resort.images} title={resort.name} />
        </div>

        <nav aria-label="Sections" className="sticky top-16 z-20 -mx-4 mt-6 overflow-x-auto border-b border-forest-900/10 bg-cream-50/95 px-4 backdrop-blur">
          <ul className="flex gap-6 text-sm font-medium">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block py-3 text-ink-600 hover:text-forest-900">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </Container>

      <Container className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-14">
          <section id="overview" aria-labelledby="overview-h" className="scroll-mt-32">
            <SectionTitle id="overview-h">About this stay</SectionTitle>
            <p className="mt-4 leading-relaxed text-ink-900">{resort.description}</p>
            {resort.highlights.length > 0 && (
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {resort.highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-ink-900">
                    <Star className="size-4 text-clay-600" aria-hidden="true" /> {h}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-8 font-semibold text-forest-900">Amenities</h3>
            <div className="mt-4">
              <Amenities slugs={resort.amenities} lookup={amenityLookup} />
            </div>
          </section>

          <section id="rooms" aria-labelledby="rooms-h" className="scroll-mt-32">
            <SectionTitle id="rooms-h">Rooms</SectionTitle>
            <p className="mt-1 text-sm text-ink-600">
              {datesValid ? 'Prices for your dates, including taxes and fees.' : 'Choose dates to see availability and the full price.'}
            </p>
            <div className="mt-5 space-y-4">
              {resort.room_types.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  availability={byRoom[room.id]}
                  datesChosen={datesValid}
                  selected={stay.roomTypeId === room.id}
                  onSelect={() => selectRoom(room.id)}
                  fallbackImage={resort.images[0]}
                />
              ))}
            </div>
          </section>

          <section id="policies" aria-labelledby="policies-h" className="scroll-mt-32">
            <SectionTitle id="policies-h">Policies</SectionTitle>
            <div className="mt-5">
              <Policies policies={resort.policies} />
            </div>
          </section>

          <section id="location" aria-labelledby="location-h" className="scroll-mt-32">
            <SectionTitle id="location-h">Location</SectionTitle>
            <p className="mt-1 text-sm text-ink-600">
              {resort.address.town}, {resort.address.district}
              {resort.distance_from_centre_km != null ? ` · about ${resort.distance_from_centre_km} km from ${resort.destination.name} town centre` : ''}
            </p>
            <div className="mt-5">
              <LocationMap location={resort.location} name={resort.name} attractions={resort.nearby_attractions} />
            </div>
          </section>

          <section id="reviews" aria-labelledby="reviews-h" className="scroll-mt-32">
            <SectionTitle id="reviews-h">Guest reviews</SectionTitle>
            <div className="mt-5">
              <ResortReviews resort={resort} />
            </div>
          </section>

          <section id="enquiry" aria-labelledby="enquiry-h" className="scroll-mt-32">
            <SectionTitle id="enquiry-h">Ask the property</SectionTitle>
            <p className="mt-1 text-sm text-ink-600">Questions about access, meals or special requests? Send them before you book.</p>
            <div className="mt-5 rounded-3xl bg-white p-6 ring-1 ring-forest-900/5">
              <EnquiryForm resortId={resort.id} user={user} />
            </div>
          </section>
        </div>

        <aside id="booking" aria-label="Book this stay" className="hidden scroll-mt-24 lg:block">
          <div className="sticky top-32">{panel}</div>
        </aside>
      </Container>

      {/* Mobile: compact bar that opens the booking panel. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-forest-900/10 bg-cream-50/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            {datesValid && byRoom[stay.roomTypeId]?.price ? (
              <>
                <span className="font-semibold">{formatINR(byRoom[stay.roomTypeId].price.total_paise)}</span> total
              </>
            ) : (
              <>
                from <span className="font-semibold">{formatINR(resort.starting_price_paise)}</span>/night
              </>
            )}
          </p>
          <button type="button" onClick={() => setPanelOpen(true)} className="h-11 rounded-xl bg-clay-600 px-5 font-semibold text-white">
            {datesValid ? 'Review & reserve' : 'Check availability'}
          </button>
        </div>
      </div>
      {panelOpen && (
        // Backdrop click closes; Esc and the Close button are the keyboard equivalents.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
        <div role="dialog" aria-modal="true" aria-label="Book this stay" className="fixed inset-0 z-40 overflow-y-auto bg-forest-950/50 p-3 lg:hidden" onClick={(e) => e.target === e.currentTarget && setPanelOpen(false)}>
          <div className="mx-auto mt-10 max-w-md">
            <button type="button" onClick={() => setPanelOpen(false)} className="mb-2 ml-auto block rounded-full bg-white px-4 py-2 text-sm font-medium">
              Close
            </button>
            {panel}
          </div>
        </div>
      )}
    </div>
  )
}
