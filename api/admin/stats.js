import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';

export default route(
  {
    async GET(req, res) {
      const db = getDb();
      const [orders, revenue, products, users, recent] = await Promise.all([
        db.execute('SELECT COUNT(*) as c FROM orders'),
        db.execute("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status != 'cancelled'"),
        db.execute('SELECT COUNT(*) as c FROM products'),
        db.execute('SELECT COUNT(*) as c FROM users'),
        db.execute(
          `SELECT o.*, u.name as user_name FROM orders o
           JOIN users u ON o.user_id = u.id
           ORDER BY o.created_at DESC LIMIT 5`
        ),
      ]);

      ok(res, {
        totalOrders: orders.rows[0].c,
        totalRevenue: revenue.rows[0].s,
        totalProducts: products.rows[0].c,
        totalUsers: users.rows[0].c,
        recentOrders: recent.rows,
      });
    },
  },
  { admin: true }
);
