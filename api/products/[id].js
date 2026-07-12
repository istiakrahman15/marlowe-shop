import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isNonEmptyString, isPositiveNumber, isPositiveInt, sanitizeText, HttpError } from '../../lib/validate.js';

const PRODUCT_SELECT = `
  SELECT p.*, c.name as category_name, c.slug as category_slug
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
`;

async function requireAdmin(user) {
  if (!user) throw new HttpError(401, 'You must be signed in to do that.');
  if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
}

export default route({
  async GET(req, res) {
    const db = getDb();
    const { id } = req.query;
    const { rows } = await db.execute({ sql: `${PRODUCT_SELECT} WHERE p.id = ?`, args: [id] });
    if (!rows.length) throw new HttpError(404, 'Product not found.');
    ok(res, rows[0]);
  },

  async PUT(req, res, { user }) {
    await requireAdmin(user);
    const db = getDb();
    const { id } = req.query;
    const body = req.body || {};

    const { rows: existingRows } = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [id] });
    if (!existingRows.length) throw new HttpError(404, 'Product not found.');

    const name = sanitizeText(body.name, 200);
    const description = sanitizeText(body.description, 2000);
    const image = isNonEmptyString(body.image, 2000) ? sanitizeText(body.image, 2000) : null;

    if (!isNonEmptyString(name, 200)) throw bad('Product name is required.');
    if (!isPositiveNumber(body.price)) throw bad('Price must be a positive number.');
    const stock = body.stock === undefined || body.stock === '' ? 0 : body.stock;
    if (!isPositiveInt(stock)) throw bad('Stock must be a whole number of 0 or more.');

    let categoryId = null;
    if (body.category_id) {
      const { rows } = await db.execute({ sql: 'SELECT id FROM categories WHERE id = ?', args: [body.category_id] });
      if (!rows.length) throw bad('Selected category does not exist.');
      categoryId = body.category_id;
    }

    await db.execute({
      sql: `UPDATE products SET name=?, description=?, price=?, stock=?, category_id=?, image=?, updated_at=datetime('now') WHERE id=?`,
      args: [name, description, Number(body.price), Number(stock), categoryId, image, id],
    });

    const { rows } = await db.execute({ sql: `${PRODUCT_SELECT} WHERE p.id = ?`, args: [id] });
    ok(res, rows[0]);
  },

  async DELETE(req, res, { user }) {
    await requireAdmin(user);
    const db = getDb();
    const { id } = req.query;
    const { rows } = await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [id] });
    if (!rows.length) throw new HttpError(404, 'Product not found.');
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });
    ok(res, { success: true });
  },
});
