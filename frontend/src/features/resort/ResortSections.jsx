import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BedDouble, Clock, Dog, Ruler, Users, Ban, Accessibility, IdCard, Utensils, CigaretteOff, Baby, MapPin } from 'lucide-react'
import Icon from '../../components/ui/Icon'
import SmartImage from '../../components/ui/SmartImage'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import { BED_LABELS, MEAL_PLAN_LABELS } from '../../utils/labels'
import { formatINR, plural } from '../../utils/format'
import { sendEnquiry } from '../../api/stays'
import { fieldErrors, toApiError } from '../../api/client'

export function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="font-display text-2xl text-forest-900 sm:text-3xl">
      {children}
    </h2>
  )
}

export function Amenities({ slugs, lookup }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {slugs.map((slug) => (
        <li key={slug} className="flex items-center gap-2.5 text-ink-900">
          <span className="grid size-9 place-items-center rounded-xl bg-forest-100 text-forest-800">
            <Icon name={lookup[slug]?.icon} className="size-4.5" />
          </span>
          {lookup[slug]?.name ?? slug}
        </li>
      ))}
    </ul>
  )
}

export function RoomCard({ room, availability, selected, onSelect, datesChosen, fallbackImage }) {
  const beds = room.beds.map((b) => `${b.count} ${BED_LABELS[b.type] ?? b.type}${b.count > 1 ? 's' : ''}`).join(' + ')
  return (
    <article
      className={`grid gap-4 rounded-2xl bg-white p-4 ring-1 sm:grid-cols-[180px_1fr_auto] ${selected ? 'ring-2 ring-forest-700' : 'ring-forest-900/10'}`}
    >
      <SmartImage image={room.images?.[0] ?? fallbackImage} alt={room.images?.[0]?.alt ?? ''} sizes="180px" className="aspect-[4/3] rounded-xl" />
      <div>
        <h3 className="font-display text-xl text-forest-900">{room.name}</h3>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
          <li className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" /> Up to {plural(room.max_adults, 'adult')}
            {room.max_children ? `, ${plural(room.max_children, 'child', 'children')}` : ''}
          </li>
          <li className="flex items-center gap-1.5">
            <BedDouble className="size-4" aria-hidden="true" /> {beds}
          </li>
          {room.size_sqft && (
            <li className="flex items-center gap-1.5">
              <Ruler className="size-4" aria-hidden="true" /> {room.size_sqft} sq ft
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Utensils className="size-4" aria-hidden="true" /> {MEAL_PLAN_LABELS[room.meal_plan]}
          </li>
        </ul>
        <p className="mt-2 text-xs text-ink-600">
          Rate covers {plural(room.base_occupancy, 'guest')} per room. Extra adult {formatINR(room.extra_adult_paise)}/night
          {room.extra_child_paise ? `, extra child ${formatINR(room.extra_child_paise)}/night` : ''}.
        </p>
      </div>
      <div className="flex flex-col items-start justify-between gap-3 sm:items-end sm:text-right">
        {datesChosen && availability ? (
          availability.bookable ? (
            <p>
              <span className="block text-lg font-semibold text-ink-900">{formatINR(availability.price.total_paise)}</span>
              <span className="text-xs text-ink-600">total incl. taxes</span>
            </p>
          ) : (
            <p className="text-sm font-medium text-clay-600">{availability.unavailable_reason}</p>
          )
        ) : (
          <p>
            <span className="text-xs text-ink-600">from </span>
            <span className="text-lg font-semibold text-ink-900">{formatINR(room.base_rate_paise)}</span>
            <span className="block text-xs text-ink-600">per night, excl. taxes</span>
          </p>
        )}
        <button
          type="button"
          onClick={onSelect}
          disabled={datesChosen && availability && !availability.bookable}
          aria-pressed={selected}
          className="h-10 rounded-full bg-forest-800 px-5 text-sm font-semibold text-cream-50 hover:bg-forest-700 disabled:bg-forest-900/15 disabled:text-ink-600"
        >
          {selected ? 'Selected' : datesChosen ? 'Select room' : 'Check dates'}
        </button>
      </div>
    </article>
  )
}

export function Policies({ policies }) {
  const items = [
    { icon: Clock, title: 'Check-in / check-out', body: `Check-in from ${policies.check_in_time} · Check-out by ${policies.check_out_time}` },
    { icon: Baby, title: 'Children', body: `Children under ${policies.child_free_age} stay free and don’t count towards room capacity.` },
    { icon: policies.pets_allowed ? Dog : Ban, title: 'Pets', body: policies.pets_allowed ? 'Pets are welcome.' : 'Pets are not allowed.' },
    { icon: CigaretteOff, title: 'Smoking', body: policies.smoking_allowed ? 'Smoking allowed in designated areas.' : 'Non-smoking property.' },
    { icon: IdCard, title: 'ID at check-in', body: 'Every adult guest must show a valid government photo ID at check-in. We never ask you to upload ID online.' },
  ]
  if (policies.accessibility?.length) items.push({ icon: Accessibility, title: 'Accessibility', body: policies.accessibility.join(' · ') })
  if (policies.meals_note) items.push({ icon: Utensils, title: 'Meals', body: policies.meals_note })

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-forest-900">Cancellation</h3>
        {policies.cancellation_policy.description && <p className="mt-1 text-sm text-ink-600">{policies.cancellation_policy.description}</p>}
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {policies.cancellation_policy.tiers.map((t) => (
            <li key={t.days_before_check_in} className="rounded-xl bg-cream-100 px-3 py-2.5 text-sm">
              <span className="block font-semibold text-forest-900">{t.refund_pct}% refund</span>
              <span className="text-ink-600">{t.days_before_check_in > 0 ? `${t.days_before_check_in}+ days before check-in` : 'Less than that'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-600">The policy shown when you book is saved with your booking and applies even if the property changes it later.</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map(({ icon: IconComponent, title, body }) => (
          <li key={title} className="flex gap-3">
            <IconComponent className="mt-0.5 size-5 shrink-0 text-forest-700" aria-hidden="true" />
            <div>
              <p className="font-medium text-ink-900">{title}</p>
              <p className="text-sm text-ink-600">{body}</p>
            </div>
          </li>
        ))}
      </ul>
      {policies.house_rules?.length > 0 && (
        <div>
          <h3 className="font-semibold text-forest-900">House rules</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600">
            {policies.house_rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function LocationMap({ location, name, attractions }) {
  const d = 0.03
  const bbox = [location.lng - d, location.lat - d, location.lng + d, location.lat + d].join(',')
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${location.lat},${location.lng}`
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <iframe title={`Map showing the area around ${name}`} src={src} loading="lazy" className="aspect-[4/3] w-full rounded-2xl border-0 bg-forest-100" />
        <p className="mt-2 text-xs text-ink-600">
          Approximate location. The exact address is shared after booking.{' '}
          <a className="underline" href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=13/${location.lat}/${location.lng}`} target="_blank" rel="noreferrer">
            Open larger map
          </a>{' '}
          · © OpenStreetMap contributors
        </p>
      </div>
      {attractions.length > 0 && (
        <div>
          <h3 className="font-semibold text-forest-900">Nearby attractions</h3>
          <ul className="mt-3 space-y-2.5">
            {attractions.map((a) => (
              <li key={a.name} className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 size-4 shrink-0 text-forest-700" aria-hidden="true" />
                <span>
                  <span className="text-ink-900">{a.name}</span>
                  {a.distance_km != null && <span className="text-ink-600"> · {a.distance_km} km</span>}
                  {a.note && <span className="block text-ink-600">{a.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(1000),
})

export function EnquiryForm({ resortId, user }) {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(enquirySchema), defaultValues: { name: user?.name ?? '', email: user?.email ?? '', message: '' } })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await sendEnquiry(resortId, values)
      setSent(true)
      reset({ ...values, message: '' })
    } catch (error) {
      const byField = fieldErrors(error)
      Object.entries(byField).forEach(([name, message]) => setError(name, { message }))
      if (!Object.keys(byField).length) setServerError(toApiError(error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 space-y-3">
        <FormAlert>{serverError}</FormAlert>
        {sent && <FormAlert tone="success">Your question has been sent. The property usually replies by email.</FormAlert>}
      </div>
      <TextField label="Your name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <TextField as="textarea" label="Your question" className="sm:col-span-2" error={errors.message?.message} {...register('message')} />
      <div className="sm:col-span-2">
        <SubmitButton loading={isSubmitting}>Send enquiry</SubmitButton>
      </div>
    </form>
  )
}
