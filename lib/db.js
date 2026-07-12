import { createClient } from '@libsql/client';
import { newId } from './id.js';

/**
 * Turso (libSQL) database client.
 * Cached across warm serverless invocations (per lambda instance).
 */
let _db = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(
      'TURSO_DATABASE_URL is not set. Add it in your Vercel project Environment Variables.'
    );
  }

  _db = createClient({ url, authToken });
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  total REAL NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wishlist (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS cart (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart(user_id);
`;

const DEFAULT_SETTINGS = {
  store_name: 'Marlowe',
  store_tagline: 'General Store',
  free_shipping_threshold: '50',
  currency: 'USD',
};

const DEMO_CATEGORIES = [
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Clothing', slug: 'clothing' },
  { name: 'Home & Kitchen', slug: 'home-kitchen' },
  { name: 'Books', slug: 'books' },
  { name: 'Sports', slug: 'sports' },
];

const DEMO_PRODUCTS = [
  ['Wireless Headphones', 'Premium noise-cancelling audio with 40hr battery.', 79.99, 25, 'electronics'],
  ['Mechanical Keyboard', 'Tactile RGB keyboard with Cherry MX switches.', 129.99, 15, 'electronics'],
  ['USB-C Hub 7-in-1', 'HDMI, USB-A, SD card and more.', 39.99, 50, 'electronics'],
  ['Classic White Tee', '100% organic cotton. Relaxed fit.', 24.99, 100, 'clothing'],
  ['Slim Chino Pants', 'Stretch-weave chinos in 6 neutral colors.', 54.99, 60, 'clothing'],
  ['Minimalist Watch', 'Stainless steel case, genuine leather strap.', 149.99, 20, 'clothing'],
  ['Pour-Over Coffee Kit', 'Chemex, gooseneck kettle, precision scale.', 89.99, 30, 'home-kitchen'],
  ['Bamboo Cutting Board', 'Extra-large, juice groove, dishwasher safe.', 34.99, 45, 'home-kitchen'],
  ['Design Thinking', 'A practical guide to human-centered problem solving.', 19.99, 80, 'books'],
  ['Yoga Mat Pro', '6mm thick non-slip with alignment lines.', 49.99, 35, 'sports'],
];

let _initPromise = null;

/**
 * Creates all tables (idempotent) and seeds default settings / demo
 * catalogue on first run. Cached per warm lambda instance so it only
 * executes once, but safe to call on every cold start.
 */
export function initDb() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const db = getDb();
    await db.executeMultiple(SCHEMA);
    await seedSettings(db);
    if (process.env.SEED_DEMO_DATA !== 'false') {
      await seedDemoCatalogue(db);
    }
  })().catch((e) => {
    // Allow retry on the next invocation instead of caching a rejected promise forever.
    _initPromise = null;
    throw e;
  });
  return _initPromise;
}

async function seedSettings(db) {
  const { rows } = await db.execute('SELECT COUNT(*) as c FROM settings');
  if (rows[0].c > 0) return;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      args: [key, value],
    });
  }
}

async function seedDemoCatalogue(db) {
  const { rows } = await db.execute('SELECT COUNT(*) as c FROM categories');
  if (rows[0].c > 0) return;

  const catIds = {};
  for (const c of DEMO_CATEGORIES) {
    const id = newId();
    catIds[c.slug] = id;
    await db.execute({
      sql: 'INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)',
      args: [id, c.name, c.slug],
    });
  }

  for (const [name, description, price, stock, slug] of DEMO_PRODUCTS) {
    await db.execute({
      sql: 'INSERT INTO products (id, name, description, price, stock, category_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [newId(), name, description, price, stock, catIds[slug]],
    });
  }
}
