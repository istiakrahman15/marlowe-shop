import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad } from '../../lib/validate.js';

export default route(
  {
    async GET(req, res, { user }) {
      const db = getDb();
      const { rows } = await db.execute({
        sql: `SELECT w.id as wishlist_id, w.created_at as added_at, p.*
              FROM wishlist w JOIN products p ON w.product_id = p.id
              WHERE w.user_id = ? ORDER BY w.created_at DESC`,
        args: [user.id],
      });
      ok(res, rows);
    },

    async POST(req, res, { user }) {
      const db = getDb();
      const { product_id } = req.body || {};
      if (!product_id) throw bad('product_id is required.');

      const { rows: product } = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [product_id] });
      if (!product.length) throw bad('Product not found.');

      await db.execute({
        sql: 'INSERT OR IGNORE INTO wishlist (id, user_id, product_id) VALUES (?, ?, ?)',
        args: [newId(), user.id, product_id],
      });
      ok(res, { success: true }, 201);
    },
  },
  { auth: true }
);
