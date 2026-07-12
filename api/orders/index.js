import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isNonEmptyString, isPositiveInt, sanitizeText } from '../../lib/validate.js';

export default route(
  {
    async GET(req, res, { user }) {
      const db = getDb();
      const { rows: orders } = await db.execute({
        sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        args: [user.id],
      });

      for (const order of orders) {
        const { rows: items } = await db.execute({
          sql: `SELECT oi.*, p.name as product_name FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?`,
          args: [order.id],
        });
        order.items = items;
      }

      ok(res, orders);
    },

    async POST(req, res, { user }) {
      const db = getDb();
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      const name = sanitizeText(body.name, 200);
      const address = sanitizeText(body.address, 400);
      const city = sanitizeText(body.city, 200);

      if (!items.length) throw bad('Your cart is empty.');
      if (items.length > 100) throw bad('Too many items in a single order.');
      if (!isNonEmptyString(name, 200)) throw bad('Shipping name is required.');
      if (!isNonEmptyString(address, 400)) throw bad('Shipping address is required.');
      if (!isNonEmptyString(city, 200)) throw bad('Shipping city is required.');

      for (const item of items) {
        if (!item || typeof item.id !== 'string' || !isPositiveInt(item.qty) || item.qty < 1) {
          throw bad('Invalid item in cart.');
        }
      }

      // Resolve + validate stock for every line item against the
      // authoritative database record (never trust client-sent prices).
      let total = 0;
      const resolved = [];
      for (const item of items) {
        const { rows } = await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [item.id] });
        const product = rows[0];
        if (!product) throw bad('One of the products in your cart no longer exists.');
        if (product.stock < item.qty) throw bad(`Not enough stock for "${product.name}" (only ${product.stock} left).`);
        total += product.price * item.qty;
        resolved.push({ product, qty: item.qty });
      }

      const orderId = newId();
      await db.execute({
        sql: 'INSERT INTO orders (id, user_id, total, name, address, city) VALUES (?, ?, ?, ?, ?, ?)',
        args: [orderId, user.id, total, name, address, city],
      });

      for (const { product, qty } of resolved) {
        await db.execute({
          sql: 'INSERT INTO order_items (id, order_id, product_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
          args: [newId(), orderId, product.id, qty, product.price],
        });
        await db.execute({ sql: 'UPDATE products SET stock = stock - ? WHERE id = ?', args: [qty, product.id] });
      }

      // Best-effort cart cleanup if the user had a server-persisted cart.
      await db.execute({ sql: 'DELETE FROM cart WHERE user_id = ?', args: [user.id] });

      ok(res, { orderId, total }, 201);
    },
  },
  { auth: true, rateLimit: { limit: 30, windowMs: 60_000 } }
);
