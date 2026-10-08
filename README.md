# Nocturne

An Indian clothing storefront (women, men, bags, shoes, jewellery). Customers browse and filter a catalogue, keep a cart and wishlist, sign up or log in, check out with **Razorpay** or **cash on delivery**, and track their orders.

It is an npm-workspaces monorepo: a **Vite + React 19** frontend and an **Express 5** API on **MongoDB (Mongoose)**. The frontend can also run **with no backend at all**, using in-browser mock services. Keep that in mind whenever you change a service.

---

## 1. Quick Start

**Prerequisites:** Node **≥ 22.9** (the backend scripts use `node --env-file-if-exists`), and a MongoDB **replica set**. Any Atlas cluster, including the free tier, is a replica set. A plain local `mongod` is not, so placing orders will fail on it (see §10).

```bash
npm install                                   # at the repo root; installs both workspaces
cp backend/.env.example backend/.env          # set MONGODB_URI and JWT_SECRET (see §8)
cp frontend/.env.example frontend/.env        # defaults are fine for local dev
npm run db:migrate                            # create collections and sync indexes
npm run db:seed                               # upsert 43 demo products and the demo user
npm run dev                                   # API on :4000, web on http://localhost:5173
```

**Demo login:** `demo@nocturne.in` / `password123`

**Payments without Razorpay keys:** set `RAZORPAY_MOCK=true` in `backend/.env`. Checkout then opens a simulated popup but still goes through the real order, stock and verify endpoints.

**UI work without a database:** set `VITE_API_BASE_URL=` (empty) in `frontend/.env` and run `npm run dev:web`. Products, auth, orders and payments are then faked in the browser.

| Root script                   | Purpose                                            |
| ----------------------------- | -------------------------------------------------- |
| `npm run dev`                 | API (`node --watch`) and Vite together, via `concurrently` |
| `npm run dev:api` / `dev:web` | Run only one of them                               |
| `npm run db:migrate`          | `createCollection` and `syncIndexes` for every model (idempotent) |
| `npm run db:seed`             | Upsert products from `frontend/src/data/products.js` plus the demo user |
| `npm run build` / `npm start` | Build the frontend / run the API without watch     |
| `npm run lint` / `format`     | ESLint in both workspaces / Prettier on the whole repo |

There are no tests yet.

---

## 2. How the App Is Structured

```
Browser
  │  React SPA (react-router, lazy pages)
  │  Zustand stores ──persist──► localStorage  (auth token, cart, wishlist, orders cache)
  │
  │  src/services/*  ── env.useMockApi? ──yes──► in-browser mocks (data/products.js, localStorage "tables")
  │                                       no
  ▼
fetch("/api/…")  ──Vite dev proxy──►  Express API :4000  (backend/src/app.js)
                                          │  requireAuth (JWT Bearer) on orders/payments
                                          ├──► MongoDB via Mongoose (users, products, orders)
                                          └──► Razorpay Orders API (server-side, secret key)
Browser ──► checkout.razorpay.com/v1/checkout.js (payment popup)
Razorpay ──webhook──► POST /api/payments/razorpay/webhook
```

- **Frontend** (`frontend/`): pages call **services**, never `fetch` or mock data directly. Each service function has two branches: the real API (via `apiRequest` in `services/http.js`) or a mock that returns the same shapes. Shared state lives in small Zustand stores.
- **Backend** (`backend/`): a deliberately flat Express app. Routes hold the validation, business logic and DB access themselves; there is no separate controller or service layer. Errors are thrown as `HttpError` and turned into `{ message }` JSON by one error handler.
- **Database**: three Mongoose models. Order line items are **embedded snapshots**, not references.
- **Razorpay**: the backend creates gateway orders and verifies signatures. The browser only opens the checkout popup.
- **Dev wiring**: the frontend calls the relative path `/api`, and Vite proxies it to `API_PROXY_TARGET`, so there is no CORS in development. `CORS_ORIGIN` on the backend only matters when the frontend is served from another origin.

