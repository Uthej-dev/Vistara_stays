import { Link, useNavigate } from 'react-router'
import { Heart, MapPin } from 'lucide-react'
import SmartImage from '../ui/SmartImage'
import Icon from '../ui/Icon'
import RatingBadge from './RatingBadge'
import { AMENITIES } from '../../data/catalog'
import { MEAL_PLAN_LABELS, PROPERTY_TYPE_LABELS } from '../../data/sampleResorts'
import { formatINR, formatPlace } from '../../utils/format'

/**
 * Resort summary card. With no dates selected it shows a *starting* price ("from ₹X/night"),
 * which is clearly different from a quoted price for specific dates (shown in Phase 4+).
 */
export default function ResortCard({ resort }) {
  const navigate = useNavigate()
  const href = `/resorts/${resort.slug}`

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,32,22,0.06),0_8px_24px_-12px_rgba(16,32,22,0.18)] transition-shadow hover:shadow-[0_2px_4px_rgba(16,32,22,0.08),0_16px_40px_-16px_rgba(16,32,22,0.3)]">
      <div className="relative">
        <SmartImage
          image={resort.image}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-[4/3]"
          imgClassName="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {resort.isSample && (
          <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink-900 backdrop-blur">
            Sample property
          </span>
        )}
        {/* Favourites need an account (Phase 5); for now this sends visitors to log in. */}
        <button
          type="button"
          onClick={() => navigate(`/login?next=${encodeURIComponent(href)}`)}
          aria-label={`Save ${resort.name} to favourites (requires login)`}
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-white/90 text-forest-900 backdrop-blur transition-colors hover:text-clay-600"
        >
          <Heart className="size-4.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="flex items-center gap-1 text-xs text-ink-600">
            <MapPin className="size-3.5" aria-hidden="true" />
            {formatPlace(resort.destination.name, resort.destination.state)}
            <span aria-hidden="true">·</span>
            {PROPERTY_TYPE_LABELS[resort.propertyType]}
          </p>
          <h3 className="mt-1 font-display text-lg leading-snug text-forest-900">
            {/* The stretched link makes the whole card clickable while keeping one tab stop. */}
            <Link to={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              {resort.name}
            </Link>
          </h3>
        </div>

        <RatingBadge rating={resort.rating} isSample={resort.isSample} />

        <ul className="flex flex-wrap gap-2" aria-label="Highlights">
          {resort.amenities.slice(0, 4).map((slug) => (
            <li
              key={slug}
              className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2 py-1 text-xs text-ink-600"
            >
              <Icon name={AMENITIES[slug]?.icon} className="size-3.5" />
              {AMENITIES[slug]?.label ?? slug}
            </li>
          ))}
        </ul>

        <div className="mt-auto border-t border-forest-900/5 pt-3">
          <p className="text-ink-900">
            <span className="text-xs text-ink-600">from </span>
            <span className="text-lg font-semibold">{formatINR(resort.startingPricePaise)}</span>
            <span className="text-sm text-ink-600"> / night</span>
          </p>
          <p className="text-xs text-ink-600">
            Excl. taxes & fees · {MEAL_PLAN_LABELS[resort.mealPlan]}
          </p>
        </div>
      </div>
    </article>
  )
}
