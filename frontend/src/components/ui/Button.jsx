import { Link } from 'react-router'
import { cn } from '../../utils/cn'

const VARIANTS = {
  primary: 'bg-forest-800 text-cream-50 hover:bg-forest-700 shadow-sm',
  accent: 'bg-clay-600 text-white hover:bg-clay-500 shadow-sm',
  outline: 'border border-forest-800/20 bg-white/70 text-forest-800 hover:bg-white',
  ghost: 'text-forest-800 hover:bg-forest-100',
  light: 'bg-cream-50 text-forest-900 hover:bg-white',
}

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-6 text-base',
}

/** Renders a <Link> when `to` is given, otherwise a <button>. */
export default function Button({ to, variant = 'primary', size = 'md', className, children, ...props }) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
}
