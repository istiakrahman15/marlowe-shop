import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';

export default route({
  async GET(req, res) {
    const db = getDb();
    const { rows } = await db.execute('SELECT * FROM categories ORDER BY name');
    ok(res, rows);
  },
});
