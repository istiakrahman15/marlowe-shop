import { route, ok } from '../../middleware/route.js';
import { newId } from '../../lib/id.js';
import { bad } from '../../lib/validate.js';

const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const [, mime, base64] = match;
  return { mime, base64, buffer: Buffer.from(base64, 'base64') };
}

export default route(
  {
    async POST(req, res) {
      const { image, filename } = req.body || {};
      if (!image) throw bad('No image provided.');

      const parsed = parseDataUrl(image);
      if (!parsed) throw bad('Image must be a base64 data URI (e.g. from a file input).');
      if (!ALLOWED_TYPES.has(parsed.mime)) throw bad('Only PNG, JPEG, WEBP or GIF images are allowed.');
      if (parsed.buffer.length > MAX_BYTES) throw bad('Image must be smaller than 4MB.');

      // Prefer durable object storage when the project has Vercel Blob
      // configured. Falls back to an inline data URI (stored directly on
      // the product row) so uploads work out of the box with zero extra
      // setup beyond the required Turso + JWT environment variables.
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const { put } = await import('@vercel/blob');
          const safeName = `products/${Date.now()}-${newId()}-${(filename || 'image').replace(/[^a-zA-Z0-9._-]/g, '')}`;
          const blob = await put(safeName, parsed.buffer, {
            access: 'public',
            contentType: parsed.mime,
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          return ok(res, { url: blob.url }, 201);
        } catch (e) {
          console.error('Vercel Blob upload failed, falling back to data URI:', e);
        }
      }

      ok(res, { url: image }, 201);
    },
  },
  { admin: true, rateLimit: { limit: 20, windowMs: 60_000 } }
);
