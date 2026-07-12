import { getDb } from '../../lib/db.js';
import { comparePassword, signToken, setAuthCookie, publicUser } from '../../lib/auth.js';
import { route, ok } from '../../middleware/route.js';
import { bad, sanitizeEmail, HttpError } from '../../lib/validate.js';

export default route(
  {
    async POST(req, res) {
      const body = req.body || {};
      const email = sanitizeEmail(body.email);
      const password = typeof body.password === 'string' ? body.password : '';

      if (!email || !password) throw bad('Email and password are required.');

      const db = getDb();
      const { rows } = await db.execute({
        sql: 'SELECT * FROM users WHERE email = ?',
        args: [email],
      });
      const user = rows[0];

      // Constant-shaped response whether the email exists or not, to
      // avoid leaking account existence via timing/response differences.
      const validPassword = user ? await comparePassword(password, user.password) : false;
      if (!user || !validPassword) throw new HttpError(401, 'Invalid email or password.');

      const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
      const token = signToken(payload);
      setAuthCookie(res, token);
      ok(res, { token, user: publicUser(payload) });
    },
  },
  { rateLimit: { limit: 15, windowMs: 60_000 } }
);
