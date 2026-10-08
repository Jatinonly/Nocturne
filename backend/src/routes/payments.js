import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import Razorpay from 'razorpay'
import { config } from '../config.js'
import { withTransaction } from '../db/mongo.js'
import { HttpError } from '../lib/httpError.js'
import * as v from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { Order, Product } from '../models/index.js'
import { toOrder } from './orders.js'

export const paymentsRouter = Router()

function createRazorpayClient() {
  return new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  })
}

// compare the bytes of signature from server to razor pay's signature
function signatureMatches(expected, supplied) {
  if (typeof supplied !== 'string' || !/^[a-f\d]{64}$/i.test(supplied)) return false
  const expectedBuffer = Buffer.from(expected, 'hex')
  const suppliedBuffer = Buffer.from(supplied, 'hex')
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  )
}

// Its job is to calculate the signature that our server expects from Razorpay
function paymentSignature(orderId, paymentId) {
  return createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
}

async function findOwnedOrder(session, orderId, userId) {
  const order = await Order.findOne({ _id: orderId, userId }).session(session).lean()
  if (!order) throw new HttpError(404, 'Order not found')
  return order
}

// Inside a transaction, any other request that writes the same order makes one of the two
// transactions fail and retry, so these updates behave like the old `SELECT … FOR UPDATE`.

/**
 * POST /api/payments/razorpay/webhook
 * Razorpay signs the exact raw request body with the configured webhook secret.
 */
paymentsRouter.post('/razorpay/webhook', async (req, res) => {
  if (config.razorpay.mock) throw new HttpError(404, 'Webhook is disabled in Razorpay mock mode')
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, 'Webhook body must be raw JSON')

  const signature = req.get('x-razorpay-signature') ?? ''
  const expected = createHmac('sha256', config.razorpay.webhookSecret)
    .update(req.body)
    .digest('hex')
  if (!signatureMatches(expected, signature)) throw new HttpError(400, 'Invalid webhook signature')

  let event
  try {
    event = JSON.parse(req.body.toString('utf8'))
  } catch {
    throw new HttpError(400, 'Webhook body is not valid JSON')
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new HttpError(400, 'Webhook payload is not valid')
  }

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload?.payment?.entity
    const razorpayOrderId = payment?.order_id ?? event.payload?.order?.entity?.id
    const razorpayPaymentId = payment?.id ?? null
    if (typeof razorpayOrderId === 'string' && razorpayOrderId) {
      // Only flips an unpaid Razorpay order to paid; repeats of the same event change nothing.
      await Order.updateOne(
        {
          'payment.razorpayOrderId': razorpayOrderId,
          'payment.method': 'razorpay',
          'payment.status': { $ne: 'paid' },
        },
        {
          $set: {
            'payment.status': 'paid',
            status: 'confirmed',
            ...(razorpayPaymentId ? { 'payment.razorpayPaymentId': razorpayPaymentId } : {}),
          },
        },
      )
    }
  }

  res.json({ received: true })
})

paymentsRouter.use(requireAuth)

/**
 * POST /api/payments/razorpay/order { orderId }
 * Creates a gateway order using only the amount stored on the user's database order.
 */
paymentsRouter.post('/razorpay/order', async (req, res) => {
  const orderId = v.str(req.body?.orderId, 'Order')
  const result = await withTransaction(async (session) => {
    const order = await findOwnedOrder(session, orderId, req.userId)
    const { razorpayOrderId } = order.payment
    if (order.payment.method !== 'razorpay') {
      throw new HttpError(400, 'This order is not payable with Razorpay')
    }
    if (order.payment.status === 'paid') throw new HttpError(409, 'This order is already paid')
    if (order.payment.status !== 'pending' || order.status === 'cancelled') {
      throw new HttpError(409, 'This order can no longer be paid')
    }

    const amount = Number(order.summary.total) * 100
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new HttpError(400, 'Order total is not a valid payment amount')
    }

    if (config.razorpay.mock) {
      const mockOrderId = razorpayOrderId ?? `order_mock_${randomBytes(10).toString('hex')}`
      if (!razorpayOrderId) {
        await Order.updateOne(
          { _id: order._id },
          { $set: { 'payment.razorpayOrderId': mockOrderId } },
          { session },
        )
      }
      return {
        id: mockOrderId,
        amount,
        currency: 'INR',
        keyId: 'mock',
        mock: true,
      }
    }

    if (razorpayOrderId?.startsWith('order_mock_')) {
      throw new HttpError(409, 'This order was created in mock mode and cannot use live checkout')
    }
    const keyId = config.razorpay.keyId
    if (razorpayOrderId) {
      return {
        id: razorpayOrderId,
        amount,
        currency: 'INR',
        keyId,
        mock: false,
      }
    }

    const gatewayOrder = await createRazorpayClient().orders.create({
      amount,
      currency: 'INR',
      receipt: order._id,
    })
    await Order.updateOne(
      { _id: order._id },
      { $set: { 'payment.razorpayOrderId': gatewayOrder.id } },
      { session },
    )
    return {
      id: gatewayOrder.id,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      keyId,
      mock: false,
    }
  })

  res.status(201).json(result)
})

