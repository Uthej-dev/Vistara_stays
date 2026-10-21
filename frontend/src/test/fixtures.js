// Small, realistic API responses used by component tests (shapes match the backend schemas).
const image = (slug) => ({
  src: `https://thumb.wikimedia.org/${slug}-1280.jpg`,
  srcSet: { 500: `https://thumb.wikimedia.org/${slug}-500.jpg` },
  alt: `Photo of ${slug}`,
  credit: { author: 'A. Photographer', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', sourceUrl: `https://commons.wikimedia.org/wiki/File:${slug}.jpg` },
})

const dest = (slug, name, state, extra = {}) => ({
  id: `id-${slug}`, slug, name, state, district: 'District', region: 'Region', types: ['hill_station'],
  best_months: [10, 11, 12, 1, 2], summary: `${name} summary.`, location: { lat: 10, lng: 77 },
  image: image(slug), featured_rank: 1000, is_active: true, resort_count: 2, starting_price_paise: 450000, ...extra,
})

export const DESTINATIONS = [
  dest('coorg', 'Coorg', 'karnataka', { featured_rank: 1 }),
  dest('munnar', 'Munnar', 'kerala', { featured_rank: 2 }),
  dest('ananthagiri-hills', 'Ananthagiri Hills', 'telangana'),
  dest('laknavaram', 'Laknavaram', 'telangana', { types: ['lake'] }),
]

export const CATEGORIES = [
  { id: 'c1', slug: 'mountain_retreat', kind: 'category', name: 'Mountain retreats', icon: 'Mountain', blurb: 'Cool air', sort_order: 0 },
  { id: 'c2', slug: 'beach_resort', kind: 'category', name: 'Beach resorts', icon: 'Waves', blurb: 'Coves', sort_order: 1 },
  { id: 'a1', slug: 'wifi', kind: 'amenity', name: 'Wi-Fi', icon: 'Wifi', sort_order: 2 },
  { id: 'a2', slug: 'pool', kind: 'amenity', name: 'Swimming pool', icon: 'WavesLadder', sort_order: 3 },
  { id: 's1', slug: 'mountain', kind: 'surrounding', name: 'Mountain', icon: 'Mountain', sort_order: 4 },
]

export const RESORT_CARD = {
  id: 'r1', slug: 'misty-fern-estate-coorg', name: 'Misty Fern Estate Stay', is_sample: true,
  destination: { id: 'id-coorg', slug: 'coorg', name: 'Coorg', state: 'karnataka' },
  property_type: 'cottage', categories: ['mountain_retreat'], amenities: ['wifi', 'pool'], surroundings: ['mountain'],
  cover_image: image('coorg'), rating: { avg: 4.6, count: 18 },
  price: { kind: 'starting', per_night_paise: 640000, taxes_included: false, meal_plan: 'breakfast' },
  available: null, distance_from_centre_km: 2.1,
}

export function searchResponse(items = [RESORT_CARD], extra = {}) {
  return {
    items, page: 1, page_size: 12, total: items.length, total_pages: items.length ? 1 : 0,
    applied_filters: {}, facets: { amenities: { wifi: 1, pool: 1 }, categories: {}, property_types: { cottage: 1 }, surroundings: {} },
    nights: null, ...extra,
  }
}
