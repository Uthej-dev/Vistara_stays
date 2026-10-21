import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { cn } from '../../utils/cn'

const ToastContext = createContext(null)

/** Lightweight success/error notifications, announced politely to screen readers. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const show = useCallback(
    (message, tone = 'success') => {
      const id = Math.random().toString(36).slice(2)
      setToasts((all) => [...all.slice(-2), { id, message, tone }])
      setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )
  const value = useMemo(() => ({ success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-xl',
              t.tone === 'error' ? 'bg-clay-600 text-white' : 'bg-forest-900 text-cream-50',
            )}
          >
            {t.tone === 'error' ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <p className="flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-80 hover:opacity-100">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  // Components rendered outside the provider (e.g. in isolated tests) get a no-op.
  return ctx ?? { success: () => {}, error: () => {} }
}
