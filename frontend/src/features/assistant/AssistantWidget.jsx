import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MapPin, MessageCircle, Minus, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { getAssistantStatus, sendAssistantMessage } from '../../api/assistant'
import { toApiError } from '../../api/client'
import Button from '../../components/ui/Button'
import SmartImage from '../../components/ui/SmartImage'
import Icon from '../../components/ui/Icon'
import RatingBadge from '../../components/resort/RatingBadge'
import { useAmenityLookup } from '../catalog/useAmenityLookup'
import { stayQuery } from '../resort/useStayParams'
import { formatDate } from '../../utils/dates'
import { formatINR, formatPlace, plural } from '../../utils/format'
import { MEAL_PLAN_LABELS, STATE_NAMES } from '../../utils/labels'
import { cn } from '../../utils/cn'

const STORAGE_KEY = 'vs_assistant'
const WELCOME =
  "Hi! I'm the Vistara assistant. Tell me where you'd like to go, your dates and who's travelling, and I'll find resorts with rooms free for your stay."
const STARTERS = ['A weekend in Coorg for two', 'Family trip to Munnar next month', 'Resorts with a pool in Kerala']
const REFINEMENTS = ['Show me cheaper resorts', 'I want a swimming pool', 'Change my checkout date']

// The conversation survives page changes and reloads within this tab, so a guest can open a
// resort from the chat and come back. Storage can be unavailable (private mode): never required.
function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function save(state) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage full or blocked: the chat still works for this page view
  }
}

const isWide = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 640px)').matches)

/** Plain-text turns for the server (it never accepts prices or tool output from the browser). */
function toHistory(messages) {
  return messages
    .filter((m) => !m.error)
    .slice(-20)
    .map(({ role, content }) => ({ role, content: content.slice(0, 2000) }))
}

/**
 * Floating chat assistant. Views: "open" (panel), "minimized" (header bar only) and "closed"
 * (round launcher button). Starts open on wide screens, as a launcher on phones.
 */
