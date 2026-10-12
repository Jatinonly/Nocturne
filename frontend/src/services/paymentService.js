/**
 * Payments always use the simulated checkout UI. When the backend is configured,
 * its mock payment endpoints keep payment status and inventory in sync with stored orders.
 */
import { env } from '@/config/env'
import { apiRequest, mockDelay } from './http'
import { mockRazorpay } from './mockRazorpay'

/**
 * @typedef {object} RazorpayOrder Created for a simulated payment.
 * @property {string} id e.g. "order_mock_abc123".
 * @property {number} amount Amount in paise (₹1 = 100 paise).
 * @property {'INR'} currency
 */

/**
 * @typedef {{ razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string }} RazorpaySuccessPayload
 * @typedef {{ order: RazorpayOrder, prefill: { name?: string, email?: string, contact?: string }, description: string }} CheckoutOptions
 * @typedef {{ status: 'success', payload: RazorpaySuccessPayload } | { status: 'failed', reason: string } | { status: 'dismissed' }} PaymentOutcome
 */

/**
 * Create a simulated payment order, using the backend when available so it can
 * associate the mock payment with the database order.
 * @param {string} orderId
 * @param {number} amountInRupees
 * @returns {Promise<RazorpayOrder>}
 */
export async function createRazorpayOrder(orderId, amountInRupees) {
  if (!env.useMockApi) {
    const order = await apiRequest('/payments/razorpay/order', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
    if (!order.mock) {
      throw new Error('Simulated checkout requires RAZORPAY_MOCK=true in backend/.env.')
    }
    return order
  }
  await mockDelay(500)
  return {
    id: `order_mock_${Math.random().toString(36).slice(2, 12)}`,
    amount: Math.round(amountInRupees * 100),
    currency: 'INR',
  }
}

/**
 * Open the simulated checkout popup and resolve with the customer's outcome.
 * @param {CheckoutOptions} options
 * @returns {Promise<PaymentOutcome>}
 */
export function openRazorpayCheckout(options) {
  return mockRazorpay.open(options)
}

/**
 * Step 4 — ask the backend to verify the payment signature. Never verify on the client.
 * @param {string} orderId
 * @param {RazorpaySuccessPayload} payload
 * @returns {Promise<boolean>}
 */
export async function verifyPayment(orderId, payload) {
  if (!env.useMockApi) {
    const result = await apiRequest('/payments/razorpay/verify', {
      method: 'POST',
      body: JSON.stringify({ orderId, ...payload }),
    })
    return result.verified
  }
  await mockDelay(400)
  return payload.razorpay_signature.startsWith('mock_sig_')
}

/** Reports a failed or dismissed checkout so the backend can release reserved stock. */
export async function reportPaymentFailure(orderId) {
  if (!env.useMockApi) {
    return apiRequest('/payments/razorpay/fail', {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
  }
  await mockDelay(250)
  return { failed: true }
}

/** Convenience wrapper used by checkout: create mock order → open → verify. */
export async function payWithRazorpay(params) {
  const order = await createRazorpayOrder(params.orderId, params.amount)
  const outcome = await openRazorpayCheckout({
    order,
    prefill: params.prefill,
    description: params.description,
  })
  if (outcome.status !== 'success') return { ...outcome, orderId: params.orderId }

  const verified = await verifyPayment(params.orderId, outcome.payload)
  if (!verified) {
    return { status: 'failed', reason: 'Payment could not be verified.', orderId: params.orderId }
  }
  return { ...outcome, orderId: params.orderId, razorpayOrder: order }
}

export const paymentService = {
  createRazorpayOrder,
  openRazorpayCheckout,
  verifyPayment,
  reportPaymentFailure,
  payWithRazorpay,
}
