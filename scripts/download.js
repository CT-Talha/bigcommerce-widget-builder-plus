/**
 * Download all widget templates from BigCommerce store
 * and write them as local Widget Builder projects.
 *
 * Usage:
 *   node scripts/download.js
 *
 * Output:
 *   widgets/<widget-name>/
 *     widget.html    — Handlebars template
 *     schema.json    — Page Builder UI schema
 *     config.json    — Default/test config values
 *     widget.yml     — Template UUID + name (used by push.js)
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Config — load from .env manually (no dotenv dependency needed)
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
// API helpers
// ---------------------------------------------------------------------------
async function fetchTemplates() {
  const templates = [];
  let page = 1;

  while (true) {
    const url = `${BASE_URL}/widget-templates?page=${page}&limit=50`;
    const res = await fetch(url, { headers: HEADERS });

    if (!res.ok) {
      const body = await res.text();
      console.error(`API error ${res.status}: ${body}`);
      process.exit(1);
    }

    const json = await res.json();
    const data = json.data ?? [];
    templates.push(...data);

    const meta = json.meta?.pagination ?? {};
    if (page >= (meta.total_pages ?? 1)) break;
    page++;
  }

  return templates;
}

// ---------------------------------------------------------------------------
// Slug helper — converts "My Cool Widget" → "my-cool-widget"
// ---------------------------------------------------------------------------
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Build a default config.json from the schema
// Walks the schema array and extracts default values.
// ---------------------------------------------------------------------------
function buildDefaultConfig(schema) {
  const config = {};
  if (!Array.isArray(schema)) return config;

  function extractDefaults(settings, target) {
    for (const setting of settings) {
      if (setting.settings) {
        extractDefaults(setting.settings, target);
      } else if (setting.id !== undefined) {
        target[setting.id] = setting.default ?? '';
      }
    }
  }

  for (const tab of schema) {
    if (tab.sections) {
      for (const section of tab.sections) {
        if (section.settings) {
          extractDefaults(section.settings, config);
        }
      }
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Write widget files to disk
// ---------------------------------------------------------------------------
function writeWidget(template, widgetsDir) {
  const slug = toSlug(template.name);
  const widgetDir = path.join(widgetsDir, slug);

  fs.mkdirSync(widgetDir, { recursive: true });

  // widget.html
  fs.writeFileSync(
    path.join(widgetDir, 'widget.html'),
    template.template ?? '',
    'utf8'
  );

  // schema.json
  const schema = template.schema ?? [];
  fs.writeFileSync(
    path.join(widgetDir, 'schema.json'),
    JSON.stringify(schema, null, 2),
    'utf8'
  );

  // config.json — default values derived from schema
  const config = buildDefaultConfig(schema);
  fs.writeFileSync(
    path.join(widgetDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  // widget.yml — stores UUID so push.js can update the right template
  const yml = [
    `name: "${template.name}"`,
    `template_uuid: "${template.uuid}"`,
    `version_uuid: "${template.version_uuid ?? ''}"`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(widgetDir, 'widget.yml'), yml, 'utf8');

  return widgetDir;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const widgetsDir = path.resolve(process.cwd(), 'widgets');
  fs.mkdirSync(widgetsDir, { recursive: true });

  console.log('Fetching widget templates from BigCommerce...\n');
  const templates = await fetchTemplates();

  if (templates.length === 0) {
    console.log('No widget templates found in this store.');
    return;
  }

  console.log(`Found ${templates.length} widget template(s):\n`);

  for (const template of templates) {
    const dir = writeWidget(template, widgetsDir);
    console.log(`  ✓  ${template.name}`);
    console.log(`     UUID : ${template.uuid}`);
    console.log(`     Path : ${path.relative(process.cwd(), dir)}\n`);
  }

  console.log('Done. Edit files inside widgets/ then run: node scripts/push.js <widget-folder>');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
