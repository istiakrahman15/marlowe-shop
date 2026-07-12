export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function bad(message) {
  return new HttpError(400, message);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
}

export function isNonEmptyString(value, maxLen = 500) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

export function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

export function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

/**
 * Strips angle brackets / script-relevant characters from free-text
 * input so stored strings can never be interpreted as HTML/JS when
 * rendered back into the page. Trims and caps length as a side effect.
 */
export function sanitizeText(value, maxLen = 2000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
}

export function requireFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      throw bad(`Field "${f}" is required`);
    }
  }
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
