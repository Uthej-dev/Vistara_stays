import { ArrowRight, Building2 } from 'lucide-react'
import { Container } from '../../components/ui/Section'
import Button from '../../components/ui/Button'

export default function OwnerCta() {
  return (
    <section aria-labelledby="owner-cta-heading" className="pb-20">
      <Container>
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-cream-100 p-8 ring-1 ring-forest-900/5 sm:p-10 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-forest-800 text-cream-50 sm:grid">
              <Building2 className="size-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="owner-cta-heading" className="font-display text-2xl text-forest-900 sm:text-3xl">
                Own a resort, villa or homestay?
              </h2>
              <p className="mt-2 max-w-xl text-ink-600">
                List it on Vistara Stays. Manage rooms, prices and availability from one dashboard; our team reviews
                every listing before it goes live.
              </p>
            </div>
          </div>
          <Button to="/owners" size="lg">
            List your property <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </Container>
    </section>
  )
}
