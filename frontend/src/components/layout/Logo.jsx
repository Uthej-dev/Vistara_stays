import { Link } from 'react-router'
import { cn } from '../../utils/cn'

export default function Logo({ tone = 'dark', className }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2.5', className)} aria-label="Vistara Stays — home">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={tone === 'light' ? '#f5efe1' : '#1f3d2b'} />
        <path d="M6 23 13 11l4 6 3-4 6 10z" fill={tone === 'light' ? '#1f3d2b' : '#f5efe1'} />
      </svg>
      <span
        className={cn(
          'font-display text-xl tracking-tight',
          tone === 'light' ? 'text-cream-50' : 'text-forest-900',
        )}
      >
        Vistara <span className="italic">Stays</span>
      </span>
    </Link>
  )
}