---

## 3. Repository Map

```
package.json              workspaces + root scripts
backend/src/
  server.js               listen + graceful shutdown
  app.js                  middleware order, router mounting, /api/health  ← start here
  config.js               all env vars; required ones are lazy getters (see §7)
  db/mongo.js             connectDb (lazy, on first request), withTransaction, pingDb
  db/migrate.js, seed.js  CLI scripts (seed imports the FRONTEND catalogue file)
  middleware/auth.js      signToken / requireAuth (HS256 JWT, sets req.userId)
  middleware/errors.js    notFound + errorHandler → { message }
  lib/httpError.js        throw new HttpError(status, msg) from anywhere
  lib/validate.js         str/email/indianPhone/pincode/int/oneOf validators (throw 400)
  models/                 User, Product, Order (+ CATEGORIES, ORDER_STATUSES enums)
  routes/                 auth, products, orders, payments; each file maps docs to API shapes (toUser/toProduct/toOrder)

frontend/src/
  routes/AppRouter.jsx    all routes; ProtectedRoute / GuestRoute wrappers
  pages/                  one lazy-loaded file per route
  components/             ui/ (primitives), layout/ (shell, nav, search overlay), product/, cart/, checkout/, order/, home/
  services/               productService, authService, orderService, paymentService (+ http.js, mockRazorpay.js)
  store/                  authStore, cartStore, wishlistStore, ordersStore (persisted); filterStore, uiStore (not persisted)
  config/env.js           VITE_* access and the useMockApi switch
  config/site.js          brand copy, nav, footer, and the CLIENT-SIDE shipping threshold/fee
  data/                   mock catalogue (also the seed source), categories, Indian states
  lib/                    pricing, validation, images (generated SVG placeholders), format, navigation
  hooks/useQuery.js       tiny fetch hook keyed by a string (no cache)
  index.css               Tailwind v4 @theme tokens (default palette disabled)
frontend/README.md        UI features, theming, images, Razorpay notes
frontend/docs/            page walkthroughs (listing / detail / cart)
```

---

## 4. Core Application Workflows

### Browse and filter products

```
/shop/:collection?type=<subcategory>  or  /search?q=
→ ProductListingPage: reads URL params plus filterStore (price/sizes/colours/inStock/sort)
→ useQuery(JSON.stringify(query), productService.listProducts)
→ GET /api/products?collection=&subcategory=&q=&minPrice=&maxPrice=&sizes=&colours=&inStock=1&sort=
→ routes/products.js:
     baseFilter(collection, search words)  ─┬─► facets query (sizes/colours/subcategories/price range)
     + subcategory/price/colour/stock      ─┴─► aggregate: $match → bestseller flag → $sort → $limit
→ { items, total, facets } → grid + FilterPanel options
```

- Facets come from the **base set** (collection + search only), so selecting a filter doesn't remove its sibling options. The mock in `productService` does the same.
- A size filter means "in stock in that size". It is a `$expr` over the `stock` object, not a match on `sizes`.
- Search escapes regex characters, uses at most 10 words, and requires every word to match one of name, category, subcategory or description.
- `filterStore` is reset whenever the collection or search term changes.
- Other product reads: `GET /products/:slug` (detail page), `/:id/related` (scored in JS: subcategory +3, category +2, shared colour +1), `/search` (search overlay suggestions), and `?ids=a,b` (wishlist page, returned in the requested order).

### Cart and wishlist (client only)

```
ProductDetailPage → PurchasePanel → cartStore.addItem({ productId, size, colour, price, …, maxQuantity: stock[size] })
→ persisted to localStorage "nocturne:cart" → CartDrawer / CartPage → lib/pricing.computePriceSummary
```

- Cart line id is `${productId}:${size}:${colourName}`. Quantity is clamped to `maxQuantity`, which is a **stock snapshot taken when the item was added**.
- Prices and totals in the cart are only for display. The server re-prices everything at checkout.
- The wishlist stores product ids only. WishlistPage fetches the products with `getProductsByIds`.

