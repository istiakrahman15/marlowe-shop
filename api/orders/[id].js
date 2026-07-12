import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { HttpError } from '../../lib/validate.js';

export default route(
  {
    async GET(req, res, { user }) {
      const db = getDb();
      const { id } = req.query;
      const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [id] });
      const order = rows[0];
      if (!order) throw new HttpError(404, 'Order not found.');
      if (order.user_id !== user.id && user.role !== 'admin') {
        throw new HttpError(403, 'You do not have access to this order.');
      }
      const { rows: items } = await db.execute({
        sql: `SELECT oi.*, p.name as product_name FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = ?`,
        args: [id],
      });
      order.items = items;
      ok(res, order);
    },
  },
  { auth: true }
);
