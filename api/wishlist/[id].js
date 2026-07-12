import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';

export default route(
  {
    async DELETE(req, res, { user }) {
      const db = getDb();
      const { id } = req.query; // product id
      await db.execute({
        sql: 'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
        args: [user.id, id],
      });
      ok(res, { success: true });
    },
  },
  { auth: true }
);
