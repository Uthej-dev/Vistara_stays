import { ArrowRight, Info } from 'lucide-react'
import { Section } from '../../components/ui/Section'
import Button from '../../components/ui/Button'
import ResortCard from '../../components/resort/ResortCard'
import { SAMPLE_RESORTS } from '../../data/sampleResorts'

export default function FeaturedResorts() {
  return (
    <Section
      id="featured"
      eyebrow="Handpicked stays"
      title="Featured resorts"
      description="Cottages, villas and camps chosen for their setting."
      className="bg-white/60"
      action={
        <Button to="/search" variant="outline" size="sm">
          Browse all stays <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      }
    >
      <p className="mb-6 flex items-start gap-2 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
        These are fictional sample properties for demonstration. Photos show the destination, not the property.
        Prices are starting rates per room per night and exclude taxes and fees.
      </p>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {SAMPLE_RESORTS.map((r) => (
          <li key={r.slug} className="flex">
            <ResortCard resort={r} />
          </li>
        ))}
      </ul>
    </Section>
  )
}
