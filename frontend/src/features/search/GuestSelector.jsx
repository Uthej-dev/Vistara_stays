import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Minus, Plus, Users } from 'lucide-react'
import { LIMITS } from './searchSchema'

function Stepper({ label, hint, value, min, max, onChange }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div>
        <p className="font-medium text-ink-900">{label}</p>
        {hint && <p className="text-xs text-ink-600">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="grid size-8 place-items-center rounded-full border border-forest-800/25 text-forest-800 transition-colors hover:bg-forest-100 disabled:opacity-35"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <output aria-live="polite" aria-label={label} className="w-5 text-center font-semibold tabular-nums">
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="grid size-8 place-items-center rounded-full border border-forest-800/25 text-forest-800 transition-colors hover:bg-forest-100 disabled:opacity-35"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function summarizeGuests({ rooms, adults, children }) {
  const parts = [
    `${adults} ${adults === 1 ? 'adult' : 'adults'}`,
    children ? `${children} ${children === 1 ? 'child' : 'children'}` : null,
    `${rooms} ${rooms === 1 ? 'room' : 'rooms'}`,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Rooms / adults / children picker in an accessible popover (Esc and outside-click close it). */
export default function GuestSelector({ value, onChange, error }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const update = (field, next) => {
    const updated = { ...value, [field]: next }
    // Keep the rule "at least one adult per room" true while the user adjusts rooms.
    if (field === 'rooms' && updated.adults < next) updated.adults = next
    onChange(updated)
  }

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-600 uppercase">Guests</span>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-forest-900/15 bg-white px-3 text-left text-ink-900 hover:border-forest-900/30"
      >
        <Users className="size-4 shrink-0 text-forest-700" aria-hidden="true" />
        <span className="truncate">{summarizeGuests(value)}</span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-ink-600" aria-hidden="true" />
      </button>
      {error && <p className="mt-1 text-xs text-clay-600">{error}</p>}

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Rooms and guests"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] divide-y divide-forest-900/5 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-forest-900/10"
        >
          <Stepper label="Rooms" value={value.rooms} {...LIMITS.rooms} onChange={(n) => update('rooms', n)} />
          <Stepper
            label="Adults"
            hint="Ages 18+"
            value={value.adults}
            min={Math.max(LIMITS.adults.min, value.rooms)}
            max={LIMITS.adults.max}
            onChange={(n) => update('adults', n)}
          />
          <Stepper label="Children" hint="Ages 0–17" value={value.children} {...LIMITS.children} onChange={(n) => update('children', n)} />
          <div className="pt-3 text-right">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
              className="rounded-full bg-forest-800 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-forest-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
