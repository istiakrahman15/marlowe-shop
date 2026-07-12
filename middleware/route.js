import { initDb } from '../lib/db.js';
import { getUser } from '../lib/auth.js';
import { HttpError } from '../lib/validate.js';
import { applyCors, applySecurityHeaders, checkRateLimit, getClientIp } from './security.js';

function send(res, status, body) {
  res.status(status).json(body);
}

/**
 * Wraps a map of { GET, POST, PUT, PATCH, DELETE } handlers into a
 * single Vercel serverless function export. Handles:
 *   - CORS + security headers
 *   - OPTIONS preflight
 *   - database initialization (idempotent, cached per warm instance)
 *   - rate limiting
 *   - centralized error handling (no stack traces / internals leaked)
 *   - optional auth / admin requirement
 *
 * @param {Object} handlers - method -> async (req, res, ctx) => void
 * @param {Object} [opts]
 * @param {boolean} [opts.auth] - require a logged-in user for all methods
 * @param {boolean} [opts.admin] - require an admin user for all methods
 * @param {{limit:number, windowMs:number}} [opts.rateLimit]
 */
export function route(handlers, opts = {}) {
  return async function handler(req, res) {
    applyCors(req, res);
    applySecurityHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const fn = handlers[req.method];
    if (!fn) {
      return send(res, 405, { error: `Method ${req.method} not allowed` });
    }

    const rl = opts.rateLimit || { limit: 60, windowMs: 60_000 };
    const rlKey = `${req.url?.split('?')[0] || 'route'}:${getClientIp(req)}`;
    if (!checkRateLimit(rlKey, rl)) {
      return send(res, 429, { error: 'Too many requests. Please slow down and try again shortly.' });
    }

    try {
      await initDb();
    } catch (e) {
      console.error('Database initialization failed:', e);
      return send(res, 500, { error: 'Database is not configured correctly. Please contact the site owner.' });
    }

    let user = null;
    try {
      user = getUser(req);
    } catch {
      user = null;
    }

    if (opts.auth && !user) {
      return send(res, 401, { error: 'You must be signed in to do that.' });
    }
    if (opts.admin && (!user || user.role !== 'admin')) {
      return send(res, 403, { error: 'Admin access required.' });
    }

    try {
      await fn(req, res, { user });
    } catch (e) {
      if (e instanceof HttpError) {
        return send(res, e.status, { error: e.message });
      }
      console.error('Unhandled API error:', e);
      return send(res, 500, { error: 'Something went wrong. Please try again.' });
    }
  };
}

export function ok(res, data, status = 200) {
  res.status(status).json(data);
}
