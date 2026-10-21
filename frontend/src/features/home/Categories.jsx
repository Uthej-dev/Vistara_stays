import { Link } from 'react-router'
import { Section } from '../../components/ui/Section'
import SmartImage from '../../components/ui/SmartImage'
import Icon from '../../components/ui/Icon'
import { Skeleton } from '../../components/ui/States'
import { useCategories, useDestinationMap } from '../catalog/queries'
import { CATEGORY_IMAGES } from '../../data/catalog'

export default function Categories() {
  const { data, isPending } = useCategories('category')
  const { map } = useDestinationMap()

  return (
    <Section id="categories" eyebrow="Stay your way" title="Find the right kind of stay">
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {isPending
          ? Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[4/3] rounded-2xl sm:aspect-[16/9]" />
              </li>
            ))
          : (data ?? []).map((c) => (
              <li key={c.slug}>
                <Link to={`/search?category=${c.slug}`} className="group relative block overflow-hidden rounded-2xl">
                  <SmartImage
                    image={map[CATEGORY_IMAGES[c.slug]]?.image}
                    alt=""
                    sizes="(min-width: 1024px) 33vw, 50vw"
                    className="aspect-[4/3] sm:aspect-[16/9]"
                    imgClassName="transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 via-forest-950/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-cream-50">
                    <span className="hidden size-10 shrink-0 place-items-center rounded-full bg-cream-50/15 ring-1 ring-cream-50/30 backdrop-blur sm:grid">
                      <Icon name={c.icon} className="size-5" />
                    </span>
                    <span>
                      <span className="block font-display text-lg sm:text-xl">{c.name}</span>
                      {c.blurb && <span className="hidden text-sm text-cream-100/85 sm:block">{c.blurb}</span>}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
      </ul>
    </Section>
  )
}
