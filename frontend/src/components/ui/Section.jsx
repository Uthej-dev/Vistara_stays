import { cn } from '../../utils/cn'

export function Container({ className, children }) {
  return <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>
}

/** A landing-page section with a consistent heading block. */
export function Section({ id, eyebrow, title, description, action, className, children }) {
  const headingId = id ? `${id}-heading` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cn('py-16 sm:py-20', className)}>
      <Container>
        <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            {eyebrow && (
              <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-clay-600 uppercase">{eyebrow}</p>
            )}
            <h2 id={headingId} className="font-display text-3xl text-forest-900 sm:text-4xl">
              {title}
            </h2>
            {description && <p className="mt-3 text-ink-600">{description}</p>}
          </div>
          {action}
        </div>
        {children}
      </Container>
    </section>
  )
}
