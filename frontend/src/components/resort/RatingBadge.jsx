import { Star } from 'lucide-react'

/** "★ 4.6 · 18 sample reviews". Sample data is always labelled as such. */
export default function RatingBadge({ rating, isSample }) {
  if (!rating?.count) {
    return <span className="text-sm text-ink-600">No reviews yet</span>
  }
  const noun = rating.count === 1 ? 'review' : 'reviews'
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1 rounded-md bg-forest-800 px-1.5 py-0.5 font-semibold text-cream-50">
        <Star className="size-3.5 fill-current" aria-hidden="true" />
        {rating.avg.toFixed(1)}
        <span className="sr-only">out of 5</span>
      </span>
      <span className="text-ink-600">
        {rating.count} {isSample ? `sample ${noun}` : noun}
      </span>
    </span>
  )
}
