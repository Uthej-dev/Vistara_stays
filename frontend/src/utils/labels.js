// Human-readable labels for enum values the API returns.

export const STATE_NAMES = {
  andhra_pradesh: 'Andhra Pradesh',
  telangana: 'Telangana',
  karnataka: 'Karnataka',
  kerala: 'Kerala',
  tamil_nadu: 'Tamil Nadu',
}

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

export const BED_LABELS = {
  king: 'king bed',
  queen: 'queen bed',
  double: 'double bed',
  twin: 'twin bed',
  single: 'single bed',
  sofa_bed: 'sofa bed',
  bunk: 'bunk bed',
}

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Guest rating' },
  { value: 'reviews', label: 'Most reviewed' },
]

export const BOOKING_STATUS_LABELS = {
  pending_payment: 'Awaiting payment',
  pending_owner: 'Awaiting property confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Declined by property',
  expired: 'Expired',
  no_show: 'No-show',
}

export const RESORT_STATUS_LABELS = {
  draft: 'Draft',
  pending_review: 'Pending review',
  published: 'Published',
  rejected: 'Changes requested',
  suspended: 'Suspended',
  archived: 'Archived',
}
