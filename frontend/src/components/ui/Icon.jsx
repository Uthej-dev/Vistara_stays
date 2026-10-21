import {
  Baby,
  CalendarCheck,
  Flower2,
  Gem,
  MessageSquareQuote,
  Mountain,
  PawPrint,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  SquareParking,
  Trees,
  Users,
  UtensilsCrossed,
  Waves,
  WavesLadder,
  Wifi,
} from 'lucide-react'

// Data files refer to icons by name (so the backend can store them as strings later).
// Explicit imports keep the bundle small: only these icons are included.
const ICONS = {
  Baby,
  CalendarCheck,
  Flower2,
  Gem,
  MessageSquareQuote,
  Mountain,
  PawPrint,
  ReceiptIndianRupee,
  ShieldCheck,
  Sparkles,
  SquareParking,
  Trees,
  Users,
  UtensilsCrossed,
  Waves,
  WavesLadder,
  Wifi,
}

export default function Icon({ name, ...props }) {
  const Component = ICONS[name] ?? Sparkles
  return <Component aria-hidden="true" {...props} />
}
