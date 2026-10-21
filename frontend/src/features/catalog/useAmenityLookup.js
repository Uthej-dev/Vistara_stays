import { useCategories } from './queries'

/** { slug: {name, icon} } for amenities, from the admin-managed categories API. */
export function useAmenityLookup() {
  const { data } = useCategories()
  return data ? Object.fromEntries(data.map((c) => [c.slug, c])) : {}
}
