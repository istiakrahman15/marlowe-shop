import { getDb } from '../../lib/db.js';
import { newId } from '../../lib/id.js';
import { hashPassword, signToken, setAuthCookie, publicUser } from '../../lib/auth.js';
import { route, ok } from '../../middleware/route.js';
import { bad, isEmail, isNonEmptyString, sanitizeEmail, sanitizeText } from '../../lib/validate.js';

export default route(
  {
    async POST(req, res) {
      const body = req.body || {};
      const name = sanitizeText(body.name, 100);
      const email = sanitizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';

      if (!isNonEmptyString(name, 100)) throw bad('Please enter your full name.');
      if (!isEmail(email)) throw bad('Please enter a valid email address.');
      if (password.length < 6) throw bad('Password must be at least 6 characters.');

      const db = getDb();
      const { rows: existing } = await db.execute({
        sql: 'SELECT id FROM users WHERE email = ?',
        args: [email],
      });
      if (existing.length) throw bad('An account with that email already exists.');

      const { rows: countRows } = await db.execute('SELECT COUNT(*) as c FROM users');
      const role = countRows[0].c === 0 ? 'admin' : 'user';

      const id = newId();
      const hash = await hashPassword(password);
      await db.execute({
        sql: 'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
        args: [id, name, email, hash, role],
      });

      const user = { id, name, email, role };
      const token = signToken(user);
      setAuthCookie(res, token);
      ok(res, { token, user: publicUser(user) }, 201);
    },
  },
  { rateLimit: { limit: 10, windowMs: 60_000 } }
);
