/**
 * Editorial content for the landing page (collections, guides, trust points). It refers to
 * destinations by slug; names and photos come from the destinations API.
 */

export const CATEGORY_IMAGES = {
  mountain_retreat: 'munnar',
  beach_resort: 'varkala',
  forest_stay: 'wayanad',
  luxury_villa: 'kumarakom',
  wellness_retreat: 'alleppey',
  family_resort: 'ooty',
}

export const COLLECTIONS = [
  { slug: 'weekend-from-bengaluru', title: 'Weekend from Bengaluru', description: 'Coffee country and forest rivers within a day’s drive.', destinations: ['coorg', 'chikmagalur', 'sakleshpur', 'kabini'] },
  { slug: 'weekend-from-hyderabad', title: 'Weekend from Hyderabad', description: 'Forest hills, lakes and dams for a short break.', destinations: ['ananthagiri-hills', 'nagarjuna-sagar', 'laknavaram'] },
  { slug: 'backwaters-and-lakes', title: 'Backwaters & lakes', description: 'Houseboats, bird sanctuaries and still water.', destinations: ['alleppey', 'kumarakom', 'laknavaram'] },
  { slug: 'heritage-trails', title: 'Heritage trails', description: 'Empires, temples and rock-cut monuments.', destinations: ['hampi', 'mahabalipuram', 'nagarjuna-sagar'] },
]

export const GUIDES = [
  { destination: 'munnar', title: 'Munnar for first-timers', points: ['Tea museum and estate walks', 'Eravikulam National Park', 'Best: Sep – Mar'] },
  { destination: 'hampi', title: 'Two days in Hampi', points: ['Virupaksha Temple at sunrise', 'Coracle ride on the Tungabhadra', 'Best: Oct – Feb'] },
  { destination: 'wayanad', title: 'Wayanad beyond the monsoon', points: ['Edakkal Caves petroglyphs', 'Chembra Peak trek', 'Best: Oct – May'] },
]

export const TRUST_POINTS = [
  { icon: 'ShieldCheck', title: 'Every listing reviewed', body: 'Properties go live only after our team checks the details, photos and policies.' },
  { icon: 'ReceiptIndianRupee', title: 'Prices without surprises', body: 'Taxes, fees and meal plans are itemised before you confirm — never added at checkout.' },
  { icon: 'CalendarCheck', title: 'Real availability', body: 'Rooms are held for you while you pay, so you never book a room that is already gone.' },
  { icon: 'MessageSquareQuote', title: 'Reviews from real stays', body: 'Only guests with a completed booking can review a property.' },
]