export default function AssistantWidget() {
  const [saved] = useState(loadSaved)
  const [view, setView] = useState(() => saved.view ?? (isWide() ? 'open' : 'closed'))
  const [messages, setMessages] = useState(() => saved.messages ?? [])
  const [criteria, setCriteria] = useState(() => saved.criteria ?? {})
  const [draft, setDraft] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const status = useQuery({ queryKey: ['assistant-status'], queryFn: getAssistantStatus, staleTime: 5 * 60_000 })
  const offline = status.data?.enabled === false

  const chat = useMutation({
    mutationFn: sendAssistantMessage,
    onSuccess: (data) => {
      setCriteria(data.criteria)
      // Cards keep the criteria they were priced for, even if the guest changes dates later.
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, results: data.results, criteria: data.criteria }])
    },
    onError: (error, request) => {
      const { code, message } = toApiError(error)
      const content = code === 'RATE_LIMITED' ? 'You’re sending messages quickly — please wait a moment.' : message
      setMessages((m) => [...m, { role: 'assistant', content, error: true, request }])
    },
  })

  useEffect(() => {
    save({ view, messages: messages.slice(-30), criteria })
  }, [view, messages, criteria])

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length, chat.isPending, view])

  const send = (text) => {
    const message = text.trim().slice(0, 1000)
    if (!message || chat.isPending || offline) return
    chat.mutate({ message, history: toHistory(messages), criteria })
    setMessages((m) => [...m, { role: 'user', content: message }])
    setDraft('')
  }

  const retry = (failed) => {
    setMessages((m) => m.filter((x) => x !== failed))
    chat.mutate(failed.request)
  }

  const startOver = () => {
    setMessages([])
    setCriteria({})
    chat.reset()
    inputRef.current?.focus()
  }

  // On phones the panel covers the page, so step aside when the guest follows a card link.
  const onCardLink = () => {
    if (!isWide()) setView('minimized')
  }

  if (view === 'closed') {
    return (
      <div className="fixed right-4 bottom-4 z-40 flex items-end gap-2 sm:right-5 sm:bottom-5">
        {messages.length === 0 && (
          <p className="mb-1 hidden max-w-[14rem] rounded-2xl rounded-br-sm bg-white px-3 py-2 text-sm text-ink-900 shadow-lg ring-1 ring-forest-900/10 min-[380px]:block">
            Need help finding a stay? Ask me!
          </p>
        )}
        <button
          type="button"
          onClick={() => setView('open')}
          aria-label="Open the Vistara booking assistant"
          className="grid size-14 place-items-center rounded-full bg-forest-800 text-cream-50 shadow-lg transition-colors hover:bg-forest-700"
        >
          <MessageCircle className="size-6" aria-hidden="true" />
        </button>
      </div>
    )
  }

  const header = (
    <div className="flex items-center gap-2 bg-forest-800 px-4 py-3 text-cream-50">
      <Sparkles className="size-4.5 shrink-0 text-cream-200" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-base leading-tight">Vistara assistant</p>
        {view === 'open' && <p className="text-xs text-cream-200">{offline ? 'Offline' : 'Finds stays with real availability'}</p>}
      </div>
      {view === 'open' && messages.length > 0 && (
        <HeaderButton label="Start a new chat" onClick={startOver}>
          <RotateCcw className="size-4" aria-hidden="true" />
        </HeaderButton>
      )}
      {view === 'open' ? (
        <HeaderButton label="Minimize assistant" onClick={() => setView('minimized')}>
          <Minus className="size-4.5" aria-hidden="true" />
        </HeaderButton>
      ) : (
        <button type="button" onClick={() => setView('open')} className="rounded-full px-3 py-1 text-sm hover:bg-white/10">
          Continue chat
        </button>
      )}
      <HeaderButton label="Close assistant" onClick={() => setView('closed')}>
        <X className="size-4.5" aria-hidden="true" />
      </HeaderButton>
    </div>
  )

  if (view === 'minimized') {
    return (
      <section aria-label="Vistara booking assistant (minimized)" className="fixed right-4 bottom-4 left-4 z-40 overflow-hidden rounded-2xl shadow-xl sm:left-auto sm:w-80">
        {header}
      </section>
    )
  }

  const lastResultsIndex = messages.findLastIndex((m) => m.results)

  return (
    <section
      aria-label="Vistara booking assistant"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-2xl bg-cream-50 shadow-[0_-8px_40px_-12px_rgba(16,32,22,0.35)] ring-1 ring-forest-900/10 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px] sm:rounded-2xl"
    >
      {header}
      <CriteriaSummary criteria={criteria} />

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
        <Bubble from="assistant">
          {offline ? (
            <>
              The assistant is offline right now, but you can still{' '}
              <Link to="/search" className="font-medium underline" onClick={onCardLink}>
                search and book stays
              </Link>{' '}
              as usual.
            </>
          ) : (
            WELCOME
          )}
        </Bubble>

        {messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <Bubble from={m.role} error={m.error}>
              {m.content}
              {m.error && m.request && (
                <button type="button" onClick={() => retry(m)} className="mt-1 block text-sm font-medium underline">
                  Try again
                </button>
              )}
            </Bubble>
            {m.results && <Results results={m.results} criteria={m.criteria} current={i === lastResultsIndex} onLink={onCardLink} />}
          </div>
        ))}

        {chat.isPending && (
          <div className="flex items-center gap-1 px-2 py-1" role="status" aria-label="Assistant is typing">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-2 animate-bounce rounded-full bg-forest-600/60" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        )}
      </div>

      {!offline && !chat.isPending && (
        <Suggestions items={lastResultsIndex >= 0 ? REFINEMENTS : messages.length ? [] : STARTERS} onPick={send} />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-end gap-2 border-t border-forest-900/10 bg-white p-3"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message the assistant
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={1000}
          disabled={offline}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            } else if (e.key === 'Escape') {
              setView('minimized')
            }
          }}
          placeholder={offline ? 'Assistant offline' : 'Where would you like to stay?'}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-forest-900/15 bg-cream-50 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-600/70 focus:border-forest-600 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || chat.isPending || offline}
          aria-label="Send message"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-clay-600 text-white transition-colors hover:bg-clay-500 disabled:opacity-50"
        >
          <Send className="size-4.5" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}

function HeaderButton({ label, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid size-8 place-items-center rounded-full hover:bg-white/10">
      {children}
    </button>
  )
}