### Sign up / log in

```
LoginPage / SignupPage → authStore.login|signup → authService
→ POST /api/auth/login|signup (auth: false)
→ routes/auth.js: validate → bcrypt (12 rounds; compares against a dummy hash for unknown emails) → User.findOne / create
→ { user, token }  (JWT: sub = user ObjectId, HS256, JWT_EXPIRES_IN)
→ authStore saves { user, token } to localStorage "nocturne:auth"
→ GuestRoute sees user → redirects to ?redirect= (made safe by lib/navigation.safeRedirect)
```

- **Every later request:** `apiRequest` reads the token through hooks that `authStore` registers with `configureAuth()`. This avoids a circular import between services and stores. It sends `Authorization: Bearer …`.
- **Session end:** any 401 on an authenticated request calls `onUnauthorized`, which clears `user` and `token`. `ProtectedRoute` then redirects to `/login?redirect=…`.
- **No startup check:** the frontend never calls `GET /auth/me`. A stored session counts as valid until some API call returns 401.
- **Logout:** `POST /auth/logout` is a no-op that returns 204. Logout is client-side: `AccountMenu` clears the auth store and `ordersStore`. JWTs cannot be revoked.

### Checkout and place order (the critical path)

`CheckoutPage` has two steps: an address form, then a payment method. `placeOrder()` drives everything:

```
1. orderService.createOrder → POST /api/orders  { items:[{productId,size,colour,quantity}], address, payment:{method} }
   routes/orders.js, inside withTransaction:
     load products → check size/colour exist → sum qty per (product,size)
     → for each: Product.updateOne({ stock.<size> >= qty }, { $inc: -qty })   ← stock reserved now
     → compute summary from DB prices + backend shipping config
     → Order.create({ _id: "NOC-…", status:'placed', payment:{ method, status:'pending' }, items: snapshots })
   ← Order  (409 "just sold out" / "Only N left" if stock lost the race)

2a. COD → done: ordersStore.addOrder → navigate /orders/:id?placed=1 → cartStore.clear()

2b. Razorpay → paymentService.payWithRazorpay:
     POST /api/payments/razorpay/order { orderId }
        → amount = DB order total × 100 (paise); creates a Razorpay order (or order_mock_… when RAZORPAY_MOCK)
        → stores payment.razorpayOrderId; reuses it if already set
        ← { id, amount, currency, keyId, mock }
     open popup: real checkout.js, or <MockRazorpayHost> (mounted in Layout) if mock
     success → POST /api/payments/razorpay/verify { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
        → HMAC-SHA256(order_id|payment_id, KEY_SECRET), compared in constant time (mock: "mock_sig_<paymentId>")
        → order.status 'confirmed', payment.status 'paid'
     failed / dismissed / exception → POST /api/payments/razorpay/fail { orderId }
        → only if payment still 'pending': payment 'failed', status 'cancelled', stock $inc back (exactly once)
```

On failure the cart is kept and an `Alert` explains what happened. On success the cart is cleared after navigating.

**Webhook (backstop):** `POST /api/payments/razorpay/webhook` receives a **raw** body (`express.raw` is mounted for this path in `app.js` before `express.json`). The handler verifies `x-razorpay-signature` with `RAZORPAY_WEBHOOK_SECRET`. On `payment.captured` or `order.paid` it flips a still-unpaid order to paid/confirmed, and replaying the same event changes nothing. The webhook is mounted **before** `paymentsRouter.use(requireAuth)`, and it returns 404 in mock mode.

### Order history

```
OrdersPage → ordersStore.fetchOrders → GET /api/orders (scoped by req.userId, newest first) → persisted cache
OrderDetailPage → uses the ordersStore cached order if present, else GET /api/orders/:id
```

