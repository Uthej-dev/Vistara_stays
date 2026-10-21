import { Section } from '../../components/ui/Section'
import Icon from '../../components/ui/Icon'
import { TRUST_POINTS } from '../../data/catalog'

export default function TrustAndReviews() {
  return (
    <Section id="trust" eyebrow="Why Vistara" title="Booking you can trust">
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_POINTS.map((t) => (
          <li key={t.title}>
            <span className="grid size-11 place-items-center rounded-xl bg-forest-100 text-forest-800">
              <Icon name={t.icon} className="size-5" />
            </span>
            <h3 className="mt-4 font-semibold text-forest-900">{t.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{t.body}</p>
          </li>
        ))}
      </ul>

    </Section>
  )
}
