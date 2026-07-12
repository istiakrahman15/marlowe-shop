import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isPositiveInt } from '../../lib/validate.js';

export default route(
  {
    async GET(req, res, { user }) {
      const db = getDb();
      const { rows } = await db.execute({
        sql: `SELECT c.product_id, c.quantity, p.name, p.price, p.stock, p.image
              FROM cart c JOIN products p ON c.product_id = p.id
              WHERE c.user_id = ? ORDER BY c.updated_at DESC`,
        args: [user.id],
      });
      ok(res, rows);
    },

    async POST(req, res, { user }) {
      const db = getDb();
      const { product_id, quantity } = req.body || {};
      if (!product_id) throw bad('product_id is required.');
      if (!isPositiveInt(quantity) || quantity < 1) throw bad('quantity must be a positive whole number.');

      const { rows: product } = await db.execute({ sql: 'SELECT id, stock FROM products WHERE id = ?', args: [product_id] });
      if (!product.length) throw bad('Product not found.');
      const qty = Math.min(quantity, product[0].stock);

      await db.execute({
        sql: `INSERT INTO cart (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity, updated_at = datetime('now')`,
        args: [newId(), user.id, product_id, qty],
      });
      ok(res, { success: true });
    },

    async DELETE(req, res, { user }) {
      const db = getDb();
      await db.execute({ sql: 'DELETE FROM cart WHERE user_id = ?', args: [user.id] });
      ok(res, { success: true });
    },
  },
  { auth: true }
);
