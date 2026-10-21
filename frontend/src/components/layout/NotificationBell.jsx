import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { apiClient } from '../../api/client'
import { formatDateTime } from '../../utils/format'
import { useCloseOnNavigate } from '../../hooks/useCloseOnNavigate'
import { cn } from '../../utils/cn'

const fetchNotifications = () => apiClient.get('/notifications', { params: { limit: 10 } }).then((r) => r.data)

/** Bell with unread count; polls every minute while the tab is open. */
export default function NotificationBell({ transparent }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef(null)
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['me', 'notifications'], queryFn: fetchNotifications, refetchInterval: 60_000 })
  const unread = data?.unread ?? 0

  useCloseOnNavigate(() => setOpen(false))
  useEffect(() => {
    if (!open) return undefined
    const close = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const markAll = async () => {
    await apiClient.post('/notifications/read-all')
    queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((o) => !o)}
        className={cn('relative grid size-10 place-items-center rounded-full transition-colors', transparent ? 'text-cream-50 hover:bg-white/15' : 'text-ink-900 hover:bg-forest-100')}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-clay-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div id={panelId} className="absolute right-0 mt-2 w-80 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-forest-900/10">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold text-forest-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-forest-700 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {!data?.items.length ? (
            <p className="px-3 py-4 text-sm text-ink-600">You’re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link ?? '#'}
                    onClick={() => !n.read_at && apiClient.post(`/notifications/${n.id}/read`).then(() => queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] }))}
                    className={cn('block rounded-xl px-3 py-2.5 text-sm hover:bg-forest-100', !n.read_at && 'bg-cream-100')}
                  >
                    <span className="block font-medium text-ink-900">{n.title}</span>
                    <span className="block text-ink-600">{n.body}</span>
                    <span className="block text-xs text-ink-600">{formatDateTime(n.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
