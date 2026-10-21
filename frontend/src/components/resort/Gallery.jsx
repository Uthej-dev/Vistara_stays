import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react'
import SmartImage from '../ui/SmartImage'

/** Photo grid with a full-screen viewer (arrow keys, Esc, swipe-friendly buttons). */
export default function Gallery({ images, title }) {
  const [index, setIndex] = useState(null)
  const dialogRef = useRef(null)
  const count = images.length

  const open = (i) => setIndex(i)
  const close = useCallback(() => setIndex(null), [])
  const step = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (index !== null && !dialog.open) dialog.showModal?.()
    if (index === null && dialog.open) dialog.close?.()
  }, [index])

  useEffect(() => {
    if (index === null) return undefined
    const onKey = (e) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, step])

  if (!count) {
    return <SmartImage image={null} alt={`No photos yet for ${title}`} className="aspect-[16/9] rounded-3xl" />
  }

  return (
    <>
      <div className="grid gap-2 overflow-hidden rounded-3xl sm:grid-cols-4 sm:grid-rows-2">
        {images.slice(0, 3).map((image, i) => (
          <button
            key={image.src + i}
            type="button"
            onClick={() => open(i)}
            aria-label={`Open photo ${i + 1} of ${count}: ${image.alt}`}
            className={`group relative overflow-hidden ${i === 0 ? 'sm:col-span-3 sm:row-span-2' : 'hidden sm:block'}`}
          >
            <SmartImage
              image={image}
              priority={i === 0}
              sizes={i === 0 ? '(min-width: 640px) 75vw, 100vw' : '25vw'}
              className={i === 0 ? 'aspect-[16/10] h-full sm:aspect-auto sm:min-h-[420px]' : 'aspect-[4/3] h-full'}
              imgClassName="transition-transform duration-700 group-hover:scale-[1.02] motion-reduce:transition-none"
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => open(0)}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100"
      >
        <Images className="size-4" aria-hidden="true" /> View all {count} photos
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        aria-label={`${title} photos`}
        className="m-0 h-full max-h-none w-full max-w-none bg-forest-950/95 p-0 text-cream-50 backdrop:bg-black/70"
      >
        {index !== null && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm" aria-live="polite">
                {index + 1} / {count}
              </p>
              <button type="button" onClick={close} aria-label="Close photos" className="grid size-10 place-items-center rounded-full hover:bg-white/10">
                <X className="size-6" aria-hidden="true" />
              </button>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-2 pb-4 sm:px-16">
              <img
                src={images[index].srcSet?.['1920'] ?? images[index].srcSet?.['1280'] ?? images[index].src}
                alt={images[index].alt}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              {count > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="absolute left-2 grid size-11 place-items-center rounded-full bg-black/40 hover:bg-black/60">
                    <ChevronLeft className="size-6" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => step(1)} aria-label="Next photo" className="absolute right-2 grid size-11 place-items-center rounded-full bg-black/40 hover:bg-black/60">
                    <ChevronRight className="size-6" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {images[index].credit && (
              <p className="px-4 pb-4 text-center text-xs text-cream-100/70">
                {images[index].alt} — Photo: {images[index].credit.author}, {images[index].credit.license}
              </p>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}
