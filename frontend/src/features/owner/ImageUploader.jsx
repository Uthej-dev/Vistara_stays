import { useId, useRef, useState } from 'react'
import { ArrowUp, ImagePlus, Trash2 } from 'lucide-react'
import SmartImage from '../../components/ui/SmartImage'
import { Spinner } from '../../components/ui/States'
import { FormAlert } from '../../components/ui/Form'
import { uploadImage } from '../../api/owner'
import { toApiError } from '../../api/client'

const ACCEPT = 'image/jpeg,image/png,image/webp'

/** Upload photos (server validates type & size), describe them for screen readers, reorder. */
export default function ImageUploader({ images, onChange, max = 20 }) {
  const [alt, setAlt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const altId = useId()
  const fileId = useId()

  const upload = async (file) => {
    if (!file) return
    if (alt.trim().length < 3) {
      setError('Describe the photo first (for guests using screen readers).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const image = await uploadImage(file, alt.trim())
      onChange([...images, image])
      setAlt('')
    } catch (e) {
      setError(toApiError(e).message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const move = (i) => onChange([images[i], ...images.filter((_, j) => j !== i)])

  return (
    <div className="space-y-4">
      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, i) => (
            <li key={image.src + i} className="relative overflow-hidden rounded-xl ring-1 ring-forest-900/10">
              <SmartImage image={image} sizes="200px" className="aspect-[4/3]" />
              {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-forest-800 px-2 py-0.5 text-[11px] font-semibold text-cream-50">Cover</span>}
              <div className="flex items-center justify-between gap-2 bg-white px-2 py-1.5">
                <p className="truncate text-xs text-ink-600" title={image.alt}>
                  {image.alt}
                </p>
                <div className="flex shrink-0">
                  {i > 0 && (
                    <button type="button" onClick={() => move(i)} aria-label={`Make "${image.alt}" the cover photo`} className="grid size-7 place-items-center rounded hover:bg-forest-100">
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label={`Remove "${image.alt}"`} className="grid size-7 place-items-center rounded text-clay-600 hover:bg-clay-600/10">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {images.length < max && (
        <div className="grid gap-3 rounded-2xl border-2 border-dashed border-forest-900/15 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor={altId} className="mb-1 block text-sm font-medium">
              Photo description
            </label>
            <input id={altId} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={160} placeholder="e.g. Pool deck facing the tea estate" className="h-10 w-full rounded-lg border border-forest-900/15 bg-white px-3 text-sm" />
          </div>
          <div>
            <label htmlFor={fileId} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-forest-800 px-4 text-sm font-semibold text-cream-50 hover:bg-forest-700">
              {busy ? <Spinner /> : <ImagePlus className="size-4" aria-hidden="true" />} Upload photo
            </label>
            <input id={fileId} ref={inputRef} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </div>
          <p className="text-xs text-ink-600 sm:col-span-2">JPEG, PNG or WebP, up to 5 MB. Only upload photos you own or have permission to use.</p>
        </div>
      )}
      <FormAlert>{error}</FormAlert>
    </div>
  )
}
