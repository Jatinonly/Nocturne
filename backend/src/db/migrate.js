/** migrate.js makes sure every collection's indexes match the Mongoose models
(unique emails/slugs, sort indexes, etc.). Collections themselves are created on first write.
You run it when setting up the database or when a model's indexes change.
It is not needed for normal queries while your website is running.
Usage: npm run db:migrate */

import { closeDb, connectDb } from './mongo.js'
import { Order, Product, User } from '../models/index.js'

try {
  await connectDb()
  for (const model of [User, Product, Order]) {
    await model.createCollection()
    await model.syncIndexes()
  }
  console.log('✓ Indexes applied')
} catch (error) {
  console.error('✗ Migration failed:', error.message)
  process.exitCode = 1
} finally {
  await closeDb()
}
