/**
 * Loads the demo catalogue (frontend/src/data/products.js) and a demo user into the database.
 * Re-running updates existing documents instead of duplicating them. Usage: npm run db:seed
 */
import bcrypt from 'bcryptjs'
import { PRODUCTS } from '../../../frontend/src/data/products.js'
import { Product, User } from '../models/index.js'
import { closeDb, connectDb } from './mongo.js'

const DEMO_USER = {
  name: 'Aanya Sharma',
  email: 'demo@nocturne.in',
  password: 'password123',
  phone: '9876543210',
}

try {
  await connectDb()
  await Product.bulkWrite(
    PRODUCTS.map((p) => ({
      replaceOne: {
        filter: { _id: p.id },
        replacement: {
          _id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description,
          category: p.category,
          subcategory: p.subcategory,
          price: p.price,
          compareAtPrice: p.compareAtPrice ?? null,
          colours: p.colours,
          sizes: p.sizes,
          stock: p.stock,
          rating: p.rating,
          reviewCount: p.reviewCount,
          tags: p.tags,
          silhouette: p.silhouette,
          composition: p.composition,
          details: p.details,
          createdAt: new Date(p.createdAt),
        },
        upsert: true,
      },
    })),
  )
  const hash = await bcrypt.hash(DEMO_USER.password, 12)
  await User.updateOne(
    { email: DEMO_USER.email },
    { $setOnInsert: { name: DEMO_USER.name, passwordHash: hash, phone: DEMO_USER.phone } },
    { upsert: true },
  )
  console.log(`✓ Seeded ${PRODUCTS.length} products and demo user ${DEMO_USER.email}`)
} catch (error) {
  console.error('✗ Seed failed:', error.message)
  process.exitCode = 1
} finally {
  await closeDb()
}
