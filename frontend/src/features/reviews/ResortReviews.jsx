import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquareQuote } from 'lucide-react'
import { getResortReviews } from '../../api/reviews'
import { ErrorState, Skeleton } from '../../components/ui/States'
import Pagination from '../../components/ui/Pagination'
import { RatingHistogram, ReviewCard, Stars } from './ReviewBits'
import { useAuth } from '../auth/AuthProvider'

const SUBS = [
  ['cleanliness', 'Cleanliness'],
  ['location', 'Location'],
  ['service', 'Service'],
  ['facilities', 'Facilities'],
]

export default function ResortReviews({ resort }) {
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const { status } = useAuth()
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['reviews', resort.id, sort, page],
    queryFn: () => getResortReviews(resort.id, { sort, page }),
    enabled: resort.rating?.count > 0,
  })

  if (!resort.rating?.count) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-forest-900/5">
        <MessageSquareQuote className="mx-auto size-8 text-forest-700/70" aria-hidden="true" />
        <p className="mt-2 font-medium text-forest-900">No reviews yet</p>
        <p className="text-sm text-ink-600">Only guests with a completed stay can review this property.</p>
      </div>
    )
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const summary = data?.summary ?? resort.rating
  return (
    <div className="space-y-6">
      {resort.is_sample && <p className="text-sm text-ink-600">These are sample reviews written for this demo, not from real guests.</p>}
      <div className="grid gap-6 rounded-2xl bg-white p-6 ring-1 ring-forest-900/5 sm:grid-cols-[auto_1fr_1fr]">
        <div>
          <p className="font-sans text-5xl font-semibold text-ink-900">{summary.avg.toFixed(1)}</p>
          <Stars value={Math.round(summary.avg)} />
          <p className="mt-1 text-sm text-ink-600">{summary.count} reviews</p>
        </div>
        {data ? <RatingHistogram histogram={data.histogram} total={data.total} /> : <Skeleton className="h-28" />}
        <dl className="space-y-1.5 text-sm">
          {SUBS.filter(([k]) => summary[k] != null).map(([k, label]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-ink-600">{label}</dt>
              <dd className="font-medium tabular-nums">{summary[k].toFixed(1)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Reviews come only from guests with a completed booking.</p>
        <label className="flex items-center gap-2 text-sm">
          Sort
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} className="h-9 rounded-lg border border-forest-900/15 bg-white px-2">
            <option value="recent">Most recent</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
        </label>
      </div>
      {isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} canReport={status === 'authenticated'} />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.total_pages} onChange={setPage} />
        </>
      )}
    </div>
  )
}
