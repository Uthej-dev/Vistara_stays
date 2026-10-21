import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareQuote } from 'lucide-react'
import { getOwnerReviews, replyToReview } from '../../api/reviews'
import { toApiError } from '../../api/client'
import { PageHeader } from '../../features/owner/OwnerShell'
import { ReviewCard } from '../../features/reviews/ReviewBits'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States'
import Pagination from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/Toast'

function ReplyBox({ review }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(review.owner_reply?.body ?? '')
  const save = async () => {
    try {
      await replyToReview(review.id, text.trim())
      queryClient.invalidateQueries({ queryKey: ['owner', 'reviews'] })
      setOpen(false)
      toast.success('Reply published')
    } catch (e) {
      toast.error(toApiError(e).message)
    }
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-sm font-medium text-forest-700 hover:underline">
        {review.owner_reply ? 'Edit your reply' : 'Reply publicly'}
      </button>
    )
  }
  return (
    <div className="mt-2 space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block text-ink-600">Your public reply</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} className="min-h-24 w-full rounded-lg border border-forest-900/15 bg-white p-2" />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={text.trim().length < 10} onClick={save} className="h-9 rounded-full bg-forest-800 px-4 text-sm font-medium text-cream-50 disabled:opacity-50">
          Publish reply
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full px-4 text-sm ring-1 ring-forest-900/15">
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function OwnerReviewsPage() {
  const [page, setPage] = useState(1)
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['owner', 'reviews', page], queryFn: () => getOwnerReviews(page) })
  useEffect(() => {
    document.title = 'Guest reviews · Vistara Stays'
  }, [])
  return (
    <>
      <PageHeader title="Guest reviews" description="Thank guests and respond to feedback — replies are public." />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isPending ? (
        <Skeleton className="h-48" />
      ) : data.items.length === 0 ? (
        <EmptyState icon={MessageSquareQuote} title="No reviews yet">Guests can review after a completed stay.</EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((r) => (
              <li key={r.id}>
                <ReviewCard review={r} showResort />
                <ReplyBox review={r} />
              </li>
            ))}
          </ul>
          <Pagination className="mt-6" page={data.page} totalPages={data.total_pages} onChange={setPage} />
        </>
      )}
    </>
  )
}