The detail page **prefers the cache**, so status changes made on the server don't show up there until `/orders` is revisited. Examples are a webhook confirming payment, or any future shipping status.

---

## 5. Data Flow / Important Relationships

- **One Product shape, two sources.** The backend's `toProduct()` must match the `Product` typedef in `frontend/src/services/productService.js`, because the mock returns `data/products.js` objects directly. Note that `compareAtPrice` is **omitted, not null**, when there is no discount. The frontend checks `!== undefined` to decide what counts as "on sale".
- **The frontend catalogue file is the seed.** `backend/src/db/seed.js` imports `frontend/src/data/products.js`, so that file must stay plain JS with no `@/` alias imports. Products use string ids (`p001`) and `slug` is unique.
- **Orders embed snapshots.** `Order.items[]` copies name, price, colour and silhouette at purchase time. Price changes later don't rewrite history. `toOrder()` rebuilds a cart-like `id` and sets `maxQuantity = quantity` so order lines can reuse the cart components (`CartItemImage`, `PriceBreakdown`).
- **Stock is per size, not per colour** (`Product.stock = { "S": 4, "M": 0 }`). Two cart lines with the same product and size but different colours draw from the same stock.
- **Order and payment status are coupled.** `placed` + `pending` becomes `confirmed` + `paid` (via verify or webhook) or `cancelled` + `failed` (via fail). COD orders stay `placed` + `pending`. Nothing in the code sets `shipped` or `delivered`; `OrderTimeline` just renders whatever the status is.
- **Images aren't stored anywhere.** `product.silhouette` plus the colour hex feed `lib/images.js`, which generates SVG placeholders. Banners come from picsum.photos.
- **Mock vs API switch:** `env.useMockApi` is true when `VITE_API_BASE_URL` is empty. Mock *payments* can also be chosen by the backend: it returns `mock: true` from `/payments/razorpay/order` when `RAZORPAY_MOCK=true`, and the frontend obeys that flag.

---

## 6. Important Design Decisions

- **The server never trusts client money or stock.** `POST /orders` accepts only ids, sizes, colours and quantities. Prices, totals and shipping are recomputed from the DB, and Razorpay amounts come from the stored order. This is stated in the `routes/orders.js` header.
- **Stock is reserved at order creation, not at payment.** It is done with conditional `$inc` inside a transaction so concurrent orders can't oversell (per the existing README and code comments). Failed or dismissed Razorpay payments release it through `/fail`.
- **Transactions are used for read-then-write on orders.** The comment in `payments.js` explains they replace the earlier Postgres `SELECT … FOR UPDATE`. That is also why a replica set is required.
- **MongoDB replaced Postgres** in the most recent commit (`91a6d52`). `requireAuth` rejects tokens whose `sub` isn't an ObjectId, so old Postgres-era tokens behave as expired. Reason for the switch: not documented.
- **The DB connects lazily on the first `/api` request** (`app.js` + `connectDb`), so the server can boot and report missing config (503) before `.env` is filled in. `bufferCommands` is off so queries fail fast instead of hanging.
- **Required env vars are lazy getters** in `config.js` for the same reason. They throw a 503 `HttpError` when first used, not at startup.
- **Dual-mode services (mock/API)** let the UI be built and demoed without a backend. The components don't care which mode is active.
- **Zustand + `persist`** for client state, with a hand-rolled `useQuery` instead of TanStack Query. A comment in `useQuery.js` says to swap it later if caching is needed.
- **Routes contain the logic.** There is no controller or service layer. Each route file has its own doc→API mapper (`toUser`, `toProduct`, `toOrder`), and reads use `.lean()`.
- **User input only ever becomes query values**, never keys or operators. Search words are regex-escaped. Bcrypt passwords are capped at 72 chars because bcrypt reads at most 72 bytes.

---

## 7. Important Things to Know Before Changing Code

