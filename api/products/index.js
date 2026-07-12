import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isNonEmptyString, isPositiveNumber, isPositiveInt, sanitizeText, HttpError } from '../../lib/validate.js';

const PRODUCT_SELECT = `
  SELECT p.*, c.name as category_name, c.slug as category_slug
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
`;

export default route({
  async GET(req, res) {
    const db = getDb();
    const { search, category, sort } = req.query;

    let sql = `${PRODUCT_SELECT} WHERE 1=1`;
    const args = [];

    if (search) {
      const term = `%${String(search).slice(0, 100)}%`;
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      args.push(term, term);
    }
    if (category) {
      sql += ' AND c.slug = ?';
      args.push(String(category).slice(0, 100));
    }
    if (sort === 'price_asc') sql += ' ORDER BY p.price ASC';
    else if (sort === 'price_desc') sql += ' ORDER BY p.price DESC';
    else sql += ' ORDER BY p.created_at DESC';

    const { rows } = await db.execute({ sql, args });
    ok(res, rows);
  },

  async POST(req, res, { user }) {
    if (!user) throw new HttpError(401, 'You must be signed in to do that.');
    if (user.role !== 'admin') throw new HttpError(403, 'Admin access required.');
    const db = getDb();
    const body = req.body || {};

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

    const id = newId();
    await db.execute({
      sql: 'INSERT INTO products (id, name, description, price, stock, category_id, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, description, Number(body.price), Number(stock), categoryId, image],
    });

    const { rows } = await db.execute({ sql: `${PRODUCT_SELECT} WHERE p.id = ?`, args: [id] });
    ok(res, rows[0], 201);
  },
});
