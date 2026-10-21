import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatINR, plural } from '../../utils/format'
import { formatDate } from '../../utils/dates'
import { MEAL_PLAN_LABELS } from '../../utils/labels'

const SOURCE_LABELS = { base: 'Weekday rate', weekend: 'Weekend rate', date_override: 'Special date rate' }

function Row({ label, value, muted, strong }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'text-base font-semibold text-ink-900' : muted ? 'text-ink-600' : 'text-ink-900'}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

/** Itemised totals exactly as the server calculated them. The browser never does price maths. */
export default function PriceBreakdown({ price, className }) {
  const [showNights, setShowNights] = useState(false)
  if (!price) return null
  return (
    <div className={className}>
      <dl className="space-y-2 text-sm">
        <Row
          label={`${plural(price.rooms, 'room')} × ${plural(price.nights_count, 'night')}`}
          value={formatINR(price.room_subtotal_paise)}
        />
        {price.extra_guest_paise > 0 && (
          <Row
            label={`Extra guests (${[price.extra_adults && plural(price.extra_adults, 'adult'), price.extra_children && plural(price.extra_children, 'child', 'children')].filter(Boolean).join(', ')})`}
            value={formatINR(price.extra_guest_paise)}
          />
        )}
        {price.discount_paise > 0 && <Row label={`Discount${price.coupon_code ? ` (${price.coupon_code})` : ''}`} value={`− ${formatINR(price.discount_paise)}`} />}
        {price.taxes.map((t) => (
          <Row key={t.label} label={t.label} value={formatINR(t.amount_paise)} muted />
        ))}
        {price.service_fee_paise > 0 && <Row label={`Service fee (${price.service_fee_pct}%)`} value={formatINR(price.service_fee_paise)} muted />}
        <div className="border-t border-forest-900/10 pt-2">
          <Row label="Total (INR)" value={formatINR(price.total_paise)} strong />
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-600">
        Includes all taxes and fees · {MEAL_PLAN_LABELS[price.meal_plan]} · no charges added at the property except optional extras.
      </p>
      <button
        type="button"
        aria-expanded={showNights}
        onClick={() => setShowNights((s) => !s)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-forest-700 underline-offset-4 hover:underline"
      >
        Nightly rates <ChevronDown className={`size-3.5 transition-transform ${showNights ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {showNights && (
        <ul className="mt-2 space-y-1 text-xs text-ink-600">
          {price.nights.map((n) => (
            <li key={n.date} className="flex justify-between">
              <span>
                {formatDate(n.date, { withYear: false })} · {SOURCE_LABELS[n.source] ?? (n.source.startsWith('rule:') ? n.source.slice(5) : n.source)}
              </span>
              <span className="tabular-nums">{formatINR(n.rate_paise)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
