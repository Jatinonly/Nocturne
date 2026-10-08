/**
 * Product catalogue. Filters are built as MongoDB query objects; user input only ever
 * appears as values (search words are regex-escaped), never as operators.
 */
import { Router } from 'express'
import { HttpError } from '../lib/httpError.js'
import * as v from '../lib/validate.js'
import { CATEGORIES, Product } from '../models/Product.js'

export const productsRouter = Router()

const COLLECTIONS = [...CATEGORIES, 'new', 'sale', 'all']
const SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'rating']
const SEARCH_FIELDS = ['name', 'category', 'subcategory', 'description']

/** Document → the `Product` shape the frontend uses (see frontend/src/services/productService.js). */
function toProduct(doc) {
  return {
    id: doc._id,
    slug: doc.slug,
    name: doc.name,
    description: doc.description,
    category: doc.category,
    subcategory: doc.subcategory,
    price: doc.price,
    // The frontend checks `compareAtPrice !== undefined`, so omit it rather than sending null.
    ...(doc.compareAtPrice != null ? { compareAtPrice: doc.compareAtPrice } : {}),
    colours: doc.colours,
    sizes: doc.sizes,
    stock: doc.stock,
    rating: doc.rating,
    reviewCount: doc.reviewCount,
    tags: doc.tags,
    silhouette: doc.silhouette,
    composition: doc.composition,
    details: doc.details,
    createdAt: doc.createdAt.toISOString(),
  }
}

/**
 * The collection + search "base set" shared by the list, facets and search queries.
 * collections can be new, sale, men, women, ...; every search word must appear in one of SEARCH_FIELDS.
 */
function baseFilter(collection, words) {
  const filter = {}
  if (collection === 'new') filter.tags = 'new'
  else if (collection === 'sale') filter.compareAtPrice = { $ne: null }
  else if (collection !== 'all') filter.category = collection
  if (words.length) {
    filter.$and = words.map((word) => ({
      $or: SEARCH_FIELDS.map((field) => ({ [field]: { $regex: word, $options: 'i' } })),
    }))
  }
  return filter
}

/** True when some size in `stock` (optionally only those in `sizes`) has a count above 0. */
function hasStockExpr(sizes) {
  const inStock = { $gt: ['$$s.v', 0] }
  return {
    $anyElementTrue: {
      $map: {
        input: { $objectToArray: '$stock' },
        as: 's',
        in: sizes ? { $and: [{ $in: ['$$s.k', sizes] }, inStock] } : inStock,
      },
    },
  }
}

