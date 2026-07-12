import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isNonEmptyString, sanitizeText, slugify, HttpError } from '../../lib/validate.js';

export default route({
  async GET(req, res) {
    const db = getDb();
    const { rows } = await db.execute('SELECT * FROM categories ORDER BY name');
    ok(res, rows);
  },

  async POST(req, res, { user }) {
    if (!user) throw new HttpError(401, 'You must be signed in to do that.');
    if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');

    const db = getDb();
    const body = req.body || {};
    const name = sanitizeText(body.name, 100);
    if (!isNonEmptyString(name, 100)) throw bad('Category name is required.');

    let slug = slugify(body.slug && isNonEmptyString(body.slug, 100) ? body.slug : name);
    if (!slug) throw bad('Could not derive a valid slug from that name.');

    const { rows: dupe } = await db.execute({ sql: 'SELECT id FROM categories WHERE slug = ?', args: [slug] });
    if (dupe.length) throw bad('A category with that slug already exists.');

    const id = newId();
    await db.execute({
      sql: 'INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)',
      args: [id, name, slug],
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
    ok(res, rows[0], 201);
  },
});
