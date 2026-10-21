import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleAlert, LoaderCircle } from 'lucide-react'
import { getReadiness } from '../api/health'
import { toApiError } from '../api/client'

/** Shows whether the frontend can reach the API and the API can reach MongoDB. */
export default function ApiStatus() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health', 'ready'],
    queryFn: getReadiness,
    retry: false,
  })

  if (isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-ink-600">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Checking API…
      </p>
    )
  }

  if (error) {
    return (
      <p role="status" className="flex items-center gap-2 text-clay-600">
        <CircleAlert className="size-4" aria-hidden="true" />
        API unavailable: {toApiError(error).message}
      </p>
    )
  }

  return (
    <p role="status" className="flex items-center gap-2 text-forest-700">
      <CircleCheck className="size-4" aria-hidden="true" />
      API online · database {data.database}
    </p>
  )
}
