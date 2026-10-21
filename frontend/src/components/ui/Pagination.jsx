import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'

/** Page numbers around the current page: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(page, totalPages, radius = 1) {
  const pages = new Set([1, totalPages])
  for (let p = page - radius; p <= page + radius; p += 1) if (p >= 1 && p <= totalPages) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export default function Pagination({ page, totalPages, onChange, className }) {
  if (totalPages <= 1) return null
  const btn = 'grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-medium transition-colors'
  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1', className)}>
      <button type="button" className={cn(btn, 'hover:bg-forest-100 disabled:opacity-40')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      {pageWindow(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-ink-600" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={cn(btn, p === page ? 'bg-forest-800 text-cream-50' : 'hover:bg-forest-100')}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={cn(btn, 'hover:bg-forest-100 disabled:opacity-40')} disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  )
}
