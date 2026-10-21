import { CircleAlert, RotateCcw } from 'lucide-react'
import { toApiError } from '../../api/client'
import { cn } from '../../utils/cn'

export function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-xl bg-forest-900/[0.07]', className)} />
}

export function EmptyState({ icon: IconComponent, title, children, action, className }) {
  return (
    <div className={cn('rounded-3xl bg-white px-6 py-14 text-center ring-1 ring-forest-900/5', className)}>
      {IconComponent && <IconComponent className="mx-auto size-10 text-forest-700/70" aria-hidden="true" />}
      <h2 className="mt-4 font-display text-2xl text-forest-900">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-600">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, title = 'Something went wrong', className }) {
  const { message } = toApiError(error)
  return (
    <div role="alert" className={cn('rounded-3xl bg-white px-6 py-12 text-center ring-1 ring-clay-600/20', className)}>
      <CircleAlert className="mx-auto size-9 text-clay-600" aria-hidden="true" />
      <h2 className="mt-3 font-display text-xl text-forest-900">{title}</h2>
      <p className="mt-1 text-ink-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-forest-800 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700"
        >
          <RotateCcw className="size-4" aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  )
}

export function Spinner({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  )
}
