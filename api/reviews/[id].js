import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { HttpError } from '../../lib/validate.js';

export default route(
  {
    async DELETE(req, res, { user }) {
      const db = getDb();
      const { id } = req.query;
      const { rows } = await db.execute({ sql: 'SELECT * FROM reviews WHERE id = ?', args: [id] });
      const review = rows[0];
      if (!review) throw new HttpError(404, 'Review not found.');
      if (review.user_id !== user.id && user.role !== 'admin') {
        throw new HttpError(403, 'You can only delete your own reviews.');
      }
      await db.execute({ sql: 'DELETE FROM reviews WHERE id = ?', args: [id] });
      ok(res, { success: true });
    },
  },
  { auth: true }
);
