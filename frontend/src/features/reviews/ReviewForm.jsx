import { useState } from 'react'
import { Star } from 'lucide-react'
import { createReview } from '../../api/reviews'
import { fieldErrors, toApiError } from '../../api/client'
import { FormAlert, SubmitButton, TextField } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'

function StarInput({ label, value, onChange, required }) {
  const name = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink-900">
        {label}
        {!required && <span className="font-normal text-ink-600"> (optional)</span>}
      </legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''}
            </span>
            <Star aria-hidden="true" className={`size-7 rounded peer-focus-visible:outline-2 peer-focus-visible:outline-clay-500 ${value >= n ? 'fill-clay-600 text-clay-600' : 'text-forest-900/25'}`} />
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Review form on the trip page — only rendered for completed, not-yet-reviewed stays. */
export default function ReviewForm({ bookingId, onDone }) {
  const toast = useToast()
  const [rating, setRating] = useState(0)
  const [subs, setSubs] = useState({})
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    const local = {}
    if (!rating) local.rating = 'Choose an overall rating'
    if (body.trim().length < 20) local.body = 'Please write at least 20 characters'
    setErrors(local)
    if (Object.keys(local).length) return
    setBusy(true)
    setServerError(null)
    try {
      await createReview({ booking_id: bookingId, rating, sub_ratings: Object.keys(subs).length ? subs : null, title: title.trim() || null, body: body.trim() })
      toast.success('Thanks! Your review is live.')
      onDone?.()
    } catch (error) {
      setErrors(fieldErrors(error))
      setServerError(toApiError(error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-5">
      <FormAlert>{serverError}</FormAlert>
      <div>
        <StarInput label="Overall" value={rating} onChange={setRating} required />
        {errors.rating && <p className="mt-1 text-xs text-clay-600">{errors.rating}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {['cleanliness', 'location', 'service', 'facilities'].map((k) => (
          <StarInput key={k} label={k[0].toUpperCase() + k.slice(1)} value={subs[k] ?? 0} onChange={(n) => setSubs((s) => ({ ...s, [k]: n }))} />
        ))}
      </div>
      <TextField label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      <TextField as="textarea" label="Your review" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} error={errors.body} hint="What should other travellers know? Don’t include personal contact details." />
      <SubmitButton loading={busy}>Publish review</SubmitButton>
    </form>
  )
}
