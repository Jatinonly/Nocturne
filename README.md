# Nocturne

Clothing storefront: React frontend + Express API on MongoDB (Mongoose).

```
frontend/   Vite + React 19 + Tailwind v4 storefront (see frontend/README.md)
backend/    Express 5 API, MongoDB via Mongoose
  src/models/        collections (users, products, orders — order items are embedded)
  src/db/mongo.js    connection + transaction helper
  src/routes/        auth, products, orders, payments
reference/  design references
```

## Setup

```bash
npm install                                   # installs both workspaces (run at the repo root)
cp backend/.env.example backend/.env          # fill in MONGODB_URI, JWT_SECRET, and Razorpay test keys
cp frontend/.env.example frontend/.env
npm run db:migrate                            # create collections + indexes
npm run db:seed                               # load 43 demo products + demo user
npm run dev                                   # API on :4000, web on http://localhost:5173
```

Demo login: `demo@nocturne.in` / `password123`.

To work on the UI without a database, set `VITE_API_BASE_URL=` (empty) in `frontend/.env`; the frontend then uses its in-browser mocks.

### Backend values (backend/.env)

| Variable      | Where to get it                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONGODB_URI` | MongoDB Atlas → cluster → **Connect** → **Drivers** → connection string. Add the database name before `?` (e.g. `…mongodb.net/nocturne?retryWrites…`). |
| `JWT_SECRET`  | Any long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`                                               |

Placing orders uses transactions, which need a replica set. Atlas clusters (including the free tier) always are one; a plain local `mongod` is not.

## Scripts (repo root)

| Script                        | What it does                                     |
| ----------------------------- | ------------------------------------------------ |
| `npm run dev`                 | API + frontend together                          |
| `npm run dev:web` / `dev:api` | Just one of them                                 |
| `npm run db:migrate`          | Create collections and sync indexes (idempotent) |
| `npm run db:seed`             | Upsert demo products and the demo user           |
| `npm run build`               | Production build of the frontend                 |
| `npm start`                   | Run the API without file watching                |
| `npm run lint` / `format`     | ESLint (both workspaces) / Prettier              |

## Database rules

- Mongoose models in `backend/src/models/` are the only schema. Routes use `.lean()` reads and return plain API shapes via `toProduct` / `toOrder` / `toUser`.
- User input only ever goes into query _values_, never keys or operators (search words are regex-escaped).
- Stock changes use conditional updates (`stock.<size> >= qty`) inside `withTransaction`, so concurrent orders can't oversell.
