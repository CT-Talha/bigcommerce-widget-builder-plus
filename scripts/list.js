/**
 * List all widget templates from BigCommerce store.
 *
 * Usage (via CLI):
 *   npm run bc-widget -- list
 *
 * Usage (standalone):
 *   node scripts/list.js
 *
 * Also exports fetchTemplates() for reuse in download.js
 */

import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';

const __filename = fileURLToPath(import.meta.url);

// ── Fetch all templates (paginated) ─────────────────────────────────────────
export async function fetchTemplates() {
  await loadEnv();

  const STORE_HASH = process.env.BC_STORE_HASH;
  const ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;

  if (!STORE_HASH || !ACCESS_TOKEN) {
    console.error('\n  ERROR: BC_STORE_HASH and BC_ACCESS_TOKEN must be set in .env\n');
    process.exit(1);
  }

  const BASE_URL = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/content`;
  const HEADERS = {
    'X-Auth-Token': ACCESS_TOKEN,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const templates = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${BASE_URL}/widget-templates?page=${page}&limit=50`, {
      headers: HEADERS,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`\n  API error ${res.status}: ${body}\n`);
      process.exit(1);
    }

    const json = await res.json();
    templates.push(...(json.data ?? []));

    const meta = json.meta?.pagination ?? {};
    if (page >= (meta.total_pages ?? 1)) break;
    page++;
  }

  return templates;
}

// ── Print table ───────────────────────────────────────────────────────────────
export function printTable(templates) {
  if (!templates.length) {
    console.log('\n  No widget templates found in this store.\n');
    return;
  }

  // Column widths
  const maxName = Math.max(4, ...templates.map(t => t.name.length));
  const nameW = Math.min(maxName, 40);
  const uuidW = 36;
  const numW  = String(templates.length).length;

  const pad = (str, len) => String(str ?? '').slice(0, len).padEnd(len);
  const line = `  ${'─'.repeat(numW + 2)}┼${'─'.repeat(nameW + 2)}┼${'─'.repeat(uuidW + 2)}`;

  console.log(`\n  Found ${templates.length} widget template${templates.length === 1 ? '' : 's'}:\n`);
  console.log(`  ${'#'.padEnd(numW)}  ${'Name'.padEnd(nameW)}  ${'UUID'}`);
  console.log(line);

  templates.forEach((t, i) => {
    const num  = String(i + 1).padEnd(numW);
    const name = pad(t.name, nameW);
    console.log(`  ${num}  ${name}  ${t.uuid}`);
  });

  console.log(`\n  Download one:  npm run bc-widget -- download "<name>"`);
  console.log(`  Download one:  npm run bc-widget -- download <number>`);
  console.log(`  Download all:  npm run bc-widget -- download --all\n`);
}

// ── Standalone ───────────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  const templates = await fetchTemplates();
  printTable(templates);
}
