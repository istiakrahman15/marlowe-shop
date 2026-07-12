import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isNonEmptyString, sanitizeText, slugify, HttpError } from '../../lib/validate.js';

function requireAdmin(user) {
  if (!user) throw new HttpError(401, 'You must be signed in to do that.');
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
}

export default route({
  async PUT(req, res, { user }) {
    requireAdmin(user);
    const db = getDb();
    const { id } = req.query;
    const body = req.body || {};

    const { rows: existing } = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
    if (!existing.length) throw new HttpError(404, 'Category not found.');

    const name = sanitizeText(body.name, 100);
    if (!isNonEmptyString(name, 100)) throw bad('Category name is required.');
    let slug = slugify(body.slug && isNonEmptyString(body.slug, 100) ? body.slug : name);
    if (!slug) throw bad('Could not derive a valid slug from that name.');

    const { rows: dupe } = await db.execute({
      sql: 'SELECT id FROM categories WHERE slug = ? AND id != ?',
      args: [slug, id],
    });
    if (dupe.length) throw bad('A category with that slug already exists.');

    await db.execute({ sql: 'UPDATE categories SET name=?, slug=? WHERE id=?', args: [name, slug, id] });
    const { rows } = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
    ok(res, rows[0]);
  },

  async DELETE(req, res, { user }) {
    requireAdmin(user);
    const db = getDb();
    const { id } = req.query;
    const { rows } = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [id] });
    if (!rows.length) throw new HttpError(404, 'Category not found.');
    await db.execute({ sql: 'UPDATE products SET category_id = NULL WHERE category_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] });
    ok(res, { success: true });
  },
});
