import { Compass } from 'lucide-react'
import { Container } from '../components/ui/Section'
import Button from '../components/ui/Button'

export default function NotFoundPage() {
  return (
    <Container className="py-24">
      <div className="mx-auto max-w-lg text-center">
        <Compass className="mx-auto size-10 text-forest-700" aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold tracking-widest text-clay-600 uppercase">404</p>
        <h1 className="mt-1 font-display text-3xl text-forest-900">This trail doesn’t lead anywhere</h1>
        <p className="mt-2 text-ink-600">The page you’re looking for doesn’t exist or has moved.</p>
        <Button to="/" className="mt-6">
          Go to home
        </Button>
      </div>
    </Container>
  )
}