- **Changing an API response shape** means updating the mock branch in the matching `frontend/src/services/*.js` and its JSDoc typedef too, or mock mode silently drifts.
- **Business rules are duplicated client/server.** Keep these in sync by hand:
  - shipping threshold and fee: `frontend/src/config/site.js` vs `backend/.env` (`FREE_SHIPPING_THRESHOLD`, `SHIPPING_FEE`). A mismatch means checkout shows a different total than the order gets.
  - pricing summary: `lib/pricing.js` vs `routes/orders.js`
  - categories: `data/categories.js` vs `models/Product.js` `CATEGORIES` vs the `COLLECTIONS` list in `routes/products.js`
  - filtering, sorting and related-products scoring: `productService.js` mock vs `routes/products.js`
  - validation (phone, PIN code, email): `lib/validation.js` vs `lib/validate.js`
- **Order statuses** (`ORDER_STATUSES` in `models/Order.js`) are rendered by `OrderStatusBadge` and `OrderTimeline`. Add new values in all three places.
- **`toOrder()` is exported from `routes/orders.js`** and reused by `routes/payments.js`.
- **Middleware order in `app.js` matters.** The webhook's `express.raw` must stay before `express.json`, or signature checks break. Inside `payments.js`, the webhook route must stay above `paymentsRouter.use(requireAuth)`.
- **Any DB write in the order or payment flow must pass `{ session }`** inside `withTransaction`. Without it the write runs outside the transaction.
- **Stock updates must stay conditional** (`stock.<size> >= qty`). A plain `$inc` reintroduces overselling.
- **Index changes** in a model need `npm run db:migrate`. `syncIndexes` also **drops** indexes that are no longer in the schema.
- **New persisted store fields:** stores have `version: 1` and no `migrate` function, so changing a persisted shape can leave old localStorage data in place.
- **`data/products.js` is imported by Node** (the seed script). Don't add browser-only or `@/` imports to it.
- **Adding a VITE_ variable:** add it to `config/env.js` and `.env.example`, as the comment in `env.js` asks.

---

## 8. Environment & Configuration

**`backend/.env`** (read by `src/config.js`; loaded through `--env-file-if-exists`)

| Variable | Required? | Controls |
| --- | --- | --- |
| `MONGODB_URI` | Yes | Mongo connection. Include the DB name before `?`, e.g. `…mongodb.net/nocturne?retryWrites…`. Must be a replica set. |
| `JWT_SECRET` | Yes | Signs and verifies auth tokens. Use a long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Changing it logs everyone out. |
| `JWT_EXPIRES_IN` | No (`7d`) | Token lifetime. There is no refresh. |
| `PORT` | No (`4000`) | API port. Must match the frontend's `API_PROXY_TARGET`. |
| `CORS_ORIGIN` | No | Comma-separated allowed origins. Empty disables the `cors` middleware. Not needed with the Vite proxy. |
| `FREE_SHIPPING_THRESHOLD`, `SHIPPING_FEE` | No (`2999`, `99`) | Server-side shipping charged on orders. Keep in sync with `site.js`. |
| `RAZORPAY_MOCK` | No (`false`) | `true` gives a simulated gateway (no keys needed) and disables the webhook. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | When mock is off | Creating gateway orders and verifying signatures. The key id is sent to the browser; the secret never is. |
| `RAZORPAY_WEBHOOK_SECRET` | When mock is off | Verifies webhook bodies. |

**`frontend/.env`** (Vite)

| Variable | Controls |
| --- | --- |
| `VITE_API_BASE_URL` | `/api` uses the real backend through the proxy. **Empty** switches every service to mock mode. |
| `API_PROXY_TARGET` | Where the Vite dev proxy forwards `/api` (default `http://localhost:4000`). Dev server only. |
| `VITE_RAZORPAY_KEY_ID` | Used only by frontend mock mode. Real checkout uses the `keyId` returned by the backend. |

Never put Razorpay secrets in `frontend/.env`. Everything with a `VITE_` prefix ships to the browser.

---

## 9. Common Development Tasks

