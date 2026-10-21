import { Link } from 'react-router'
import SmartImage from '../ui/SmartImage'
import { DESTINATION_TYPE_LABELS, STATE_NAMES } from '../../utils/labels'
import { formatMonthRange, plural } from '../../utils/format'
import { cn } from '../../utils/cn'

export default function DestinationCard({ destination, className }) {
  return (
    <Link to={`/destinations/${destination.slug}`} className={cn('group relative block overflow-hidden rounded-2xl', className)}>
      <SmartImage
        image={destination.image}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        className="aspect-[4/3]"
        imgClassName="transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-forest-950/85 via-forest-950/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 text-cream-50">
        <p className="text-xs tracking-wide text-cream-100/85">
          {destination.district} · {STATE_NAMES[destination.state]}
        </p>
        <h3 className="font-display text-xl sm:text-2xl">{destination.name}</h3>
        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-cream-100/85">
          <span>{destination.types.slice(0, 2).map((t) => DESTINATION_TYPE_LABELS[t] ?? t).join(' · ')}</span>
          <span aria-hidden="true">|</span>
          <span>Best {formatMonthRange(destination.best_months)}</span>
          {destination.resort_count > 0 && (
            <>
              <span aria-hidden="true">|</span>
              <span>{plural(destination.resort_count, 'stay')}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  )
}

export function DestinationCardSkeleton() {
  return <div aria-hidden="true" className="aspect-[4/3] animate-pulse rounded-2xl bg-forest-900/[0.07]" />
}
