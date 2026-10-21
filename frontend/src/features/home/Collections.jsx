import { Link } from 'react-router'
import { ArrowRight, Leaf } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import SmartImage from '../../components/ui/SmartImage'
import { COLLECTIONS, GUIDES } from '../../data/catalog'
import { useDestinationMap } from '../catalog/queries'
import { currentMonthIST } from '../../utils/dates'
import { monthName } from '../../utils/format'

/** Curated collections, "in season now" (from each destination's best months), and guides. */
export default function Collections() {
  const { data: destinations = [], map } = useDestinationMap()
  const month = currentMonthIST()
  const inSeason = destinations.filter((d) => d.best_months.includes(month)).slice(0, 10)

  return (
    <Section
      id="collections"
      eyebrow="Curated for you"
      title="Collections & seasonal picks"
      className="bg-forest-900 text-cream-50 [&_h2]:text-cream-50 [&_p]:text-cream-100/80"
    >
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLLECTIONS.map((c) => (
          <li key={c.slug} className="overflow-hidden rounded-2xl bg-forest-800 ring-1 ring-white/5">
            <SmartImage image={map[c.destinations[0]]?.image} alt="" sizes="(min-width: 1024px) 25vw, 50vw" className="aspect-[16/10]" />
            <div className="p-5">
              <h3 className="font-display text-xl text-cream-50">{c.title}</h3>
              <p className="mt-1 text-sm">{c.description}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {c.destinations
                  .filter((slug) => map[slug])
                  .map((slug) => (
                    <li key={slug}>
                      <Link
                        to={`/destinations/${slug}`}
                        className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-cream-50 hover:bg-white/20"
                      >
                        {map[slug].name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      {inSeason.length > 0 && (
        <div className="mt-12 rounded-2xl bg-forest-800/60 p-6 ring-1 ring-white/5">
          <h3 className="flex items-center gap-2 font-display text-2xl text-cream-50">
            <Leaf className="size-5 text-clay-500" aria-hidden="true" />
            In season this {monthName(month)}
          </h3>
          <p className="mt-1 text-sm">Destinations where {monthName(month)} falls in the usual best time to visit.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {inSeason.map((d) => (
              <li key={d.slug}>
                <Link
                  to={`/search?destination=${d.slug}`}
                  className="inline-flex items-center gap-1 rounded-full bg-cream-50 px-3.5 py-1.5 text-sm font-medium text-forest-900 hover:bg-white"
                >
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-12">
        <h3 className="font-display text-2xl text-cream-50">Destination guides</h3>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {GUIDES.map((g) => (
            <li key={g.destination}>
              <Link
                to={`/destinations/${g.destination}`}
                className="group flex h-full gap-4 rounded-2xl bg-forest-800 p-3 ring-1 ring-white/5 transition-colors hover:bg-forest-700"
              >
                <SmartImage image={map[g.destination]?.image} alt="" sizes="120px" className="aspect-square w-24 shrink-0 rounded-xl sm:w-28" />
                <div className="py-1">
                  <p className="text-xs tracking-wide text-clay-500 uppercase">{map[g.destination]?.name}</p>
                  <p className="font-display text-lg text-cream-50">{g.title}</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-cream-100/80">
                    {g.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cream-50">
                    Read guide <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
