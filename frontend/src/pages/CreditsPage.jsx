import { Container } from '../components/ui/Section'
import { ErrorState, Skeleton } from '../components/ui/States'
import { useDestinations } from '../features/catalog/queries'

/** Attribution for every Creative Commons photo used on the site (required by CC BY / BY-SA). */
export default function CreditsPage() {
  const { data, isPending, error, refetch } = useDestinations()

  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl text-forest-900">Photo credits</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        Destination photographs are from Wikimedia Commons and are used under the licences listed below. They show the
        destinations themselves — they are not photos of any listed property.
      </p>
      {error && <ErrorState className="mt-8" error={error} onRetry={refetch} />}
      {isPending && <Skeleton className="mt-8 h-96" />}
      {data && (
        <div className="mt-8 overflow-x-auto rounded-2xl bg-white ring-1 ring-forest-900/5">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-cream-100 text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Destination</th>
                <th scope="col" className="px-4 py-3 font-semibold">Photographer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Licence</th>
                <th scope="col" className="px-4 py-3 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-900/5">
              {data
                .filter((d) => d.image?.credit)
                .map(({ slug, name, image: { credit } }) => (
                  <tr key={slug}>
                    <td className="px-4 py-3 font-medium text-ink-900">{name}</td>
                    <td className="px-4 py-3 text-ink-600">{credit.author}</td>
                    <td className="px-4 py-3">
                      {credit.licenseUrl ? (
                        <a href={credit.licenseUrl} target="_blank" rel="noreferrer" className="text-forest-700 underline">
                          {credit.license}
                        </a>
                      ) : (
                        credit.license
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a href={credit.sourceUrl} target="_blank" rel="noreferrer" className="text-forest-700 underline">
                        Wikimedia Commons<span className="sr-only"> page for the {name} photo</span>
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  )
}
