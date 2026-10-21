/**
 * FICTIONAL sample resorts for the landing page. None of these businesses exist.
 * Every record has `isSample: true`, and the UI shows a "Sample property" badge for it.
 * Photos are destination scenery (not of any real property) and are marked as illustrative.
 * Ratings are derived from sample reviews and labelled as such in the UI.
 * Shapes mirror the planned API (`GET /resorts/featured`). Money is integer paise.
 */
import { DESTINATIONS_BY_SLUG } from './destinations'

const RAW = [
  { slug: 'misty-fern-estate-coorg', name: 'Misty Fern Estate Stay', destination: 'coorg', propertyType: 'cottage', categories: ['mountain_retreat', 'family_resort'], amenities: ['wifi', 'parking', 'restaurant', 'kids_play_area'], startingPricePaise: 640000, mealPlan: 'breakfast', rating: { avg: 4.6, count: 18 } },
  { slug: 'teafold-hill-cottages-munnar', name: 'Teafold Hill Cottages', destination: 'munnar', propertyType: 'cottage', categories: ['mountain_retreat'], amenities: ['wifi', 'parking', 'restaurant'], startingPricePaise: 520000, mealPlan: 'breakfast', rating: { avg: 4.4, count: 26 } },
  { slug: 'kayal-drift-villas-kumarakom', name: 'Kayal Drift Lake Villas', destination: 'kumarakom', propertyType: 'villa', categories: ['luxury_villa', 'wellness_retreat'], amenities: ['pool', 'spa', 'wifi', 'restaurant'], startingPricePaise: 1450000, mealPlan: 'breakfast', rating: { avg: 4.8, count: 12 } },
  { slug: 'laterite-cliff-retreat-varkala', name: 'Laterite Cliff Retreat', destination: 'varkala', propertyType: 'boutique_hotel', categories: ['beach_resort', 'wellness_retreat'], amenities: ['pool', 'wifi', 'spa', 'restaurant'], startingPricePaise: 780000, mealPlan: 'room_only', rating: { avg: 4.3, count: 31 } },
  { slug: 'banyan-trail-camp-kabini', name: 'Banyan Trail River Camp', destination: 'kabini', propertyType: 'tent', categories: ['forest_stay'], amenities: ['parking', 'restaurant', 'pet_friendly'], startingPricePaise: 910000, mealPlan: 'full_board', rating: { avg: 4.7, count: 9 } },
  { slug: 'nilgiri-pine-lodge-ooty', name: 'Nilgiri Pine Lodge', destination: 'ooty', propertyType: 'resort', categories: ['mountain_retreat', 'family_resort'], amenities: ['wifi', 'parking', 'restaurant', 'kids_play_area'], startingPricePaise: 450000, mealPlan: 'breakfast', rating: { avg: 4.2, count: 40 } },
  { slug: 'shoreline-sands-gokarna', name: 'Shoreline Sands Huts', destination: 'gokarna', propertyType: 'cottage', categories: ['beach_resort'], amenities: ['wifi', 'restaurant', 'pet_friendly'], startingPricePaise: 300000, mealPlan: 'room_only', rating: { avg: 4.1, count: 22 } },
  { slug: 'coffee-ridge-homestay-araku', name: 'Coffee Ridge Homestay', destination: 'araku-valley', propertyType: 'homestay', categories: ['mountain_retreat', 'family_resort'], amenities: ['parking', 'restaurant', 'wifi'], startingPricePaise: 280000, mealPlan: 'breakfast', rating: { avg: 4.5, count: 15 } },
]

export const SAMPLE_RESORTS = RAW.map((r) => {
  const destination = DESTINATIONS_BY_SLUG[r.destination]
  return {
    ...r,
    isSample: true,
    destination: { slug: destination.slug, name: destination.name, state: destination.state },
    image: {
      ...destination.image,
      alt: `${destination.image.alt} (illustrative destination photo, not the property)`,
    },
  }
})

export const MEAL_PLAN_LABELS = {
  room_only: 'Room only',
  breakfast: 'Breakfast included',
  half_board: 'Breakfast & dinner',
  full_board: 'All meals included',
}

export const PROPERTY_TYPE_LABELS = {
  resort: 'Resort',
  villa: 'Villa',
  cottage: 'Cottage',
  homestay: 'Homestay',
  boutique_hotel: 'Boutique hotel',
  treehouse: 'Treehouse',
  houseboat: 'Houseboat',
  tent: 'Luxury tent',
}
