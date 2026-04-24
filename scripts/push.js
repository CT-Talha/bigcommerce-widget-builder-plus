/**
 * Push a locally edited widget template back to BigCommerce.
 *
 * Usage:
 *   node scripts/push.js <widget-folder>
 *
 * Examples:
 *   node scripts/push.js widgets/my-cool-widget
 *   node scripts/push.js my-cool-widget          ← looks inside widgets/ automatically
 *
 * What it does:
 *   Reads widget.html, schema.json, and widget.yml from the folder,
 *   then sends a PUT request to update the existing template on the store.
 */

import fs from 'fs';
import path from 'path';
import { loadEnv } from './env.js';
import { validateSchema } from './validate.js';

await loadEnv();

const STORE_HASH = process.env.BC_STORE_HASH;
const ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;

if (!STORE_HASH || !ACCESS_TOKEN) {
  console.error('ERROR: BC_STORE_HASH and BC_ACCESS_TOKEN must be set in .env');
  process.exit(1);
}

const BASE_URL = `https://api.bigcommerce.com/stores/${STORE_HASH}/v3/content`;
const HEADERS = {
  'X-Auth-Token': ACCESS_TOKEN,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// ---------------------------------------------------------------------------
// Resolve widget directory from CLI argument
// ---------------------------------------------------------------------------
function resolveWidgetDir(arg) {
  if (!arg) {
    console.error('Usage: node scripts/push.js <widget-folder>');
    console.error('Example: node scripts/push.js widgets/my-cool-widget');
    process.exit(1);
  }

  const cwd = process.cwd();
  // Strip legacy "widgets/" prefix if someone passes it
  const stripped = arg.replace(/^widgets[\\/]/, '');

  // Widget folders live directly in the client folder
  const candidates = [
    path.resolve(cwd, stripped),
    path.resolve(cwd, arg),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  console.error(`\n  Error: Widget folder not found: ${arg}`);
  console.error('  Available widgets:');
  for (const entry of fs.readdirSync(cwd)) {
    const full = path.join(cwd, entry);
    if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'widget.yml'))) {
      console.error(`    ${entry}`);
    }
  }
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse widget.yml (minimal — no yaml library needed)
// ---------------------------------------------------------------------------
function parseWidgetYml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const val = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Read widget files
// ---------------------------------------------------------------------------
function readWidget(widgetDir) {
  const ymlPath = path.join(widgetDir, 'widget.yml');
  const htmlPath = path.join(widgetDir, 'widget.html');
  const schemaPath = path.join(widgetDir, 'schema.json');

  for (const [label, p] of [['widget.yml', ymlPath], ['widget.html', htmlPath], ['schema.json', schemaPath]]) {
    if (!fs.existsSync(p)) {
      console.error(`ERROR: Missing required file: ${label} in ${widgetDir}`);
      process.exit(1);
    }
  }

  const yml = parseWidgetYml(fs.readFileSync(ymlPath, 'utf8'));
  const template = fs.readFileSync(htmlPath, 'utf8');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  // template_uuid is empty for brand-new widgets created with create.js
  // push.js will POST to create them and write the UUID back to widget.yml
  return { name: yml.name, uuid: yml.template_uuid || '', template, schema, ymlPath };
}

// ---------------------------------------------------------------------------
// Push to BigCommerce — POST (new) or PUT (existing)
// ---------------------------------------------------------------------------
// If no UUID in widget.yml, search BC for an existing template with the same
// name — prevents creating duplicates when widget.yml was cleared or lost.
// ---------------------------------------------------------------------------
async function findExistingUuid(name) {
  let page = 1;
  while (true) {
    const res = await fetch(`${BASE_URL}/widget-templates?page=${page}&limit=50`, { headers: HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    const match = (json.data ?? []).find(t => t.name === name);
    if (match) return match.uuid;
    const meta = json.meta?.pagination ?? {};
    if (page >= (meta.total_pages ?? 1)) break;
    page++;
  }
  return null;
}

// ---------------------------------------------------------------------------
async function pushWidget(widget) {
  let { uuid } = widget;

  // No local UUID — check BC for an existing widget with the same name
  // to avoid creating a duplicate on repeated pushes
  if (!uuid) {
    const existing = await findExistingUuid(widget.name);
    if (existing) {
      console.log(`  ⚠  No UUID in widget.yml but found existing widget on BC — updating instead of creating duplicate.`);
      uuid = existing;
    }
  }

  const isNew = !uuid;
  const url = isNew
    ? `${BASE_URL}/widget-templates`
    : `${BASE_URL}/widget-templates/${uuid}`;

  const body = {
    name: widget.name,
    template: widget.template,
    schema: widget.schema,
  };

  const res = await fetch(url, {
    method: isNew ? 'POST' : 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(`API error ${res.status}:`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  return { data: json.data, isNew };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const arg = process.argv[2];
  const widgetDir = resolveWidgetDir(arg);

  console.log(`Reading widget from: ${path.relative(process.cwd(), widgetDir)}\n`);
  const widget = readWidget(widgetDir);

  // ── Validate schema before touching BigCommerce ──────────────────────────
  process.stdout.write(`  Validating schema.json...`);
  const validation = validateSchema(widget.schema);
  if (!validation.ok) {
    console.log(' ✗\n');
    for (const e of validation.errors) {
      console.error(`  ✗  ${e.path}\n     ${e.message}\n`);
    }
    console.error(`  Push cancelled — fix the schema errors above and try again.\n`);
    process.exit(1);
  }
  if (validation.warnings.length) {
    console.log(` ⚠  (${validation.warnings.length} warning${validation.warnings.length > 1 ? 's' : ''})`);
    for (const w of validation.warnings) {
      console.warn(`  ⚠  ${w.path}\n     ${w.message}`);
    }
    console.log('');
  } else {
    console.log(' ✓');
  }

  console.log(`\nWidget  : ${widget.name}`);
  console.log(`UUID    : ${widget.uuid || '(new — will be assigned by BigCommerce)'}`);
  console.log(`\n${widget.uuid ? 'Updating' : 'Creating'} widget on BigCommerce...`);

  const { data: updated, isNew } = await pushWidget(widget);

  console.log(`\nSuccess! Widget ${isNew ? 'created' : 'updated'}.`);
  console.log(`  Name    : ${updated.name}`);
  console.log(`  UUID    : ${updated.uuid}`);
  console.log(`  Version : ${updated.version_uuid ?? 'n/a'}`);

  // Always write UUID + version back to widget.yml
  const newYml = [
    `name: "${updated.name}"`,
    `template_uuid: "${updated.uuid}"`,
    `version_uuid: "${updated.version_uuid ?? ''}"`,
  ].join('\n') + '\n';
  fs.writeFileSync(widget.ymlPath, newYml, 'utf8');
  console.log(`\nwidget.yml updated${isNew ? ' with new UUID' : ' with new version_uuid'}.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
