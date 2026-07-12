# Marlowe — General Store

A full-stack e-commerce app: static HTML/Tailwind-style CSS/vanilla JS frontend,
an Express server, Turso (libSQL) database, JWT + bcrypt auth.

The storefront UI/UX, database schema, API routes, and business logic are
completely unchanged. The only thing that changed from the original
Vercel-Serverless-Functions build is the runtime: `server.js` is a single,
always-on Express process (what Railway and most non-Vercel hosts expect),
which auto-mounts every handler in `api/**/*.js` at the exact same URL it
had on Vercel.

---

## Stack

| Layer          | Technology                              |
|----------------|------------------------------------------|
| Frontend       | HTML5, hand-rolled CSS, vanilla JS (no build step) |
| Backend        | Node.js + Express (ESM), always-on server |
| Database       | Turso (libSQL / SQLite at the edge)      |
| Auth           | JWT (Bearer token + httpOnly cookie) + bcrypt |
| Hosting        | Railway (or any host that runs `npm start`) |

## Project structure

```
marlowe/
├── server.js             Express server: auto-mounts every api/**/*.js
│                          handler, serves public/, SPA fallback, listens
│                          on process.env.PORT
├── api/                  Route handlers (one file = one route, unchanged)
│   ├── auth/             register, login, logout, me
│   ├── products/         list/create, [id] detail, categories (legacy path)
│   ├── categories/       full CRUD
│   ├── orders/           mine/create, [id], admin (list + status update)
│   ├── admin/            dashboard stats
│   ├── users/            admin user management
│   ├── wishlist/         per-user wishlist
│   ├── cart/             optional server-side cart sync
│   ├── reviews/          product reviews
│   ├── settings/         store settings (public read, admin write)
│   └── upload/           image upload (data-URI, or Vercel Blob if configured)
├── lib/                  Shared, framework-free application code
│   ├── db.js             Turso client, schema, auto-migrations, demo seed
│   ├── auth.js           JWT sign/verify, bcrypt, cookie handling
│   ├── validate.js       Input validation & sanitization, HttpError
│   └── id.js             UUID generation
├── middleware/            Cross-cutting request handling
│   ├── route.js          Composes every handler: CORS, headers, rate
│   │                      limiting, DB init, auth/admin guard, error handling
│   └── security.js       CORS headers, security headers, rate limiter
├── public/
│   └── index.html         The entire storefront + admin UI (unchanged design)
├── package.json
├── railway.json           Railway build/deploy config (Nixpacks, `npm start`)
├── Procfile               Platform-agnostic fallback start declaration
├── .env.example
└── README.md
```

### How routing works now

Vercel's file-based router turned `api/products/[id].js` into a route where
the dynamic segment arrived on `req.query.id`. Every handler was written
against that contract. `server.js` preserves it exactly: it walks `api/`,
converts `[id].js` → an Express `:id` route param, and copies
`req.params` onto `req.query` before calling the handler — so
`const { id } = req.query` still works, unmodified, in every route file.
Literal routes (like `api/orders/admin.js`) are mounted before dynamic ones
(like `api/orders/[id].js`) so `/api/orders/admin` is never swallowed by
the `:id` pattern — the same precedence Vercel's own router used.

Every API route is a small file that declares its HTTP methods and passes
them to `route()`, which centrally handles CORS, security headers, rate
limiting, database initialization, authentication, and error formatting.
No route file repeats that boilerplate, and no route can accidentally skip
a security check.

## Database schema

Tables are created automatically (idempotent `CREATE TABLE IF NOT EXISTS`)
the first time any API route runs after deployment — there is no manual
migration step.

`users`, `categories`, `products`, `orders`, `order_items`, `reviews`,
`wishlist`, `cart`, `settings`.

The **first account ever registered automatically becomes an admin**; every
account after that is a regular user. An admin can promote/demote other
users from the Admin → Users tab (the app always keeps at least one admin).

On a brand-new, empty database the app also seeds 5 demo categories and 10
demo products so the store isn't empty on first load. Set
`SEED_DEMO_DATA=false` to skip this.

## Authentication

- Passwords are hashed with bcrypt (10 rounds), never stored in plain text.
- On login/register, a JWT (7 day expiry) is returned in the response body
  **and** set as an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
  production). The frontend uses the Bearer token from the response body
  (stored in `localStorage`) exactly as the original UI did; the cookie is
  a defense-in-depth fallback and what `GET /api/auth/me` / `POST
  /api/auth/logout` are built around.
- Every protected route re-verifies the JWT signature and expiry on the
  server; nothing is trusted from the client beyond "this token is valid
  and unexpired."

## Security

