import { useState } from 'react'
import { Flag, MessageSquareReply, Star } from 'lucide-react'
import { reportReview } from '../../api/reviews'
import { toApiError } from '../../api/client'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime } from '../../utils/format'

export function Stars({ value, size = 'size-4' }) {
  return (
    <span className="inline-flex gap-0.5 text-clay-600" role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < value ? `${size} fill-current` : `${size} text-cream-200`} aria-hidden="true" />
      ))}
    </span>
  )
}

const REASONS = [
  ['spam', 'Spam or advertising'],
  ['offensive', 'Offensive or abusive'],
  ['not_genuine', 'Not a genuine stay'],
  ['private_info', 'Contains private information'],
  ['other', 'Something else'],
]

function ReportButton({ review, canReport }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('spam')
  const [done, setDone] = useState(false)
  if (!canReport || review.is_sample) return null
  if (done) return <p className="text-xs text-ink-600">Reported — thanks, our team will take a look.</p>
  const submit = async () => {
    try {
      await reportReview(review.id, reason)
      setDone(true)
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }
  return open ? (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="sr-only" htmlFor={`reason-${review.id}`}>
        Reason
      </label>
      <select id={`reason-${review.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 rounded-lg border border-forest-900/15 bg-white px-2">
        {REASONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <button type="button" onClick={submit} className="h-8 rounded-full bg-forest-800 px-3 font-medium text-cream-50">
        Send report
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 px-2 text-ink-600">
        Cancel
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-ink-600 hover:text-clay-600">
      <Flag className="size-3.5" aria-hidden="true" /> Report
    </button>
  )
}

export function ReviewCard({ review, canReport, showResort }) {
  return (
    <article className="rounded-2xl bg-white p-5 ring-1 ring-forest-900/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars value={review.rating} />
        {review.is_sample && <span className="rounded-full bg-cream-200 px-2 py-0.5 text-[11px] font-semibold text-ink-900">Sample review</span>}
      </div>
      {review.title && <h3 className="mt-2 font-semibold text-forest-900">{review.title}</h3>}
      <p className="mt-1 text-ink-900">{review.body}</p>
      <p className="mt-3 text-xs text-ink-600">
        {review.author}
        {review.stay_month && ` · stayed ${new Date(`${review.stay_month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`}
        {review.room_type_name && ` · ${review.room_type_name}`}
        {showResort && review.resort_name && ` · ${review.resort_name}`}
      </p>
      {review.owner_reply && (
        <div className="mt-3 rounded-xl bg-cream-100 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-forest-900">
            <MessageSquareReply className="size-4" aria-hidden="true" /> Response from the property
          </p>
          <p className="mt-1 text-ink-900">{review.owner_reply.body}</p>
          <p className="mt-1 text-xs text-ink-600">{formatDateTime(review.owner_reply.at)}</p>
        </div>
      )}
      <div className="mt-3">
        <ReportButton review={review} canReport={canReport} />
      </div>
    </article>
  )
}

/** One-series bar chart of the 1–5 star distribution, values labelled directly. */
export function RatingHistogram({ histogram, total }) {
  return (
    <figure>
      <figcaption className="sr-only">Number of reviews by star rating</figcaption>
      <ul className="space-y-1.5">
        {['5', '4', '3', '2', '1'].map((star) => {
          const count = histogram[star] ?? 0
          const pct = total ? (count / total) * 100 : 0
          return (
            <li key={star} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2 text-sm" title={`${star} stars: ${count} review${count === 1 ? '' : 's'}`}>
              <span className="text-ink-600">{star} star</span>
              <span className="h-2 rounded-full bg-forest-100">
                <span className="block h-2 rounded-full bg-forest-700" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-right text-ink-900 tabular-nums">{count}</span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
