import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RazorpayButton from './RazorpayButton'
import { fakeServer } from '../../test/http'

const BOOKING = { id: 'b1', resort_snapshot: { is_sample: true } }

describe('RazorpayButton', () => {
  afterEach(() => {
    delete window.Razorpay
  })

  it('opens checkout with the server’s order and lets the server verify the result', async () => {
    const user = userEvent.setup()
    const opened = []
    window.Razorpay = vi.fn(function Razorpay(options) {
      opened.push(options)
      this.on = vi.fn()
      this.open = () => options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
    })
    const calls = fakeServer({
      'POST /payments/razorpay/order': () => [200, { order_id: 'order_1', amount_paise: 535000, currency: 'INR', key_id: 'rzp_test_x', booking_ref: 'VS-ABC234', prefill: { name: 'Asha' } }],
      'POST /payments/razorpay/verify': () => [200, { id: 'b1', status: 'confirmed' }],
    })
    const onPaid = vi.fn()
    render(<RazorpayButton booking={BOOKING} onPaid={onPaid} onError={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /pay securely/i }))

    await waitFor(() => expect(onPaid).toHaveBeenCalledWith({ id: 'b1', status: 'confirmed' }))
    expect(opened[0]).toMatchObject({ key: 'rzp_test_x', amount: 535000, order_id: 'order_1', currency: 'INR' })
    expect(calls.find((c) => c.key === 'POST /payments/razorpay/verify').data).toEqual({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
  })

  it('shows the server’s message if verification fails, without marking anything paid', async () => {
    const user = userEvent.setup()
    window.Razorpay = vi.fn(function Razorpay(options) {
      this.on = vi.fn()
      this.open = () => options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'bad' })
    })
    fakeServer({
      'POST /payments/razorpay/order': () => [200, { order_id: 'order_1', amount_paise: 1, currency: 'INR', key_id: 'k', booking_ref: 'VS-1', prefill: {} }],
      'POST /payments/razorpay/verify': () => [403, { error: { code: 'SIGNATURE_INVALID', message: 'Payment verification failed.' } }],
    })
    const onPaid = vi.fn()
    const onError = vi.fn()
    render(<RazorpayButton booking={BOOKING} onPaid={onPaid} onError={onError} />)

    await user.click(screen.getByRole('button', { name: /pay securely/i }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('Payment verification failed.'))
    expect(onPaid).not.toHaveBeenCalled()
  })
})
