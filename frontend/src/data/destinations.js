/**
 * Destination data used by the landing page until the destinations API exists (Phase 4).
 * Phase 4 seeds the same records into MongoDB, then the UI switches to `GET /destinations`.
 *
 * Summaries are general travel information about public places, not claims about businesses.
 * Photos come from Wikimedia Commons with author + licence (see destinationImages.json, generated
 * by scripts/fetch_wikimedia_images.py).
 */
import images from './destinationImages.json'

const RAW = [
  // Andhra Pradesh
  { slug: 'araku-valley', name: 'Araku Valley', state: 'andhra_pradesh', district: 'Alluri Sitharama Raju', region: 'Eastern Ghats', types: ['hill_station', 'plantation'], bestMonths: [10, 11, 12, 1, 2, 3], summary: 'Coffee estates, tribal heritage and the limestone Borra Caves in the Eastern Ghats.' },
  { slug: 'lambasingi', name: 'Lambasingi', state: 'andhra_pradesh', district: 'Alluri Sitharama Raju', region: 'Eastern Ghats', types: ['hill_station'], bestMonths: [11, 12, 1], summary: 'A misty hill village known for some of the coolest winter mornings in Andhra Pradesh.' },
  { slug: 'horsley-hills', name: 'Horsley Hills', state: 'andhra_pradesh', district: 'Annamayya', region: 'Rayalaseema', types: ['hill_station'], bestMonths: [10, 11, 12, 1, 2], summary: 'A compact hill retreat with rocky viewpoints over the surrounding plains.' },
  { slug: 'visakhapatnam', name: 'Visakhapatnam', state: 'andhra_pradesh', district: 'Visakhapatnam', region: 'Coastal Andhra', types: ['beach', 'city'], bestMonths: [10, 11, 12, 1, 2, 3], summary: 'A coastal city with Rushikonda and Yarada beaches and the Eastern Ghats close by.' },
  // Telangana
  { slug: 'ananthagiri-hills', name: 'Ananthagiri Hills', state: 'telangana', district: 'Vikarabad', region: 'Deccan Plateau', types: ['hill_station', 'forest'], bestMonths: [7, 8, 9, 10, 11, 12, 1, 2], summary: 'Forested hills within easy reach of Hyderabad, where the Musi river begins.' },
  { slug: 'laknavaram', name: 'Laknavaram', state: 'telangana', district: 'Mulugu', region: 'Godavari Valley', types: ['lake', 'forest'], bestMonths: [8, 9, 10, 11, 12, 1, 2], summary: 'A hill-ringed lake with small islands and a long suspension bridge.' },
  { slug: 'nagarjuna-sagar', name: 'Nagarjuna Sagar', state: 'telangana', district: 'Nalgonda', region: 'Krishna Valley', types: ['lake', 'heritage'], bestMonths: [8, 9, 10, 11, 12, 1, 2], summary: 'A vast masonry dam on the Krishna, with the Buddhist site of Nagarjunakonda on an island.' },
  // Karnataka
  { slug: 'coorg', name: 'Coorg', state: 'karnataka', district: 'Kodagu', region: 'Western Ghats', types: ['hill_station', 'plantation'], bestMonths: [10, 11, 12, 1, 2, 3], summary: 'Coffee estates, rolling misty hills, waterfalls and Kodava cuisine.' },
  { slug: 'chikmagalur', name: 'Chikmagalur', state: 'karnataka', district: 'Chikkamagaluru', region: 'Western Ghats', types: ['hill_station', 'plantation'], bestMonths: [9, 10, 11, 12, 1, 2, 3], summary: "Where coffee was first grown in India, below Mullayanagiri, Karnataka's highest peak." },
  { slug: 'sakleshpur', name: 'Sakleshpur', state: 'karnataka', district: 'Hassan', region: 'Western Ghats', types: ['hill_station', 'plantation'], bestMonths: [9, 10, 11, 12, 1, 2], summary: 'Spice and coffee estates, monsoon trails and the star-shaped Manjarabad Fort.' },
  { slug: 'gokarna', name: 'Gokarna', state: 'karnataka', district: 'Uttara Kannada', region: 'Konkan Coast', types: ['beach', 'heritage'], bestMonths: [10, 11, 12, 1, 2, 3], summary: 'A temple town with quiet crescent beaches such as Kudle, Om and Half Moon.' },
  { slug: 'kabini', name: 'Kabini', state: 'karnataka', district: 'Mysuru', region: 'Nilgiri Biosphere', types: ['forest', 'wildlife', 'lake'], bestMonths: [10, 11, 12, 1, 2, 3, 4, 5], summary: 'Riverside forest on the edge of Nagarhole National Park, known for wildlife safaris.' },
  { slug: 'hampi', name: 'Hampi', state: 'karnataka', district: 'Vijayanagara', region: 'Deccan Plateau', types: ['heritage'], bestMonths: [10, 11, 12, 1, 2], summary: 'A UNESCO World Heritage Site: the ruins of the Vijayanagara Empire among giant boulders.' },
  // Kerala
  { slug: 'munnar', name: 'Munnar', state: 'kerala', district: 'Idukki', region: 'Western Ghats', types: ['hill_station', 'plantation'], bestMonths: [9, 10, 11, 12, 1, 2, 3], summary: 'Endless tea estates, Eravikulam National Park and cool high-altitude air.' },
  { slug: 'wayanad', name: 'Wayanad', state: 'kerala', district: 'Wayanad', region: 'Western Ghats', types: ['forest', 'hill_station', 'wildlife'], bestMonths: [10, 11, 12, 1, 2, 3, 4, 5], summary: 'Forested highlands with Edakkal Caves, Chembra Peak and wildlife sanctuaries.' },
  { slug: 'alleppey', name: 'Alleppey', state: 'kerala', district: 'Alappuzha', region: 'Kuttanad', types: ['backwater', 'lake'], bestMonths: [11, 12, 1, 2], summary: 'Houseboat journeys through palm-lined canals of the Kerala backwaters.' },
  { slug: 'thekkady', name: 'Thekkady', state: 'kerala', district: 'Idukki', region: 'Western Ghats', types: ['forest', 'wildlife'], bestMonths: [10, 11, 12, 1, 2, 3], summary: 'Gateway to the Periyar Tiger Reserve, with spice gardens and boat rides on Periyar Lake.' },
  { slug: 'varkala', name: 'Varkala', state: 'kerala', district: 'Thiruvananthapuram', region: 'Malabar Coast', types: ['beach'], bestMonths: [11, 12, 1, 2, 3], summary: 'Red laterite cliffs rising straight above the Arabian Sea.' },
  { slug: 'kumarakom', name: 'Kumarakom', state: 'kerala', district: 'Kottayam', region: 'Kuttanad', types: ['backwater', 'lake'], bestMonths: [11, 12, 1, 2], summary: 'A backwater village on Vembanad Lake with a well-known bird sanctuary.' },
  // Tamil Nadu
  { slug: 'ooty', name: 'Ooty', state: 'tamil_nadu', district: 'Nilgiris', region: 'Nilgiri Hills', types: ['hill_station', 'lake'], bestMonths: [3, 4, 5, 6, 10, 11], summary: 'The classic hill station: the Nilgiri Mountain Railway, botanical gardens and Ooty Lake.' },
  { slug: 'kodaikanal', name: 'Kodaikanal', state: 'tamil_nadu', district: 'Dindigul', region: 'Palani Hills', types: ['hill_station', 'lake'], bestMonths: [3, 4, 5, 6, 9, 10], summary: 'A star-shaped lake, pine forests and cliff-edge viewpoints in the Palani Hills.' },
  { slug: 'yercaud', name: 'Yercaud', state: 'tamil_nadu', district: 'Salem', region: 'Shevaroy Hills', types: ['hill_station', 'lake'], bestMonths: [10, 11, 12, 1, 2, 3, 4, 5], summary: 'Coffee estates and a calm lake in the Shevaroy Hills.' },
  { slug: 'coonoor', name: 'Coonoor', state: 'tamil_nadu', district: 'Nilgiris', region: 'Nilgiri Hills', types: ['hill_station', 'plantation'], bestMonths: [3, 4, 5, 6, 10, 11], summary: 'Tea gardens, Sim\'s Park and the toy train — a quieter alternative to Ooty.' },
  { slug: 'valparai', name: 'Valparai', state: 'tamil_nadu', district: 'Coimbatore', region: 'Anamalai Hills', types: ['plantation', 'wildlife'], bestMonths: [9, 10, 11, 12, 1, 2, 3], summary: 'Tea estates reached by forty hairpin bends, with frequent wildlife sightings.' },
  { slug: 'mahabalipuram', name: 'Mahabalipuram', state: 'tamil_nadu', district: 'Chengalpattu', region: 'Coromandel Coast', types: ['beach', 'heritage'], bestMonths: [11, 12, 1, 2], summary: 'UNESCO-listed Pallava monuments, including the Shore Temple, beside the sea.' },
]

export const DESTINATIONS = RAW.map((d) => ({ ...d, image: images[d.slug] }))

export const DESTINATIONS_BY_SLUG = Object.fromEntries(DESTINATIONS.map((d) => [d.slug, d]))

export const STATE_ORDER = ['karnataka', 'kerala', 'tamil_nadu', 'andhra_pradesh', 'telangana']

export const DESTINATION_TYPE_LABELS = {
  hill_station: 'Hill station',
  plantation: 'Plantations',
  beach: 'Beach',
  backwater: 'Backwaters',
  lake: 'Lake',
  forest: 'Forest',
  wildlife: 'Wildlife',
  heritage: 'Heritage',
  city: 'City',
}

/** Destinations whose best months include `month` (1–12). */
export function destinationsInSeason(month) {
  return DESTINATIONS.filter((d) => d.bestMonths.includes(month))
}
