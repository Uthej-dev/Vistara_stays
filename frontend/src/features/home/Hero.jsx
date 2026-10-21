import { Link } from 'react-router'
import SmartImage from '../../components/ui/SmartImage'
import SearchWidget from '../search/SearchWidget'
import { useDestinationMap } from '../catalog/queries'

const QUICK_PICKS = ['coorg', 'munnar', 'alleppey', 'ooty', 'hampi']

export default function Hero() {
  const { map } = useDestinationMap()
  const hero = map.coorg
  const credit = hero?.image?.credit

  return (
    <section aria-labelledby="hero-heading" className="relative isolate flex min-h-[640px] items-end pb-10 sm:min-h-[92svh] sm:items-center sm:pb-0">
      {/* While destinations load (or if the photo fails) the scrim sits on a calm green tint. */}
      <div className="absolute inset-0 -z-10 bg-forest-800" />
      {hero?.image && <SmartImage image={hero.image} priority fill sizes="100vw" className="-z-10" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-forest-950/70 via-forest-950/35 to-forest-950/75" />

      <div className="mx-auto w-full max-w-7xl px-4 pt-28 sm:px-6 lg:px-8">
        <p className="mb-5 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-cream-50 ring-1 ring-white/25 backdrop-blur">
          Portfolio demo · listed properties are fictional samples
        </p>
        <h1 id="hero-heading" className="max-w-3xl font-display text-4xl leading-[1.08] text-cream-50 sm:text-6xl lg:text-7xl">
          Find your quiet corner of <span className="italic">South India</span>
        </h1>
        <p className="mt-5 max-w-xl text-base text-cream-100/90 sm:text-lg">
          Plantation cottages, backwater villas and forest hideaways across five states — with every tax and fee
          shown before you book.
        </p>

        <SearchWidget className="mt-8 max-w-6xl" />

        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-cream-50">
          <span className="text-cream-100/80">Popular:</span>
          {QUICK_PICKS.filter((s) => map[s]).map((slug) => (
            <Link
              key={slug}
              to={`/search?destination=${slug}`}
              className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-white/20"
            >
              {map[slug].name}
            </Link>
          ))}
        </div>
      </div>

      {credit && (
        <a
          href={credit.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="absolute right-3 bottom-2 hidden text-[11px] text-cream-100/70 hover:text-cream-50 sm:block"
        >
          Photo: {hero.name} · {credit.author} · {credit.license}
        </a>
      )}
    </section>
  )
}