function Bubble({ from, error, children }) {
  const mine = from === 'user'
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line',
          mine ? 'rounded-br-sm bg-forest-800 text-cream-50' : 'rounded-bl-sm bg-white text-ink-900 ring-1 ring-forest-900/5',
          error && 'bg-clay-600/10 text-clay-600 ring-clay-600/20',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function Suggestions({ items, onPick }) {
  if (!items.length) return null
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-2" aria-label="Suggestions">
      {items.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="shrink-0 rounded-full border border-forest-800/20 bg-white px-3 py-1.5 text-xs text-forest-800 hover:bg-forest-100"
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** What the assistant has remembered, so the guest can see it without scrolling back. */
function CriteriaSummary({ criteria }) {
  const amenityLookup = useAmenityLookup()
  const parts = [
    criteria.destination_name ?? STATE_NAMES[criteria.state],
    criteria.check_in && criteria.check_out
      ? `${formatDate(criteria.check_in, { withYear: false })} – ${formatDate(criteria.check_out, { withYear: false })}`
      : null,
    criteria.adults != null ? plural(criteria.adults, 'adult') : null,
    criteria.children ? plural(criteria.children, 'child', 'children') : null,
    criteria.rooms != null ? plural(criteria.rooms, 'room') : null,
    criteria.max_price_per_night != null ? `≤ ${formatINR(criteria.max_price_per_night * 100)}/night` : null,
    ...(criteria.amenities ?? []).map((a) => amenityLookup[a]?.name ?? a),
  ].filter(Boolean)
  if (!parts.length) return null
  return (
    <ul aria-label="Your trip so far" className="flex flex-wrap gap-1.5 border-b border-forest-900/10 bg-white px-3 py-2">
      {parts.map((p) => (
        <li key={p} className="rounded-full bg-forest-100 px-2 py-0.5 text-[11px] font-medium text-forest-800">
          {p}
        </li>
      ))}
    </ul>
  )
}

function Results({ results, criteria = {}, current, onLink }) {
  if (!results.resorts.length) return null
  return (
    <div className={cn('space-y-3', !current && 'opacity-80')}>
      {results.relaxed && (
        <p className="rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-600">
          No exact matches — showing stays {results.relaxed}.
        </p>
      )}
      {results.resorts.map((resort) => (
        <AssistantResortCard key={resort.id} resort={resort} criteria={criteria} onLink={onLink} />
      ))}
      {results.total > results.resorts.length && (
        <p className="px-1 text-xs text-ink-600">
          Showing {results.resorts.length} of {results.total} matches. Ask me to narrow it down.
        </p>
      )}
    </div>
  )
}

export function AssistantResortCard({ resort, criteria, onLink }) {
  const amenityLookup = useAmenityLookup()
  const [cheapest] = resort.rooms
  const stay = {
    checkIn: criteria.check_in ?? '',
    checkOut: criteria.check_out ?? '',
    rooms: criteria.rooms ?? 1,
    adults: criteria.adults ?? 2,
    children: criteria.children ?? 0,
    childAges: [],
    roomTypeId: cheapest.room_type_id,
  }
  const detailsHref = `/resorts/${resort.slug}?${stayQuery(stay)}`
  // Checkout needs every child's age; the resort page asks for them, so families go there first.
  const bookHref = stay.children > 0 ? detailsHref : `/checkout?${stayQuery(stay)}&resort=${resort.slug}`

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,32,22,0.06),0_8px_24px_-12px_rgba(16,32,22,0.18)]">
      <div className="relative">
        <SmartImage image={resort.cover_image} sizes="400px" className="aspect-[16/9]" />
        {resort.is_sample && (
          <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink-900">
            Sample property
          </span>
        )}
      </div>
      <div className="space-y-2.5 p-3.5">
        <div>
          <h3 className="font-display text-base leading-snug text-forest-900">{resort.name}</h3>
          <p className="flex items-center gap-1 text-xs text-ink-600">
            <MapPin className="size-3.5" aria-hidden="true" />
            {formatPlace(resort.destination.name, resort.destination.state)}
          </p>
        </div>
        <RatingBadge rating={resort.rating} isSample={resort.is_sample} />
        {resort.amenities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Amenities">
            {resort.amenities.slice(0, 5).map((slug) => (
              <li key={slug} className="inline-flex items-center gap-1 rounded-full bg-cream-100 px-2 py-0.5 text-[11px] text-ink-600">
                <Icon name={amenityLookup[slug]?.icon} className="size-3" />
                {amenityLookup[slug]?.name ?? slug.replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        )}
        <ul className="divide-y divide-forest-900/5 rounded-xl bg-cream-50 px-3 text-xs" aria-label="Available rooms">
          {resort.rooms.slice(0, 3).map((room) => (
            <li key={room.room_type_id} className="flex items-baseline justify-between gap-2 py-1.5">
              <span className="min-w-0 text-ink-900">
                {room.name}
                <span className="block text-ink-600">
                  {MEAL_PLAN_LABELS[room.meal_plan]} · {room.available_units} left
                </span>
              </span>
              <span className="shrink-0 text-right font-medium text-ink-900">{formatINR(room.total_paise)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-end justify-between gap-2 border-t border-forest-900/5 pt-2.5">
          <div>
            <p className="text-ink-900">
              <span className="text-lg font-semibold">{formatINR(resort.per_night_paise)}</span>
              <span className="text-xs text-ink-600"> / night</span>
            </p>
            <p className="text-xs text-ink-600">
              {formatINR(resort.total_paise)} for {plural(resort.nights, 'night')} · incl. taxes & fees
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button to={detailsHref} onClick={onLink} variant="outline" size="sm" className="flex-1">
            View details
          </Button>
          <Button to={bookHref} onClick={onLink} variant="accent" size="sm" className="flex-1">
            Book now
          </Button>
        </div>
      </div>
    </article>
  )
}
