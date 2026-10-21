import { Link, useNavigate } from 'react-router'
import { Heart, MapPin } from 'lucide-react'
import SmartImage from '../ui/SmartImage'
import Icon from '../ui/Icon'
import RatingBadge from './RatingBadge'
import { formatINR, formatPlace, plural } from '../../utils/format'
import { MEAL_PLAN_LABELS, PROPERTY_TYPE_LABELS } from '../../utils/labels'

const AMENITY_FALLBACK = {
  wifi: ['Wi-Fi', 'Wifi'],
  pool: ['Pool', 'WavesLadder'],
  parking: ['Parking', 'SquareParking'],
  restaurant: ['Restaurant', 'UtensilsCrossed'],
  spa: ['Spa', 'Sparkles'],
  pet_friendly: ['Pet friendly', 'PawPrint'],
  kids_play_area: ['Kids area', 'Baby'],
  ayurveda: ['Ayurveda', 'Leaf'],
  campfire: ['Campfire', 'Flame'],
}

/** Shows either a *starting* price (no dates) or the real price for the searched dates. */
export function CardPrice({ price, available }) {
  if (available === false) {
    return <p className="text-sm font-medium text-clay-600">Not available for your dates</p>
  }
  if (price.kind === 'stay') {
    return (
      <>
        <p className="text-ink-900">
          <span className="text-lg font-semibold">{formatINR(price.total_paise)}</span>
          <span className="text-sm text-ink-600"> for {plural(price.nights, 'night')}</span>
        </p>
        <p className="text-xs text-ink-600">
          Incl. taxes & fees · {plural(price.rooms ?? 1, 'room')} · {MEAL_PLAN_LABELS[price.meal_plan]}
        </p>
      </>
    )
  }
  return (
    <>
      <p className="text-ink-900">
        <span className="text-xs text-ink-600">from </span>
        <span className="text-lg font-semibold">{formatINR(price.per_night_paise)}</span>
        <span className="text-sm text-ink-600"> / night</span>
      </p>
      <p className="text-xs text-ink-600">Excl. taxes & fees · {MEAL_PLAN_LABELS[price.meal_plan]}</p>
    </>
  )
}

export default function ResortCard({ resort, amenityLookup = {}, linkSearch = '', onToggleFavourite, isFavourite }) {
  const navigate = useNavigate()
  const href = `/resorts/${resort.slug}${linkSearch}`

  const handleFavourite = () => {
    if (onToggleFavourite) onToggleFavourite(resort)
    else navigate(`/login?next=${encodeURIComponent(href)}`)
  }

  return (
    <article className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,32,22,0.06),0_8px_24px_-12px_rgba(16,32,22,0.18)] transition-shadow hover:shadow-[0_2px_4px_rgba(16,32,22,0.08),0_16px_40px_-16px_rgba(16,32,22,0.3)]">
      <div className="relative">
        <SmartImage
          image={resort.cover_image}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[4/3]"
          imgClassName="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {resort.is_sample && (
          <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink-900 backdrop-blur">
            Sample property
          </span>
        )}
        <button
          type="button"
          onClick={handleFavourite}
          aria-pressed={onToggleFavourite ? Boolean(isFavourite) : undefined}
          aria-label={
            onToggleFavourite
              ? `${isFavourite ? 'Remove' : 'Save'} ${resort.name} ${isFavourite ? 'from' : 'to'} favourites`
              : `Save ${resort.name} to favourites (requires login)`
          }
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-white/90 text-forest-900 backdrop-blur transition-colors hover:text-clay-600"
        >
          <Heart className={isFavourite ? 'size-4.5 fill-clay-600 text-clay-600' : 'size-4.5'} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="flex items-center gap-1 text-xs text-ink-600">
            <MapPin className="size-3.5" aria-hidden="true" />
            {formatPlace(resort.destination.name, resort.destination.state)}
            <span aria-hidden="true">·</span>
            {PROPERTY_TYPE_LABELS[resort.property_type]}
          </p>
          <h3 className="mt-1 font-display text-lg leading-snug text-forest-900">
            {/* The stretched link makes the whole card clickable while keeping one tab stop. */}
            <Link to={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {resort.name}
            </Link>
          </h3>
        </div>

        <RatingBadge rating={resort.rating} isSample={resort.is_sample} />

        <ul className="flex flex-wrap gap-2" aria-label="Highlights">
          {resort.amenities.slice(0, 4).map((slug) => {
            const fromApi = amenityLookup[slug]
            const [label, icon] = fromApi ? [fromApi.name, fromApi.icon] : (AMENITY_FALLBACK[slug] ?? [slug, null])
            return (
              <li key={slug} className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2 py-1 text-xs text-ink-600">
                <Icon name={icon} className="size-3.5" />
                {label}
              </li>
            )
          })}
        </ul>

        <div className="mt-auto border-t border-forest-900/5 pt-3">
          <CardPrice price={resort.price} available={resort.available} />
        </div>
      </div>
    </article>
  )
}

export function ResortCardSkeleton() {
  return (
    <div aria-hidden="true" className="w-full overflow-hidden rounded-2xl bg-white ring-1 ring-forest-900/5">
      <div className="aspect-[4/3] animate-pulse bg-forest-900/[0.07]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-1/2 animate-pulse rounded bg-forest-900/[0.07]" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-forest-900/[0.07]" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-forest-900/[0.07]" />
        <div className="h-10 w-full animate-pulse rounded bg-forest-900/[0.07]" />
      </div>
    </div>
  )
}