// Every sort ends with newest first, then id, so the order is stable.
const SORT_STAGES = {
  featured: { isBestseller: -1, createdAt: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  'price-asc': { price: 1, createdAt: -1, _id: 1 },
  'price-desc': { price: -1, createdAt: -1, _id: 1 },
  rating: { rating: -1, createdAt: -1, _id: 1 },
}

/** "red  dress" → ['red', 'dress'], with regex special characters escaped. */
function searchWords(term) {
  if (typeof term !== 'string') return []
  return term
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

/** "a,b" → ['a', 'b']; empty → null (filter off). */
function list(value) {
  if (typeof value !== 'string' || value === '') return null
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return items.length ? items : null
}

const optionalInt = (value, label, opts) =>
  value === undefined || value === '' ? null : v.int(value, label, opts)

function buildFacets(docs) {
  const sizes = new Set()
  const colours = new Map()
  const subcategories = new Set()
  for (const doc of docs) {
    doc.sizes.forEach((size) => sizes.add(size))
    doc.colours.forEach((colour) => colours.set(colour.name, colour))
    subcategories.add(doc.subcategory)
  }
  const prices = docs.map((doc) => doc.price)
  return {
    sizes: [...sizes],
    colours: [...colours.values()],
    subcategories: [...subcategories].sort(),
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
  }
}

/**
 * GET /api/products?collection=&subcategory=&q=&minPrice=&maxPrice=&sizes=&colours=&inStock=1&sort=&limit=
 *   → { items, total, facets }
 * GET /api/products?ids=p001,p002 → Product[] (in the given order)
 */
productsRouter.get('/', async (req, res) => {
  const ids = list(req.query.ids)
  if (ids) {
    const wanted = [...new Set(ids.slice(0, 100))]
    const docs = await Product.find({ _id: { $in: wanted } }).lean()
    const byId = new Map(docs.map((doc) => [doc._id, doc]))
    return res.json(wanted.filter((id) => byId.has(id)).map((id) => toProduct(byId.get(id))))
  }

  const collection = v.oneOf(req.query.collection ?? 'all', 'collection', COLLECTIONS)
  const words = searchWords(req.query.q)
  const sort = v.oneOf(req.query.sort || 'featured', 'sort', SORTS)
  const limit = optionalInt(req.query.limit, 'limit', { min: 1, max: 200 }) ?? 200

  const base = baseFilter(collection, words)
  const filter = { ...base }
  const subcategory = req.query.subcategory
  if (typeof subcategory === 'string' && subcategory) filter.subcategory = subcategory
  const minPrice = optionalInt(req.query.minPrice, 'minPrice')
  const maxPrice = optionalInt(req.query.maxPrice, 'maxPrice')
  if (minPrice !== null || maxPrice !== null) {
    filter.price = {
      ...(minPrice !== null ? { $gte: minPrice } : {}),
      ...(maxPrice !== null ? { $lte: maxPrice } : {}),
    }
  }
  const colours = list(req.query.colours)
  if (colours) filter['colours.name'] = { $in: colours }
  const stockChecks = []
  if (req.query.inStock === '1' || req.query.inStock === 'true') stockChecks.push(hasStockExpr())
  const sizes = list(req.query.sizes)
  if (sizes) stockChecks.push(hasStockExpr(sizes))
  if (stockChecks.length) filter.$expr = { $and: stockChecks }

  const [facetDocs, listDocs] = await Promise.all([
    Product.find(base, { sizes: 1, colours: 1, subcategory: 1, price: 1 }).sort({ _id: 1 }).lean(),
    Product.aggregate([
      { $match: filter },
      { $addFields: { isBestseller: { $in: ['bestseller', '$tags'] } } },
      { $sort: SORT_STAGES[sort] },
      { $limit: limit },
      { $project: { isBestseller: 0 } },
    ]),
  ])

  const items = listDocs.map(toProduct)
  res.json({ items, total: items.length, facets: buildFacets(facetDocs) })
})

/** GET /api/products/search?q=&limit= → Product[] (search-overlay suggestions) */
productsRouter.get('/search', async (req, res) => {
  const words = searchWords(req.query.q)
  if (words.length === 0) return res.json([])
  const limit = optionalInt(req.query.limit, 'limit', { min: 1, max: 50 }) ?? 6
  const docs = await Product.find(baseFilter('all', words)).sort({ _id: 1 }).limit(limit).lean()
  res.json(docs.map(toProduct))
})

/**
 * GET /api/products/:id/related?limit= → Product[]
 * Scores every other product (same subcategory +3, same category +2, a shared colour +1),
 * then best score, best rating. The catalogue is small, so this is done in JS.
 */
productsRouter.get('/:id/related', async (req, res) => {
  const limit = optionalInt(req.query.limit, 'limit', { min: 1, max: 50 }) ?? 8
  const target = await Product.findById(req.params.id).lean()
  if (!target) return res.json([])

  const targetColours = new Set(target.colours.map((colour) => colour.name))
  const score = (p) =>
    (p.category === target.category ? 2 : 0) +
    (p.subcategory === target.subcategory ? 3 : 0) +
    (p.colours.some((colour) => targetColours.has(colour.name)) ? 1 : 0)

  const others = await Product.find({ _id: { $ne: target._id } }).lean()
  const related = others
    .map((p) => ({ p, score: score(p) }))
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating || (a.p._id < b.p._id ? -1 : 1))
    .slice(0, limit)
  res.json(related.map(({ p }) => toProduct(p)))
})

/** GET /api/products/:slug → Product (404 if missing) */
productsRouter.get('/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }).lean()
  if (!product) throw new HttpError(404, 'Product not found')
  res.json(toProduct(product))
})
