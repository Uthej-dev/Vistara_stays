import { Star } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import Icon from '../../components/ui/Icon'
import { SAMPLE_REVIEWS, TRUST_POINTS } from '../../data/catalog'

export default function TrustAndReviews() {
  return (
    <Section id="trust" eyebrow="Why Vistara" title="Booking you can trust">
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_POINTS.map((t) => (
          <li key={t.title}>
            <span className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-800">
              <Icon name={t.icon} className="size-5" />
            </span>
            <h3 className="mt-4 font-semibold text-forest-900">{t.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{t.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl text-forest-900">What guests say</h3>
          <p className="rounded-full bg-cream-200 px-3 py-1 text-xs font-medium text-ink-900">
            Sample reviews written for this demo — not from real guests
          </p>
        </div>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {SAMPLE_REVIEWS.map((r) => (
            <li key={r.id}>
              <figure className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,32,22,0.06),0_8px_24px_-12px_rgba(16,32,22,0.18)]">
                <div className="flex gap-0.5 text-clay-600" role="img" aria-label={`${r.rating} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star key={i} className={i < r.rating ? 'size-4 fill-current' : 'size-4 text-cream-200'} aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-ink-900">“{r.body}”</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold text-forest-900">{r.author}</span>
                  <span className="block text-ink-600">{r.stay}</span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
