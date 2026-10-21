import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import SmartImage from '../ui/SmartImage'
import { BOOKING_STATUS_LABELS, MEAL_PLAN_LABELS } from '../../utils/labels'
import { formatDate } from '../../utils/dates'
import { plural } from '../../utils/format'
import { cn } from '../../utils/cn'

const STATUS_TONE = {
  pending_payment: 'bg-clay-600/10 text-clay-600',
  pending_owner: 'bg-clay-600/10 text-clay-600',
  confirmed: 'bg-forest-100 text-forest-800',
  completed: 'bg-forest-100 text-forest-800',
  cancelled: 'bg-ink-900/5 text-ink-600',
  rejected: 'bg-ink-900/5 text-ink-600',
  expired: 'bg-ink-900/5 text-ink-600',
  no_show: 'bg-ink-900/5 text-ink-600',
}

export function StatusBadge({ status }) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_TONE[status])}>
      {BOOKING_STATUS_LABELS[status] ?? status}
    </span>
  )
}

/** Live "Room held for 14:32" countdown; calls onExpire once when it reaches zero. */
export function HoldCountdown({ expiresAt, onExpire }) {
  const target = new Date(expiresAt).getTime()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const remaining = Math.max(0, target - now)
  useEffect(() => {
    if (remaining === 0) onExpire?.()
  }, [remaining === 0]) // eslint-disable-line react-hooks/exhaustive-deps
  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return (
    <p className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium', remaining < 120000 ? 'bg-clay-600/10 text-clay-600' : 'bg-forest-100 text-forest-800')}>
      <Clock className="size-4" aria-hidden="true" />
      {remaining > 0 ? (
        <span>
          Room held for{' '}
          <span className="tabular-nums" aria-live="off">
            {minutes}:{String(seconds).padStart(2, '0')}
          </span>
        </span>
      ) : (
        <span>Your hold has expired</span>
      )}
    </p>
  )
}

/** Resort photo + name + dates + guests, used on checkout, payment and trip pages. */
export function StaySummary({ snapshot, checkIn, checkOut, nights, rooms, guests, mealPlan, className }) {
  return (
    <div className={cn('flex gap-4', className)}>
      <SmartImage image={snapshot.cover} alt="" sizes="112px" className="aspect-square w-24 shrink-0 rounded-xl sm:w-28" />
      <div className="min-w-0">
        {snapshot.is_sample && <p className="text-[11px] font-semibold tracking-wide text-clay-600 uppercase">Sample property</p>}
        <h2 className="font-display text-xl leading-tight text-forest-900">{snapshot.name}</h2>
        <p className="text-sm text-ink-600">{snapshot.room_type_name}</p>
        <p className="mt-1 text-sm text-ink-900">
          {formatDate(checkIn)} → {formatDate(checkOut)} · {plural(nights, 'night')}
        </p>
        <p className="text-sm text-ink-600">
          {plural(rooms, 'room')} · {plural(guests.adults, 'adult')}
          {guests.children ? ` · ${plural(guests.children, 'child', 'children')}` : ''}
          {mealPlan ? ` · ${MEAL_PLAN_LABELS[mealPlan]}` : ''}
        </p>
      </div>
    </div>
  )
}
