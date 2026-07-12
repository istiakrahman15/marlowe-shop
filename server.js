/**
 * Marlowe — production HTTP server (Railway-compatible)
 * ------------------------------------------------------
 * This replaces Vercel's implicit "one file = one serverless function"
 * runtime with a single, always-on Express process, which is what
 * Railway (and most non-Vercel hosts) expect: a long-running server
 * that binds to process.env.PORT.
 *
 * Nothing about the application logic changes:
 *   - Every handler in api/**\/*.js is still a plain
 *       export default route({ GET, POST, ... }, opts)
 *     function exactly as it was written for Vercel. route() (in
 *     middleware/route.js) already fully implements CORS, security
 *     headers, rate limiting, DB init, auth/admin guards and error
 *     handling — none of that was touched.
 *   - This file's only job is to discover every handler on disk and
 *     mount it at the same URL it had on Vercel, then serve public/
 *     and fall back to index.html for client-side routes.
 *
 * Vercel's file-based routing turned api/users/[id].js into a route
 * where the dynamic segment arrived as req.query.id. Every existing
 * handler was written against that contract (`const { id } = req.query`).
 * To avoid touching a single line of handler code, the route loader
 * below maps [id] segments to Express :id params, and a thin piece of
 * middleware copies req.params back onto req.query before the handler
 * runs — so req.query.id keeps working exactly as it did on Vercel.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_DIR = path.join(__dirname, 'api');
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();

// Railway (and most PaaS providers) terminate TLS at a reverse proxy in
// front of the app, then forward plain HTTP with X-Forwarded-* headers.
// Trusting the proxy lets Express/cookie logic correctly detect HTTPS.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// JSON body parsing for every route. The limit is raised above the
// default 100kb because api/upload and the product image field accept
// base64 data-URI images (up to ~4MB binary => ~5.4MB base64) inline in
// the JSON body — identical to how it worked as a Vercel function.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

/**
 * Recursively lists every .js file under `dir`, returning paths relative
 * to `dir` using forward slashes (regardless of OS).
 */
function listApiFiles(dir, baseRel = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files = files.concat(listApiFiles(abs, rel));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Converts a Vercel-style api/ file path into an Express route path,
 * preserving the exact same public URL the file had on Vercel:
 *   auth/login.js        -> /api/auth/login
 *   products/index.js    -> /api/products
 *   products/[id].js     -> /api/products/:id
 *   users/[id].js        -> /api/users/:id
 */
function toRoutePath(relFilePath) {
  const withoutExt = relFilePath.replace(/\.js$/, '');
  let segments = withoutExt.split('/').map((segment) => {
    const dynamicMatch = /^\[(.+)\]$/.exec(segment);
    return dynamicMatch ? `:${dynamicMatch[1]}` : segment;
  });
  if (segments[segments.length - 1] === 'index') {
    segments = segments.slice(0, -1);
  }
  const routePath = `/api/${segments.join('/')}`.replace(/\/+$/, '');
  return routePath === '' ? '/api' : routePath;
}

/**
 * Loads every api/**\/*.js handler and mounts it on `app` at the same
 * path it served on Vercel. Literal (non-dynamic) routes are mounted
 * before dynamic ones so that, e.g., /api/orders/admin is matched before
 * the catch-all /api/orders/:id — otherwise Express would treat "admin"
 * as the :id value, which is also exactly how Vercel's own router
 * prioritizes static segments over dynamic ones.
 */
async function mountApiRoutes() {
  const relFiles = listApiFiles(API_DIR);

  const loaded = [];
  for (const relFile of relFiles) {
    const routePath = toRoutePath(relFile);
    const moduleUrl = pathToFileURL(path.join(API_DIR, relFile)).href;
    const mod = await import(moduleUrl);
    const handler = mod.default;
    if (typeof handler !== 'function') {
      console.warn(`[server] Skipping api/${relFile}: no default export function.`);
      continue;
    }
    loaded.push({ relFile, routePath, handler });
  }

  loaded.sort((a, b) => {
    const aDynamic = a.routePath.includes('/:') ? 1 : 0;
    const bDynamic = b.routePath.includes('/:') ? 1 : 0;
    return aDynamic - bDynamic;
  });

  for (const { relFile, routePath, handler } of loaded) {
    app.all(routePath, (req, res, next) => {
      if (req.params && Object.keys(req.params).length) {
        // Preserve Vercel's contract: dynamic path segments arrive on
        // req.query (e.g. `const { id } = req.query` in api/products/[id].js).
        //
        // Express defines `req.query` as a getter-only accessor (it
        // re-parses the URL's query string on every read), so a plain
        // `req.query = {...}` throws under ESM's strict mode. Instead we
        // replace the accessor with a plain data property containing the
        // merged values, scoped to this single request object.
        const mergedQuery = { ...req.query, ...req.params };
        Object.defineProperty(req, 'query', {
          value: mergedQuery,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      Promise.resolve(handler(req, res)).catch(next);
    });
    console.log(`[server] Mounted api/${relFile} -> ${routePath}`);
  }
}

await mountApiRoutes();

// Static frontend (unchanged UI, served exactly as public/ was on Vercel).
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// SPA fallback: any GET that isn't an API route or a real static file
// serves index.html so client-side routing/deep-links keep working.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// 404 for unmatched /api/* requests (method not found on a known path
// is already handled inside route() itself with a 405).
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralized error handler — never leak internals/stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Marlowe server listening on port ${PORT}`);
});
