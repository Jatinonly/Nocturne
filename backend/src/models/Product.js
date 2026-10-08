import mongoose from 'mongoose'

export const CATEGORIES = ['women', 'men', 'bags', 'shoes', 'jewellery']

const productSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. 'p001'
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, required: true, enum: CATEGORIES },
    subcategory: { type: String, required: true },
    price: { type: Number, required: true, min: 0 }, // whole rupees, GST inclusive
    compareAtPrice: { type: Number, min: 0, default: null }, // original price when discounted
    colours: { type: [{ _id: false, name: String, hex: String }], default: [] },
    sizes: { type: [String], default: [] },
    stock: { type: Object, default: {} }, // { "S": 4, "M": 0 }
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    silhouette: { type: String, required: true },
    composition: { type: String, default: '' },
    details: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false, minimize: false },
)
productSchema.index({ category: 1 })
productSchema.index({ createdAt: -1 })

export const Product = mongoose.model('Product', productSchema)
