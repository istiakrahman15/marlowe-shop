import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';

export default route(
  {
    async GET(req, res) {
      const db = getDb();
      const { rows } = await db.execute(
        `SELECT u.id, u.name, u.email, u.role, u.created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count
         FROM users u ORDER BY u.created_at DESC`
      );
      ok(res, rows);
    },
  },
  { admin: true }
);
