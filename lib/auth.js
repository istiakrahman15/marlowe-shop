import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Add it in your Vercel project Environment Variables.'
    );
  }
  return secret;
}

const TOKEN_TTL = '7d';
const COOKIE_NAME = 'marlowe_token';

export function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      const key = decodeURIComponent(pair.slice(0, idx).trim());
      const val = decodeURIComponent(pair.slice(idx + 1).trim());
      return [key, val];
    })
  );
}

/**
 * Extracts and verifies the current user from either the
 * Authorization: Bearer <token> header or the httpOnly cookie.
 * Returns null (never throws) if there is no valid session.
 */
export function getUser(req) {
  try {
    const authHeader = req.headers.authorization || '';
    let token = null;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const cookies = parseCookies(req);
      token = cookies[COOKIE_NAME] || null;
    }
    if (!token) return null;
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
