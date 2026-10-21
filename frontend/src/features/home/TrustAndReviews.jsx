import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Section } from '../../components/ui/Section'
import Icon from '../../components/ui/Icon'
import { Skeleton } from '../../components/ui/States'
import { TRUST_POINTS } from '../../data/catalog'
import { getRecentReviews } from '../../api/reviews'
import { Stars } from '../reviews/ReviewBits'

export default function TrustAndReviews() {
  const { data: reviews, isPending } = useQuery({ queryKey: ['reviews', 'recent'], queryFn: () => getRecentReviews(3), staleTime: 5 * 60_000 })
  const anySample = reviews?.some((r) => r.is_sample)

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

      {(isPending || reviews?.length > 0) && (
        <div className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-2xl text-forest-900">What guests say</h3>
            {anySample && <p className="rounded-full bg-cream-200 px-3 py-1 text-xs font-medium text-ink-900">Sample reviews written for this demo — not from real guests</p>}
          </div>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {isPending
              ? Array.from({ length: 3 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-48" />
                  </li>
                ))
              : reviews.map((r) => (
                  <li key={r.id}>
                    <figure className="flex h-full flex-col rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(16,32,22,0.06),0_8px_24px_-12px_rgba(16,32,22,0.18)]">
                      <Stars value={r.rating} />
                      <blockquote className="mt-3 flex-1 text-ink-900">“{r.body}”</blockquote>
                      <figcaption className="mt-4 text-sm">
                        <span className="font-semibold text-forest-900">{r.author}</span>
                        <Link to={`/resorts/${r.resort.slug}`} className="block text-ink-600 hover:underline">
                          {r.resort.name} · {r.resort.destination_name}
                        </Link>
                      </figcaption>
                    </figure>
                  </li>
                ))}
          </ul>
        </div>
      )}
    </Section>
  )
}
