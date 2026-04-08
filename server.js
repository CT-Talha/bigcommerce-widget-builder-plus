/**
 * BigCommerce Widget Customizations — Server
 *
 * Ultra-lean: serves static files + blind BC proxy.
 * Credentials are NEVER stored, logged, or persisted.
 * Every request is fire-and-forget — nothing touches disk or RAM between requests.
 *
 * Start: node server.js
 * Open:  http://localhost:3000
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env (only needed for PORT, nothing sensitive)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// POST /api/bc-proxy
//
// Blind proxy to BigCommerce API.
// - Credentials come from the browser per-request
// - Nothing is stored, logged, or persisted on the server
// - Response is passed straight back to the browser
// ---------------------------------------------------------------------------
app.post('/api/bc-proxy', async (req, res) => {
  const { storeHash, accessToken, bcPath, method = 'GET', body } = req.body;

  if (!storeHash || !accessToken || !bcPath) {
    return res.status(400).json({ error: 'Missing storeHash, accessToken or bcPath.' });
  }

  // Only allow BigCommerce content API paths — prevents misuse as open proxy
  if (!bcPath.startsWith('/widget-templates')) {
    return res.status(403).json({ error: 'Only /widget-templates paths are allowed.' });
  }

  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/content${bcPath}`;

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        'X-Auth-Token': accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await upstream.json().catch(() => ({}));
    // Forward exact status so frontend can handle 401/403/404 properly
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `Could not reach BigCommerce: ${err.message}` });
  }
});

// ---------------------------------------------------------------------------
// GET /api/scripts/:name
// Serves download.js and push.js so the browser can include them in the ZIP.
// ---------------------------------------------------------------------------
app.get('/api/scripts/:name', (req, res) => {
  const allowed = ['download.js', 'push.js'];
  if (!allowed.includes(req.params.name)) return res.status(404).end();
  res.setHeader('Content-Type', 'text/plain');
  res.sendFile(path.join(__dirname, 'scripts', req.params.name));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  BigCommerce Widget Customizations`);
  console.log(`  Running at http://localhost:${PORT}`);
  console.log(`  Credentials: never stored — blind proxy mode\n`);
});
