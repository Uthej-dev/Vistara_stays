import { MessageSquareQuote } from 'lucide-react'

/** Rating summary. The full review list arrives with the review system (Phase 9). */
export default function ResortReviews({ resort }) {
  const { rating } = resort
  if (!rating?.count) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-forest-900/5">
        <MessageSquareQuote className="mx-auto size-8 text-forest-700/70" aria-hidden="true" />
        <p className="mt-2 font-medium text-forest-900">No reviews yet</p>
        <p className="text-sm text-ink-600">Only guests with a completed stay can review this property.</p>
      </div>
    )
  }
  return (
    <p className="text-ink-900">
      <span className="font-display text-4xl text-forest-900">{rating.avg.toFixed(1)}</span> / 5 from {rating.count} reviews
    </p>
  )
}
