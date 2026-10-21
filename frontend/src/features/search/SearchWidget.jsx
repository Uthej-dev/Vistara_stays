import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'
import { CalendarDays, MapPin, Search } from 'lucide-react'
import GuestSelector from './GuestSelector'
import { defaultSearchValues, searchSchema, suggestedCheckOut, toSearchParams } from './searchSchema'
import { DESTINATIONS } from '../../data/destinations'
import { addDays, todayIST } from '../../utils/dates'
import { cn } from '../../utils/cn'

const fieldClass =
  'h-11 w-full rounded-xl border border-forest-900/15 bg-white pl-9 pr-3 text-ink-900 placeholder:text-ink-600/70 hover:border-forest-900/30'

function Field({ id, label, icon: IconComponent, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">
        {label}
      </label>
      <div className="relative">
        <IconComponent className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-forest-700" aria-hidden="true" />
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-clay-600">
          {error}
        </p>
      )}
    </div>
  )
}

/** The main booking search: destination, dates, rooms and guests → /search?... */
export default function SearchWidget({ className }) {
  const navigate = useNavigate()
  const ids = { destination: useId(), checkIn: useId(), checkOut: useId(), list: useId() }
  const today = todayIST()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm({ resolver: zodResolver(searchSchema), defaultValues: defaultSearchValues() })

  const checkIn = watch('checkIn')

  const onSubmit = (values) => navigate(`/search?${toSearchParams(values)}`)

  const describedBy = (id, error) => (error ? `${id}-error` : undefined)

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Search stays"
      className={cn(
        'grid gap-3 rounded-3xl bg-cream-50/95 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur sm:p-5 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr_auto] lg:items-start',
        className,
      )}
    >
      <Field id={ids.destination} label="Where to?" icon={MapPin} error={errors.destination?.message}>
        <input
          id={ids.destination}
          type="text"
          list={ids.list}
          autoComplete="off"
          placeholder="Coorg, Munnar, a resort name…"
          aria-invalid={Boolean(errors.destination)}
          aria-describedby={describedBy(ids.destination, errors.destination)}
          className={fieldClass}
          {...register('destination')}
        />
        <datalist id={ids.list}>
          {DESTINATIONS.map((d) => (
            <option key={d.slug} value={d.name} />
          ))}
        </datalist>
      </Field>

      <Field id={ids.checkIn} label="Check-in" icon={CalendarDays} error={errors.checkIn?.message}>
        <input
          id={ids.checkIn}
          type="date"
          min={today}
          aria-invalid={Boolean(errors.checkIn)}
          aria-describedby={describedBy(ids.checkIn, errors.checkIn)}
          className={fieldClass}
          {...register('checkIn', {
            onChange: (event) => {
              const value = event.target.value
              const out = getValues('checkOut')
              if (value && (!out || out <= value)) setValue('checkOut', suggestedCheckOut(value))
            },
          })}
        />
      </Field>

      <Field id={ids.checkOut} label="Check-out" icon={CalendarDays} error={errors.checkOut?.message}>
        <input
          id={ids.checkOut}
          type="date"
          min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
          aria-invalid={Boolean(errors.checkOut)}
          aria-describedby={describedBy(ids.checkOut, errors.checkOut)}
          className={fieldClass}
          {...register('checkOut')}
        />
      </Field>

      <GuestSelector
        value={{ rooms: watch('rooms'), adults: watch('adults'), children: watch('children') }}
        onChange={(next) => {
          setValue('rooms', next.rooms)
          setValue('adults', next.adults, { shouldValidate: Boolean(errors.adults) })
          setValue('children', next.children)
        }}
        error={errors.adults?.message}
      />

      <div className="md:col-span-2 lg:col-span-1 lg:pt-5">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-clay-600 px-6 font-semibold text-white shadow-sm transition-colors hover:bg-clay-500"
        >
          <Search className="size-4" aria-hidden="true" />
          Search
        </button>
      </div>
    </form>
  )
}
