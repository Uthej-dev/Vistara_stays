import ApiStatus from './components/ApiStatus'

// Phase 2 placeholder: proves the frontend → API → MongoDB chain works.
// Replaced by the router and landing page in Phase 3.
export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4">
      <p className="text-sm font-medium tracking-widest text-clay-600 uppercase">South India</p>
      <h1 className="text-4xl font-semibold text-forest-800 sm:text-5xl">Vistara Stays</h1>
      <p className="text-lg text-ink-600">
        Resorts, villas and nature retreats from Coorg to Kumarakom. Coming together, phase by
        phase.
      </p>
      <ApiStatus />
    </main>
  )
}
