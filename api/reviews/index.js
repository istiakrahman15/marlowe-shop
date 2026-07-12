import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad, sanitizeText, HttpError } from '../../lib/validate.js';

export default route({
  async GET(req, res) {
    const db = getDb();
    const { product_id } = req.query;
    if (!product_id) throw bad('product_id query parameter is required.');
    const { rows } = await db.execute({
      sql: `SELECT r.*, u.name as user_name FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ? ORDER BY r.created_at DESC`,
      args: [product_id],
    });
    ok(res, rows);
  },

  async POST(req, res, { user }) {
    if (!user) throw new HttpError(401, 'You must be signed in to leave a review.');
    const db = getDb();
    const { product_id, rating, comment } = req.body || {};
    const r = Number(rating);

    if (!product_id) throw bad('product_id is required.');
    if (!Number.isInteger(r) || r < 1 || r > 5) throw bad('Rating must be a whole number from 1 to 5.');

    const { rows: product } = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [product_id] });
    if (!product.length) throw bad('Product not found.');

    const id = newId();
    await db.execute({
      sql: 'INSERT INTO reviews (id, product_id, user_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      args: [id, product_id, user.id, r, sanitizeText(comment || '', 1000)],
    });
    ok(res, { success: true, id }, 201);
  },
});