- **New page:** create it in `frontend/src/pages/` (default export), then add a `lazy()` import and a route in `routes/AppRouter.jsx`. Wrap it in `<ProtectedRoute>` if it needs login. Add nav links in `config/site.js`.
- **New API endpoint:** add it to the relevant `backend/src/routes/*.js` file, or create a router and mount it in `app.js`. Validate input with `lib/validate.js`, throw `HttpError`, and return a mapped shape. Then add a function in the matching frontend service, with a mock branch or an explicit API-only path.
- **Authenticated endpoint:** add `requireAuth` (per route, or `router.use(requireAuth)`), and always scope queries by `req.userId`.
- **Change a model:** edit `backend/src/models/*`, update the `to*()` mapper, the frontend typedef and the mock data, then run `npm run db:migrate` if indexes changed. Also update `seed.js` if it's a product field, since the seed maps fields explicitly.
- **Change catalogue data:** edit `frontend/src/data/products.js`, then run `npm run db:seed`. The seed replaces products by `_id` and never resets an existing demo user's password.
- **Theme or branding:** use the `@theme` tokens in `src/index.css` and the copy in `config/site.js`. For real photos, change only `lib/images.js`. `frontend/README.md` has details.

---

## 10. Troubleshooting / Known Gotchas

- **`503 Database not configured` / `Missing env var X`:** `backend/.env` is missing or incomplete. `GET /api/health` reports DB connectivity.
- **Placing an order fails with a transaction error:** your MongoDB isn't a replica set. Use Atlas, or run local `mongod` with `--replSet` and `rs.initiate()`.
- **The frontend shows data but none of it is in the DB:** you're in mock mode (`VITE_API_BASE_URL` is empty). Mock users and orders live in localStorage under `nocturne:mock-db:*`.
- **Logged out right after switching modes or rotating `JWT_SECRET`:** this is expected. A stale token gets a 401, which clears the auth store. Mock tokens (`mock-token-…`) are never valid against the API.
- **API requests 404 or `ECONNREFUSED` in dev:** the API isn't running, or `PORT` and `API_PROXY_TARGET` disagree.
- **`--env-file-if-exists` is not a valid flag:** your Node is too old. You need 22.9 or newer.
- **"This order was created in mock mode and cannot use live checkout":** the order got an `order_mock_…` id while `RAZORPAY_MOCK=true`. Place a new order after switching to live mode. Restart the API after changing Razorpay env vars.
- **Real checkout shows "Could not load Razorpay":** `checkout.razorpay.com` was blocked by an ad blocker or by being offline.
- **Webhook signature fails:** something parsed the body before the handler. See the middleware-order notes in §7.
- **Order detail shows a stale status:** this comes from the `ordersStore` cache (§4).

---

## 11. Current State / Known Limitations

- **Stuck reservations:** if the browser closes mid-Razorpay checkout and `/fail` is never called, the order stays `pending` and its stock stays reserved. The webhook only handles success, and there is no expiry job.
- **No COD lifecycle:** COD orders are never confirmed, and there is no cancellation or return flow. No admin or fulfilment tooling exists, so `shipped` and `delivered` are never set.
- **Auth is minimal:** no token refresh, password reset, rate limiting or server-side logout. The JWT lives in localStorage.
- **Cart stock isn't revalidated:** the cart's `maxQuantity` can go stale. The server catches this at checkout with a 409.
- **Placeholder content:** product images are generated placeholders, the info pages (`/help/*`, `/legal/*`, `/about`, `/stores`) are placeholders, and the footer newsletter is a `TODO(api)`.
- **Simple catalogue queries:** related products and facets load whole collections into memory. A code comment says this is fine because the catalogue is small. There is no pagination; list `limit` is capped at 200.
- **No tests or CI.**
- **Stale docs:** `frontend/README.md` and `frontend/docs/page-walkthroughs.md` still mention Postgres and `TODO(api)` placeholders. Treat this file and the code as authoritative.
