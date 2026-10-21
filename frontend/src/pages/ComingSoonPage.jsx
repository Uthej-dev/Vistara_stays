import { Hammer } from 'lucide-react'
import { Container } from '../components/ui/Section'
import Button from '../components/ui/Button'

/** Placeholder for routes that later phases build, so navigation never dead-ends. */
export default function ComingSoonPage({ title, phase }) {
  return (
    <Container className="py-24">
      <div className="mx-auto max-w-lg text-center">
        <Hammer className="mx-auto size-10 text-forest-700" aria-hidden="true" />
        <h1 className="mt-4 font-display text-3xl text-forest-900">{title}</h1>
        <p className="mt-2 text-ink-600">This page is being built{phase ? ` in Phase ${phase}` : ''}.</p>
        <Button to="/" variant="outline" className="mt-6">
          Back to home
        </Button>
      </div>
    </Container>
  )
}
