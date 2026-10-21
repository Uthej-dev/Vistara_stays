import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Accessible slide-over panel built on the native <dialog> element, which provides focus
 * trapping, Esc-to-close and an inert background for free.
 */
export default function Drawer({ open, onClose, title, children, footer }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal?.()
    if (!open && dialog.open) dialog.close?.()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 ml-auto h-full max-h-none w-[min(24rem,100vw)] max-w-none bg-cream-50 p-0 backdrop:bg-forest-950/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-forest-900/10 px-5 py-4">
          <h2 className="font-display text-xl text-forest-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-forest-100">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-forest-900/10 px-5 py-4">{footer}</div>}
      </div>
    </dialog>
  )
}
