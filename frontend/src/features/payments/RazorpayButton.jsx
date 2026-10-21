import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { apiClient, toApiError } from '../../api/client'
import { Spinner } from '../../components/ui/States'

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.onload = resolve
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'))
    document.body.appendChild(script)
  })
}

/**
 * Razorpay Checkout. The order (and amount) comes from OUR server; after Razorpay reports
 * success we send the signed result back to the server, which verifies it before confirming.
 * The browser never decides that a booking is paid.
 */
export default function RazorpayButton({ booking, disabled, onPaid, onError }) {
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    setBusy(true)
    onError(null)
    try {
      const [{ data: order }] = await Promise.all([apiClient.post('/payments/razorpay/order', { booking_id: booking.id }), loadCheckoutScript()])
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.order_id,
        name: 'Vistara Stays',
        description: `Booking ${order.booking_ref}`,
        prefill: order.prefill,
        theme: { color: '#1f3d2b' },
        handler: async (result) => {
          try {
            const { data } = await apiClient.post('/payments/razorpay/verify', result)
            onPaid(data)
          } catch (e) {
            onError(toApiError(e).message)
          } finally {
            setBusy(false)
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      })
      checkout.on('payment.failed', (response) => {
        onError(response?.error?.description ?? 'The payment failed. You have not been charged.')
        setBusy(false)
      })
      checkout.open()
    } catch (e) {
      onError(toApiError(e).message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={pay}
        disabled={disabled || busy}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-clay-600 px-6 font-semibold text-white hover:bg-clay-500 disabled:opacity-50"
      >
        {busy ? <Spinner /> : <CreditCard className="size-5" aria-hidden="true" />} Pay securely with Razorpay
      </button>
      {booking.resort_snapshot?.is_sample && <p className="text-xs text-ink-600">Test mode: use Razorpay’s test cards — no real money moves.</p>}
    </div>
  )
}