/**
 * POST /api/payments/razorpay/verify
 * { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
paymentsRouter.post('/razorpay/verify', async (req, res) => {
  const orderId = v.str(req.body?.orderId, 'Order')
  const razorpayOrderId = v.str(req.body?.razorpay_order_id, 'Razorpay order')
  const razorpayPaymentId = v.str(req.body?.razorpay_payment_id, 'Razorpay payment')
  const signature = v.str(req.body?.razorpay_signature, 'Payment signature', { max: 128 })

  const validSignature = config.razorpay.mock
    ? razorpayOrderId.startsWith('order_mock_') &&
      razorpayPaymentId.startsWith('pay_mock_') &&
      signature === `mock_sig_${razorpayPaymentId}`
    : signatureMatches(paymentSignature(razorpayOrderId, razorpayPaymentId), signature)
  if (!validSignature) {
    throw new HttpError(400, 'Payment signature is invalid')
  }

  const result = await withTransaction(async (session) => {
    const order = await findOwnedOrder(session, orderId, req.userId)
    const { payment } = order
    if (payment.method !== 'razorpay' || payment.razorpayOrderId !== razorpayOrderId) {
      throw new HttpError(400, 'Payment does not match this order')
    }
    let update = null
    if (payment.status === 'paid') {
      if (payment.razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) {
        throw new HttpError(409, 'This order has already been paid')
      }
      if (!payment.razorpayPaymentId) update = { 'payment.razorpayPaymentId': razorpayPaymentId }
    } else {
      if (payment.status !== 'pending' || order.status === 'cancelled') {
        throw new HttpError(409, 'This order can no longer be paid')
      }
      update = {
        'payment.status': 'paid',
        status: 'confirmed',
        'payment.razorpayPaymentId': razorpayPaymentId,
      }
    }
    const updatedOrder = update
      ? await Order.findOneAndUpdate(
          { _id: order._id },
          { $set: update },
          { session, returnDocument: 'after', lean: true },
        )
      : order
    return toOrder(updatedOrder)
  })

  res.json({ verified: true, order: result })
})

/**
 * POST /api/payments/razorpay/fail { orderId }
 * Marks a pending payment as failed and releases its stock reservation once.
 */
paymentsRouter.post('/razorpay/fail', async (req, res) => {
  const orderId = v.str(req.body?.orderId, 'Order')
  const result = await withTransaction(async (session) => {
    const order = await findOwnedOrder(session, orderId, req.userId)
    if (order.payment.method !== 'razorpay') {
      throw new HttpError(400, 'This order is not payable with Razorpay')
    }
    if (order.payment.status === 'paid') throw new HttpError(409, 'A paid order cannot be failed')
    if (order.payment.status === 'failed') return { failed: true }

    // Mark the order failed first; the status filter makes sure stock is released only once.
    const { modifiedCount } = await Order.updateOne(
      { _id: order._id, 'payment.status': 'pending' },
      { $set: { 'payment.status': 'failed', status: 'cancelled' } },
      { session },
    )
    if (modifiedCount === 0) return { failed: true }

    for (const item of order.items) {
      await Product.updateOne(
        { _id: item.productId },
        { $inc: { [`stock.${item.size}`]: item.quantity } },
        { session },
      )
    }
    return { failed: true }
  })

  res.json(result)
})
