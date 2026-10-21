import { Link } from 'react-router'
import { Mail } from 'lucide-react'
import Logo from './Logo'
import ApiStatus from '../ApiStatus'
import { Container } from '../ui/Section'
import { STATE_ORDER } from '../../data/destinations'
import { STATE_NAMES } from '../../utils/format'

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { to: '/destinations', label: 'All destinations' },
      ...STATE_ORDER.map((s) => ({ to: `/destinations?state=${s}`, label: STATE_NAMES[s] })),
    ],
  },
  {
    title: 'Help',
    links: [
      { to: '/help', label: 'Help centre' },
      { to: '/help/cancellations', label: 'Cancellations & refunds' },
      { to: '/trips', label: 'Manage a booking' },
      { to: '/contact', label: 'Contact us' },
    ],
  },
  {
    title: 'For property owners',
    links: [
      { to: '/owners', label: 'List your property' },
      { to: '/owners/register', label: 'Create an owner account' },
      { to: '/owner', label: 'Owner dashboard' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { to: '/terms', label: 'Terms of use' },
      { to: '/privacy', label: 'Privacy policy' },
      { to: '/credits', label: 'Photo credits' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="bg-forest-950 text-cream-100">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <Logo tone="light" />
            <p className="mt-4 text-sm leading-relaxed text-cream-100/75">
              Resorts, villas and nature retreats across Andhra Pradesh, Telangana, Karnataka, Kerala and
              Tamil Nadu.
            </p>
            <a
              href="mailto:hello@vistarastays.example"
              className="mt-4 inline-flex items-center gap-2 text-sm text-cream-50 underline-offset-4 hover:underline"
            >
              <Mail className="size-4" aria-hidden="true" />
              hello@vistarastays.example
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="text-xs font-semibold tracking-[0.18em] text-cream-50 uppercase">{col.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.to}>
                      <Link to={l.to} className="text-sm text-cream-100/75 hover:text-white">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-cream-100/10 pt-6 text-xs text-cream-100/65 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Vistara Stays · A portfolio project. Prices in INR (₹).</p>
          {import.meta.env.DEV && (
            <div className="[&_p]:text-xs [&_p]:text-cream-100/70">
              <ApiStatus />
            </div>
          )}
          <p>All listed properties and reviews are fictional samples. Destination photos: Wikimedia Commons.</p>
        </div>
      </Container>
    </footer>
  )
}
