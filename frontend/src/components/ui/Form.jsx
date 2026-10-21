import { forwardRef, useId, useState } from 'react'
import { CircleAlert, CircleCheck, Eye, EyeOff } from 'lucide-react'
import { Spinner } from './States'
import { cn } from '../../utils/cn'

export const inputClass =
  'h-11 w-full rounded-xl border border-forest-900/15 bg-white px-3 text-ink-900 placeholder:text-ink-600/60 hover:border-forest-900/30 aria-[invalid=true]:border-clay-600'

/** Labelled input with hint + error wired up for screen readers. Works with react-hook-form's register(). */
export const TextField = forwardRef(function TextField({ label, hint, error, className, as = 'input', children, ...props }, ref) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  const Component = as
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-900">
        {label}
      </label>
      <Component
        id={id}
        ref={ref}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={cn(inputClass, as === 'textarea' && 'h-auto min-h-28 py-2.5', as === 'select' && 'pr-8')}
        {...props}
      >
        {children}
      </Component>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-clay-600">
          {error}
        </p>
      )}
    </div>
  )
})

export const PasswordField = forwardRef(function PasswordField({ label = 'Password', hint, error, className, ...props }, ref) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-900">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(inputClass, 'pr-11')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-600 hover:bg-forest-100"
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-clay-600">
          {error}
        </p>
      )}
    </div>
  )
})

export function FormAlert({ tone = 'error', children }) {
  if (!children) return null
  const Icon = tone === 'error' ? CircleAlert : CircleCheck
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl px-4 py-3 text-sm',
        tone === 'error' ? 'bg-clay-600/10 text-clay-600' : 'bg-forest-100 text-forest-800',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function SubmitButton({ loading, children, className, ...props }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-forest-800 px-6 font-semibold text-cream-50 transition-colors hover:bg-forest-700 disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
