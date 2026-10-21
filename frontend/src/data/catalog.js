/**
 * Categories, amenities, curated collections and sample reviews for the landing page.
 * Categories/amenities move to the `categories` collection in Phase 4 (admin-managed).
 */
import { DESTINATIONS_BY_SLUG } from './destinations'

export const CATEGORIES = [
  { slug: 'mountain_retreat', name: 'Mountain retreats', blurb: 'Cool air, tea slopes and valley views', image: 'munnar', icon: 'Mountain' },
  { slug: 'beach_resort', name: 'Beach resorts', blurb: 'Cliffs, coves and sunset decks', image: 'varkala', icon: 'Waves' },
  { slug: 'forest_stay', name: 'Forest stays', blurb: 'Wake up to birdsong and safari drives', image: 'wayanad', icon: 'Trees' },
  { slug: 'luxury_villa', name: 'Luxury villas', blurb: 'Private pools and space to spread out', image: 'kumarakom', icon: 'Gem' },
  { slug: 'wellness_retreat', name: 'Wellness retreats', blurb: 'Ayurveda, yoga and slow mornings', image: 'alleppey', icon: 'Flower2' },
  { slug: 'family_resort', name: 'Family resorts', blurb: 'Room to play, menus for every age', image: 'ooty', icon: 'Users' },
].map((c) => ({ ...c, image: DESTINATIONS_BY_SLUG[c.image].image }))

export const AMENITIES = {
  wifi: { label: 'Wi-Fi', icon: 'Wifi' },
  pool: { label: 'Swimming pool', icon: 'WavesLadder' },
  parking: { label: 'Free parking', icon: 'SquareParking' },
  restaurant: { label: 'Restaurant', icon: 'UtensilsCrossed' },
  spa: { label: 'Spa', icon: 'Sparkles' },
  pet_friendly: { label: 'Pet friendly', icon: 'PawPrint' },
  kids_play_area: { label: 'Kids play area', icon: 'Baby' },
}

export const COLLECTIONS = [
  { slug: 'weekend-from-bengaluru', title: 'Weekend from Bengaluru', description: 'Coffee country and forest rivers within a day’s drive.', destinations: ['coorg', 'chikmagalur', 'sakleshpur', 'kabini'] },
  { slug: 'weekend-from-hyderabad', title: 'Weekend from Hyderabad', description: 'Forest hills, lakes and dams for a short break.', destinations: ['ananthagiri-hills', 'nagarjuna-sagar', 'laknavaram'] },
  { slug: 'backwaters-and-lakes', title: 'Backwaters & lakes', description: 'Houseboats, bird sanctuaries and still water.', destinations: ['alleppey', 'kumarakom', 'laknavaram'] },
  { slug: 'heritage-trails', title: 'Heritage trails', description: 'Empires, temples and rock-cut monuments.', destinations: ['hampi', 'mahabalipuram', 'nagarjuna-sagar'] },
].map((c) => ({ ...c, cover: DESTINATIONS_BY_SLUG[c.destinations[0]].image }))

export const GUIDES = [
  { destination: 'munnar', title: 'Munnar for first-timers', points: ['Tea museum and estate walks', 'Eravikulam National Park', 'Best: Sep – Mar'] },
  { destination: 'hampi', title: 'Two days in Hampi', points: ['Virupaksha Temple at sunrise', 'Coracle ride on the Tungabhadra', 'Best: Oct – Feb'] },
  { destination: 'wayanad', title: 'Wayanad beyond the monsoon', points: ['Edakkal Caves petroglyphs', 'Chembra Peak trek', 'Best: Oct – May'] },
].map((g) => ({ ...g, image: DESTINATIONS_BY_SLUG[g.destination].image, name: DESTINATIONS_BY_SLUG[g.destination].name }))

/** SAMPLE reviews — written for demonstration, not by real guests. Labelled in the UI. */
export const SAMPLE_REVIEWS = [
  { id: 's1', author: 'Sample guest A.', stay: 'Misty Fern Estate Stay · Coorg', rating: 5, body: 'The estate walk before breakfast was the highlight. Rooms were spotless and the hosts explained exactly what the price included before we booked.' },
  { id: 's2', author: 'Sample guest R.', stay: 'Kayal Drift Lake Villas · Kumarakom', rating: 5, body: 'Calm, private and close to the bird sanctuary. Check-in was quick because our booking details were already with the property.' },
  { id: 's3', author: 'Sample guest M.', stay: 'Nilgiri Pine Lodge · Ooty', rating: 4, body: 'Great for a family trip with young kids. It gets cold at night, so pack layers. Cancellation terms were clear from the start.' },
]

export const TRUST_POINTS = [
  { icon: 'ShieldCheck', title: 'Every listing reviewed', body: 'Properties go live only after our team checks the details, photos and policies.' },
  { icon: 'ReceiptIndianRupee', title: 'Prices without surprises', body: 'Taxes, fees and meal plans are itemised before you confirm — never added at checkout.' },
  { icon: 'CalendarCheck', title: 'Real availability', body: 'Rooms are held for you while you pay, so you never book a room that is already gone.' },
  { icon: 'MessageSquareQuote', title: 'Reviews from real stays', body: 'Only guests with a completed booking can review a property.' },
]
