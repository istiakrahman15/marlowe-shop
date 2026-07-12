import { getDb } from '../../lib/db.js';
import { route, ok } from '../../middleware/route.js';
import { bad, HttpError } from '../../lib/validate.js';

async function countAdmins(db) {
  const { rows } = await db.execute("SELECT COUNT(*) as c FROM users WHERE role = 'admin'");
  return rows[0].c;
}

export default route(
  {
    async PUT(req, res, { user: currentUser }) {
      const db = getDb();
      const { id } = req.query;
      const { role } = req.body || {};
      if (!['user', 'admin'].includes(role)) throw bad('Role must be "user" or "admin".');

      const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      const target = rows[0];
      if (!target) throw new HttpError(404, 'User not found.');

      if (target.role === 'admin' && role === 'user' && id === currentUser.id) {
        const admins = await countAdmins(db);
        if (admins <= 1) throw bad('You are the only admin — promote someone else before demoting yourself.');
      }

      await db.execute({
        sql: `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [role, id],
      });
      const { rows: updated } = await db.execute({
        sql: 'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
        args: [id],
      });
      ok(res, updated[0]);
    },

    async DELETE(req, res, { user: currentUser }) {
      const db = getDb();
      const { id } = req.query;

      const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
      const target = rows[0];
      if (!target) throw new HttpError(404, 'User not found.');

      if (id === currentUser.id) throw bad('You cannot delete your own account while signed in.');
      if (target.role === 'admin') {
        const admins = await countAdmins(db);
        if (admins <= 1) throw bad('Cannot delete the only remaining admin.');
      }

      await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
      ok(res, { success: true });
    },
  },
  { admin: true }
);
