import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { bad, sanitizeText, HttpError } from '../../lib/validate.js';

const EDITABLE_KEYS = new Set(['store_name', 'store_tagline', 'free_shipping_threshold', 'currency']);

export default route({
  async GET(req, res) {
    const db = getDb();
    const { rows } = await db.execute('SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    ok(res, settings);
  },

  async PUT(req, res, { user }) {
    if (!user) throw new HttpError(401, 'You must be signed in to do that.');
    if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');

    const db = getDb();
    const body = req.body || {};
    const updates = Object.entries(body).filter(([key]) => EDITABLE_KEYS.has(key));
    if (!updates.length) throw bad('No valid settings provided.');

    for (const [key, value] of updates) {
      await db.execute({
        sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        args: [key, sanitizeText(String(value), 500)],
      });
    }

    const { rows } = await db.execute('SELECT key, value FROM settings');
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    ok(res, settings);
  },
});
