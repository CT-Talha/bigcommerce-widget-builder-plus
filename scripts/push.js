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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env file not found.');
    console.error('Copy .env.example to .env and fill in your credentials.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').trim();
  }
}

loadEnv();

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

  // Try the path as-is first, then prepend widgets/
  const candidates = [
    path.resolve(process.cwd(), arg),
    path.resolve(process.cwd(), 'widgets', arg),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  console.error(`ERROR: Widget folder not found: ${arg}`);
  console.error('Available widgets:');
  const widgetsDir = path.resolve(process.cwd(), 'widgets');
  if (fs.existsSync(widgetsDir)) {
    for (const name of fs.readdirSync(widgetsDir)) {
      console.error(`  widgets/${name}`);
    }
  }
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
  if (!yml.template_uuid) {
    console.error('ERROR: widget.yml is missing template_uuid. Was this widget downloaded with download.js?');
    process.exit(1);
  }

  const template = fs.readFileSync(htmlPath, 'utf8');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  return { name: yml.name, uuid: yml.template_uuid, template, schema };
}

// ---------------------------------------------------------------------------
// Push to BigCommerce
// ---------------------------------------------------------------------------
async function pushWidget(widget) {
  const url = `${BASE_URL}/widget-templates/${widget.uuid}`;

  const body = {
    name: widget.name,
    template: widget.template,
    schema: widget.schema,
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error(`API error ${res.status}:`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const arg = process.argv[2];
  const widgetDir = resolveWidgetDir(arg);

  console.log(`Reading widget from: ${path.relative(process.cwd(), widgetDir)}\n`);
  const widget = readWidget(widgetDir);

  console.log(`Widget  : ${widget.name}`);
  console.log(`UUID    : ${widget.uuid}`);
  console.log(`\nPushing to BigCommerce...`);

  const updated = await pushWidget(widget);

  console.log(`\nSuccess! Template updated.`);
  console.log(`  Name    : ${updated.name}`);
  console.log(`  UUID    : ${updated.uuid}`);
  console.log(`  Version : ${updated.version_uuid ?? 'n/a'}`);

  // Update version_uuid in widget.yml if it changed
  const ymlPath = path.join(widgetDir, 'widget.yml');
  const newYml = [
    `name: "${updated.name}"`,
    `template_uuid: "${updated.uuid}"`,
    `version_uuid: "${updated.version_uuid ?? ''}"`,
  ].join('\n') + '\n';
  fs.writeFileSync(ymlPath, newYml, 'utf8');
  console.log(`\nwidget.yml updated with new version_uuid.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
