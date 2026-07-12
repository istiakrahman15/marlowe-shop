import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { bad, HttpError } from '../../lib/validate.js';

const VALID_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default route(
  {
    async GET(req, res) {
      const db = getDb();
      const { rows } = await db.execute(
        `SELECT o.*, u.name as user_name, u.email as user_email
         FROM orders o JOIN users u ON o.user_id = u.id
         ORDER BY o.created_at DESC`
      );
      ok(res, rows);
    },

    async PUT(req, res) {
      const db = getDb();
      const { id } = req.query;
      if (!id) throw bad('Order id is required.');

      const { status } = req.body || {};
      if (!VALID_STATUSES.includes(status)) throw bad(`Status must be one of: ${VALID_STATUSES.join(', ')}.`);

      const { rows } = await db.execute({ sql: 'SELECT id FROM orders WHERE id = ?', args: [id] });
      if (!rows.length) throw new HttpError(404, 'Order not found.');

      await db.execute({
        sql: `UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [status, id],
      });
      ok(res, { success: true });
    },
  },
  { admin: true }
);
