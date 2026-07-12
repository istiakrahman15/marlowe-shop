import { getDb } from '../../lib/db.js';
import { publicUser } from '../../lib/auth.js';
import { route, ok } from '../../middleware/route.js';
import { HttpError } from '../../lib/validate.js';

export default route(
  {
    async GET(req, res, { user }) {
      const db = getDb();
      const { rows } = await db.execute({
        sql: 'SELECT id, name, email, role FROM users WHERE id = ?',
        args: [user.id],
      });
      if (!rows.length) throw new HttpError(401, 'Session is no longer valid.');
      ok(res, { user: publicUser(rows[0]) });
    },
  },
  { auth: true }
);
