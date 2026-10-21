import { useEffect } from 'react'
import SmartImage from '../components/ui/SmartImage'
import { useDestinationMap } from '../features/catalog/queries'

/** Split layout for sign-in/up pages: form on the left, destination photo on the right. */
export default function AuthLayout({ title, subtitle, children, photo = 'munnar' }) {
  const { map } = useDestinationMap()

  useEffect(() => {
    document.title = `${title} · Vistara Stays`
  }, [title])

  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl text-forest-900 sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="relative hidden bg-forest-800 lg:block">
        {map[photo]?.image && <SmartImage image={map[photo].image} alt="" fill sizes="50vw" />}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-950/60 to-transparent" />
        {map[photo] && <p className="absolute bottom-6 left-6 font-display text-2xl text-cream-50">{map[photo].name}</p>}
      </div>
    </div>
  )
}