- **CORS** — explicit allow-list of methods/headers; origin configurable
  via `CORS_ORIGIN`.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy` set
  on every response.
- **Rate limiting** — a lightweight in-memory sliding-window limiter keyed
  by route + IP, tuned tighter on auth endpoints. On Railway's always-on
  server this persists for the life of the process (it only resets on a
  redeploy/restart, and would need an external store like Redis to share
  state across multiple replicas), but meaningfully slows down scripted
  abuse without requiring extra infrastructure.
- **Input validation & sanitization** — every write endpoint validates
  types/lengths server-side and strips `<`/`>` from free-text fields
  before they're stored, regardless of what the client sends.
- **SQL** — 100% parameterized queries (`db.execute({ sql, args })`); no
  string concatenation of user input into SQL anywhere.
- **Authorization** — admin-only routes check the JWT's role server-side
  on every request; a client-side "admin" flag is never trusted.
- **Error handling** — unexpected errors are logged server-side and return
  a generic `500` message; internals/stack traces are never leaked to the
  client.

## API reference

All routes are under `/api`. Protected routes require either an
`Authorization: Bearer <token>` header or the auth cookie.

| Method | Path                     | Auth   | Description |
|--------|--------------------------|--------|-------------|
| POST   | `/auth/register`         | —      | Create an account (first ever user becomes admin) |
| POST   | `/auth/login`             | —      | Sign in |
| POST   | `/auth/logout`            | —      | Clear the auth cookie |
| GET    | `/auth/me`                | user   | Current user |
| GET    | `/products`               | —      | List products (`?search=&category=&sort=`) |
| POST   | `/products`               | admin  | Create product |
| GET    | `/products/:id`           | —      | Product detail |
| PUT    | `/products/:id`           | admin  | Update product |
| DELETE | `/products/:id`           | admin  | Delete product |
| GET    | `/products/categories`    | —      | Category list (storefront filter dropdown) |
| GET    | `/categories`             | —      | Category list |
| POST   | `/categories`             | admin  | Create category |
| PUT    | `/categories/:id`         | admin  | Update category |
| DELETE | `/categories/:id`         | admin  | Delete category |
| GET    | `/orders`                 | user   | My orders |
| POST   | `/orders`                 | user   | Place an order |
| GET    | `/orders/:id`             | user   | Order detail (owner or admin) |
| GET    | `/orders/admin`           | admin  | All orders |
| PUT    | `/orders/admin?id=`       | admin  | Update order status |
| GET    | `/admin/stats`            | admin  | Dashboard metrics |
| GET    | `/users`                  | admin  | List users |
| PUT    | `/users/:id`              | admin  | Change a user's role |
| DELETE | `/users/:id`              | admin  | Delete a user |
| GET    | `/wishlist`               | user   | My wishlist |
| POST   | `/wishlist`               | user   | Add to wishlist |
| DELETE | `/wishlist/:productId`    | user   | Remove from wishlist |
| GET    | `/cart`                   | user   | Server-persisted cart (optional) |
| POST   | `/cart`                   | user   | Upsert a cart line |
| DELETE | `/cart`                   | user   | Clear cart |
| GET    | `/reviews?product_id=`    | —      | Reviews for a product |
| POST   | `/reviews`                | user   | Leave a review |
| DELETE | `/reviews/:id`            | user   | Delete own review (or admin) |
| GET    | `/settings`               | —      | Public store settings |
| PUT    | `/settings`               | admin  | Update store settings |
| POST   | `/upload`                 | admin  | Upload a product image |

> The storefront UI only calls the subset it needs (`/auth/*`, `/products*`,
> `/orders*`, `/admin/stats`, plus the new `/categories`, `/users`,
> `/settings`, `/upload` used by the extended Admin panel). Wishlist, cart
> sync, and reviews are fully implemented and ready to wire into the UI
> whenever you want to extend the storefront.

## Local development

```bash
npm install
cp .env.example .env   # then fill in real values (see below)
npm run dev             # node --watch server.js — restarts on file changes
```

Or for a plain one-shot run:

```bash
npm start                # node server.js
```

The server listens on `process.env.PORT || 3000`, so it's available at
`http://localhost:3000` by default.

## Deployment (Railway + Turso)

1. **Create a Turso database** — [turso.tech](https://turso.tech) → create
   database → grab the `libsql://...` URL and an auth token.
2. **Push this repo to GitHub.**
3. **Create a new Railway project** → *Deploy from GitHub repo* → select
   this repo. Railway detects `package.json` (via Nixpacks) and uses
   `npm start` automatically — `railway.json` and `Procfile` pin this
   explicitly too, so nothing needs to be configured by hand.
4. In the Railway service's **Variables** tab, add:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET` — any long random string
   - `NODE_ENV=production` — Railway doesn't set this for you, and the
     app uses it to decide whether to mark the auth cookie `Secure`
5. **Deploy.** Railway assigns `PORT` automatically at runtime; `server.js`
   already reads it via `process.env.PORT || 3000`. Tables are created
   automatically on first request — no migration step to run.
6. Open the generated `*.up.railway.app` domain, register — the first
   account becomes admin — and go to **Admin** in the nav.

Optional: create a Blob store at [vercel.com/storage/blob](https://vercel.com/storage/blob)
and add `BLOB_READ_WRITE_TOKEN` for durable image uploads instead of inline
data URIs — it's a plain HTTP API, so it works from Railway (or anywhere
else) just as well as it did from Vercel.

See `.env.example` for the full list of variables.

### How the server is structured for Railway

Railway (like most non-Vercel hosts) runs a single persistent process
rather than invoking one function per request, so this project needed an
always-on HTTP server and a `start` script — neither of which exists in a
pure Vercel Serverless Functions layout. `server.js` provides both:

- It walks `api/` at boot and mounts every handler at the same URL it had
  on Vercel (see "How routing works now" above), so **every existing
  endpoint — auth, products, categories, orders, admin, users, wishlist,
  cart, reviews, settings, upload — keeps working unchanged.**
- It serves `public/` as static files and falls back to `public/index.html`
  for any non-API GET request, so client-side navigation/deep-links still
  resolve correctly (equivalent to the old `vercel.json` rewrites).
- It binds to `process.env.PORT || 3000`, which is what Railway (and
  `npm start`/`npm run dev` locally) expect.

