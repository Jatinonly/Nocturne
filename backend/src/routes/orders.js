/**
 * Orders, scoped to the logged-in user. The server re-prices the cart from the database
 * and never trusts prices, totals or payment status sent by the browser.
 */
import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { config } from '../config.js'
import { withTransaction } from '../db/mongo.js'
import { HttpError } from '../lib/httpError.js'
import * as v from '../lib/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { Order, Product } from '../models/index.js'

export const ordersRouter = Router()
ordersRouter.use(requireAuth)

const MAX_LINES = 50
const MAX_QUANTITY_PER_LINE = 20

function newOrderId() {
  const time = Date.now().toString(36).slice(-4).toUpperCase()
  const random = randomBytes(4).toString('hex').toUpperCase()
  return `NOC-${time}${random}`
}

/** Order document → the `Order` shape the frontend uses (see frontend/src/services/orderService.js). */
export function toOrder(doc) {
  const { razorpayOrderId, razorpayPaymentId } = doc.payment
  return {
    id: doc._id,
    userId: doc.userId.toString(),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    address: { ...doc.address },
    summary: { ...doc.summary },
    payment: {
      method: doc.payment.method,
      status: doc.payment.status,
      ...(razorpayOrderId ? { razorpayOrderId } : {}),
      ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
    },
    items: doc.items.map((item) => ({
      id: `${item.productId}:${item.size}:${item.colour.name}`,
      productId: item.productId,
      slug: item.slug,
      name: item.name,
      price: item.price,
      ...(item.compareAtPrice != null ? { compareAtPrice: item.compareAtPrice } : {}),
      size: item.size,
      colour: { name: item.colour.name, hex: item.colour.hex },
      silhouette: item.silhouette,
      quantity: item.quantity,
      maxQuantity: item.quantity,
    })),
  }
}

function parseAddress(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Delivery address is required')
  return {
    fullName: v.str(input.fullName, 'Full name', { max: 120 }),
    phone: v.indianPhone(input.phone),
    email: v.email(input.email),
    line1: v.str(input.line1, 'Address line 1', { max: 200 }),
    line2: v.optionalStr(input.line2, 'Address line 2', { max: 200 }),
    city: v.str(input.city, 'City', { max: 100 }),
    state: v.str(input.state, 'State', { max: 100 }),
    pincode: v.pincode(input.pincode),
  }
}

function parseItems(input) {
  if (!Array.isArray(input) || input.length === 0) throw new HttpError(400, 'Your bag is empty')
  if (input.length > MAX_LINES) throw new HttpError(400, 'Too many items in one order')
  return input.map((item) => ({
    productId: v.str(item?.productId, 'Product', { max: 50 }),
    size: v.str(item?.size, 'Size', { max: 30 }),
    // Accept either the cart's `{ name, hex }` object or a plain colour name.
    colourName: v.str(item?.colour?.name ?? item?.colour, 'Colour', { max: 50 }),
    quantity: v.int(item?.quantity, 'Quantity', { min: 1, max: MAX_QUANTITY_PER_LINE }),
  }))
}

/**
 * POST /api/orders
 * { items: [{ productId, size, colour, quantity }], address, payment: { method: 'cod' | 'razorpay' } }
 * → Order
 */
ordersRouter.post('/', async (req, res) => {
  const items = parseItems(req.body?.items)
  const address = parseAddress(req.body?.address)
  const method = v.oneOf(req.body?.payment?.method, 'Payment method', ['cod', 'razorpay'])

  const order = await withTransaction(async (session) => {
    const productIds = [...new Set(items.map((item) => item.productId))]
    const products = await Product.find({ _id: { $in: productIds } })
      .session(session)
      .lean()
    const byId = new Map(products.map((product) => [product._id, product]))

    // Stock is tracked per size (not per colour), so add up lines that share a product + size.
    const wanted = new Map()
    const lines = items.map((item) => {
      const product = byId.get(item.productId)
      if (!product) throw new HttpError(400, 'One of the items in your bag is no longer available')
      if (!product.sizes.includes(item.size)) {
        throw new HttpError(400, `${product.name} is not available in size ${item.size}`)
      }
      const colour = product.colours.find((c) => c.name === item.colourName)
      if (!colour)
        throw new HttpError(400, `${product.name} is not available in ${item.colourName}`)
      const key = `${product._id}|${item.size}`
      wanted.set(key, (wanted.get(key) ?? 0) + item.quantity)
      return { product, colour, size: item.size, quantity: item.quantity }
    })

    for (const [key, quantity] of wanted) {
      const [productId, size] = key.split('|')
      const product = byId.get(productId)
      const available = Number(product.stock[size] ?? 0)
      const soldOut = () =>
        new HttpError(
          409,
          available === 0
            ? `${product.name} (${size}) has just sold out`
            : `Only ${available} left of ${product.name} (${size})`,
        )
      if (available < quantity) throw soldOut()
      // Only decrements if there is still enough stock, so concurrent orders can't oversell.
      const { modifiedCount } = await Product.updateOne(
        { _id: productId, [`stock.${size}`]: { $gte: quantity } },
        { $inc: { [`stock.${size}`]: -quantity } },
        { session },
      )
      if (modifiedCount === 0) throw soldOut()
    }

    const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
    const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
    const mrpTotal = lines.reduce(
      (sum, line) => sum + (line.product.compareAtPrice ?? line.product.price) * line.quantity,
      0,
    )
    const shipping = subtotal >= config.shipping.freeThreshold ? 0 : config.shipping.fee

    const [created] = await Order.create(
      [
        {
          _id: newOrderId(),
          userId: req.userId,
          address,
          summary: {
            itemCount,
            mrpTotal,
            subtotal,
            savings: mrpTotal - subtotal,
            shipping,
            total: subtotal + shipping,
          },
          payment: { method },
          items: lines.map((line) => ({
            productId: line.product._id,
            slug: line.product.slug,
            name: line.product.name,
            price: line.product.price,
            compareAtPrice: line.product.compareAtPrice ?? null,
            size: line.size,
            colour: { name: line.colour.name, hex: line.colour.hex },
            silhouette: line.product.silhouette,
            quantity: line.quantity,
          })),
        },
      ],
      { session },
    )
    return toOrder(created.toObject())
  })

  res.status(201).json(order)
})

/** GET /api/orders → Order[] (newest first) */
ordersRouter.get('/', async (req, res) => {
  const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).lean()
  res.json(orders.map(toOrder))
})

/** GET /api/orders/:id → Order */
ordersRouter.get('/:id', async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.userId }).lean()
  if (!order) throw new HttpError(404, 'Order not found')
  res.json(toOrder(order))
})
