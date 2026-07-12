/**
 * Security headers + CORS + a lightweight in-memory rate limiter.
 *
 * The rate limiter is best-effort: it lives in the memory of a single
 * warm serverless instance and resets on cold start / across regions.
 * That's an intentional trade-off for a zero-infrastructure Vercel
 * deployment — it still meaningfully slows down brute-force / scripted
 * abuse against auth and write endpoints without requiring an external
 * store (e.g. Redis) that the person hasn't provisioned.
 */

const buckets = new Map();
const MAX_BUCKETS = 5000; // hard cap so memory can't grow unbounded

function pruneBuckets() {
  if (buckets.size <= MAX_BUCKETS) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Returns true if the request is allowed, false if it should be
 * rejected with 429. `key` should combine route + client identity.
 */
export function checkRateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  pruneBuckets();
  return bucket.count <= limit;
}

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // deprecated header; CSP is the real defense
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
