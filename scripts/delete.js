/**
 * Delete a widget template from BigCommerce.
 *
 * Usage (via CLI):
 *   npx bcw delete widgets/my-banner
 *
 * Usage (standalone):
 *   node scripts/delete.js widgets/my-banner
 *
 * Reads the UUID from widget.yml and sends DELETE to the BC API.
 * Does NOT delete the local folder — only removes it from the store.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);

await loadEnv();

const STORE_HASH   = process.env.BC_STORE_HASH;
const ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;
const BASE_URL     = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/content`;
const HEADERS      = { 'X-Auth-Token': ACCESS_TOKEN, Accept: 'application/json' };

// ── Resolve widget directory ─────────────────────────────────────────────────
function resolveWidgetDir(arg) {
  if (!arg) {
    console.error('\n  Usage: npx bcw delete widgets/<widget-folder>\n');
    process.exit(1);
  }
  const candidates = [
    path.resolve(process.cwd(), arg),
    path.resolve(process.cwd(), 'widgets', arg),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  console.error(`\n  Error: Widget folder not found: ${arg}\n`);
  process.exit(1);
}

// ── Parse widget.yml ─────────────────────────────────────────────────────────
function parseYml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf(':');
    if (eq === -1) continue;
    result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const arg       = process.argv[2];
const widgetDir = resolveWidgetDir(arg);
const ymlPath   = path.join(widgetDir, 'widget.yml');

if (!fs.existsSync(ymlPath)) {
  console.error('\n  Error: widget.yml not found in', widgetDir, '\n');
  process.exit(1);
}

const yml  = parseYml(fs.readFileSync(ymlPath, 'utf8'));
const uuid = yml.template_uuid;
const name = yml.name ?? path.basename(widgetDir);

if (!uuid) {
  console.error('\n  Error: widget.yml has no template_uuid — was this widget ever pushed to BigCommerce?\n');
  process.exit(1);
}

console.log(`\n  Widget : ${name}`);
console.log(`  UUID   : ${uuid}`);

// ── Confirm before deleting ──────────────────────────────────────────────────
const { createInterface } = await import('node:readline/promises');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`\n  Are you sure you want to delete this widget from BigCommerce? (yes/no): `)).trim().toLowerCase();
rl.close();

if (answer !== 'yes' && answer !== 'y') {
  console.log('\n  Cancelled. Widget was not deleted.\n');
  process.exit(0);
}

console.log(`\n  Deleting from BigCommerce...`);

const res = await fetch(`${BASE_URL}/widget-templates/${uuid}`, {
  method: 'DELETE',
  headers: HEADERS,
});

if (res.status === 204 || res.ok) {
  // 204 No Content is the success response for DELETE
  console.log(`\n  ✓  Widget deleted from BigCommerce.`);
  console.log(`  The local folder (${path.relative(process.cwd(), widgetDir)}) was NOT removed.\n`);
} else {
  const body = await res.json().catch(() => ({}));
  console.error(`\n  API error ${res.status}:`);
  console.error(' ', JSON.stringify(body, null, 2), '\n');
  process.exit(1);
}
