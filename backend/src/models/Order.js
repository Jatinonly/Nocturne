import mongoose from 'mongoose'

export const ORDER_STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled']

// Snapshot of each line at the time of purchase (product names/prices can change later).
const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, ref: 'Product' },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    compareAtPrice: { type: Number, default: null },
    size: { type: String, required: true },
    colour: {
      name: { type: String, required: true },
      hex: { type: String, required: true },
    },
    silhouette: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. 'NOC-ABCD1234EF'
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed' },
    address: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
      line1: { type: String, required: true },
      line2: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    // Price summary, computed by the server from current product prices
    summary: {
      itemCount: { type: Number, required: true },
      mrpTotal: { type: Number, required: true },
      subtotal: { type: Number, required: true },
      savings: { type: Number, required: true },
      shipping: { type: Number, required: true },
      total: { type: Number, required: true },
    },
    payment: {
      method: { type: String, required: true, enum: ['razorpay', 'cod'] },
      status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
      razorpayOrderId: { type: String },
      razorpayPaymentId: { type: String },
    },
    items: { type: [orderItemSchema], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
)
orderSchema.index({ userId: 1, createdAt: -1 })
orderSchema.index({ 'payment.razorpayOrderId': 1 }, { unique: true, sparse: true })

export const Order = mongoose.model('Order', orderSchema)
