import {
  Accessibility,
  Baby,
  Building,
  CalendarCheck,
  Car,
  Flame,
  Flower2,
  Gem,
  Leaf,
  MessageSquareQuote,
  Mountain,
  PawPrint,
  ReceiptIndianRupee,
  Sailboat,
  ShieldCheck,
  Sparkles,
  Sprout,
  SquareParking,
  Trees,
  Users,
  UtensilsCrossed,
  Waves,
  WavesLadder,
  Wifi,
  Zap,
} from 'lucide-react'

// The API stores icon names as strings (categories/amenities are admin-managed data).
// Explicit imports keep the bundle small: only these icons are included.
const ICONS = {
  Accessibility,
  Baby,
  Building,
  CalendarCheck,
  Car,
  Flame,
  Flower2,
  Gem,
  Leaf,
  MessageSquareQuote,
  Mountain,
  PawPrint,
  ReceiptIndianRupee,
  Sailboat,
  ShieldCheck,
  Sparkles,
  Sprout,
  SquareParking,
  Trees,
  Users,
  UtensilsCrossed,
  Waves,
  WavesLadder,
  Wifi,
  Zap,
}

export default function Icon({ name, ...props }) {
  const Component = ICONS[name] ?? Sparkles
  return <Component aria-hidden="true" {...props} />
}
