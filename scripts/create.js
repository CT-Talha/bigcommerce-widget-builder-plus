/**
 * Scaffold a new BigCommerce widget with starter files.
 *
 * Usage (run from the client folder):
 *   npx bcw create my-banner
 *
 * Creates:
 *   <name>/
 *     widget.html   — starter template
 *     schema.json   — Page Builder schema with example fields
 *     config.json   — default values matching the schema
 *     widget.yml    — name + empty UUID (push will create it on BC)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export async function createWidget(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const widgetDir = path.resolve(process.cwd(), slug);

  if (fs.existsSync(widgetDir)) {
    console.error(`\n  Error: Widget already exists at ${slug}/\n`);
    process.exit(1);
  }

  fs.mkdirSync(widgetDir, { recursive: true });

  // ── widget.html ────────────────────────────────────────────────────────────
  const html = `<div class="bc-widget bc-widget--${slug}" style="padding: 24px; font-family: sans-serif;">
  <h2 style="
    margin: 0 0 12px;
    font-size: {{title_size}}px;
    color: {{title_color}};
  ">{{title}}</h2>

  <p style="
    margin: 0;
    font-size: 16px;
    color: {{text_color}};
    line-height: 1.6;
  ">{{body_text}}</p>
</div>
`;

  // ── schema.json ────────────────────────────────────────────────────────────
  const schema = [
    {
      type: 'tab',
      label: 'Content',
      sections: [
        {
          label: 'Text',
          settings: [
            { type: 'input', label: 'Title',     id: 'title',     default: 'Welcome' },
            { type: 'input', label: 'Body Text', id: 'body_text', default: 'Edit this widget to get started.' },
          ],
        },
        {
          label: 'Style',
          settings: [
            { type: 'color', label: 'Title Color', id: 'title_color', default: '#1C2D47' },
            { type: 'color', label: 'Text Color',  id: 'text_color',  default: '#4A5568' },
            {
              type: 'range', label: 'Title Size', id: 'title_size', default: 28,
              typeMeta: { rangeValues: { min: 14, max: 64, step: 1, unit: 'px' } },
            },
          ],
        },
      ],
    },
  ];

  // ── config.json ────────────────────────────────────────────────────────────
  const config = {
    title:       'Welcome',
    body_text:   'Edit this widget to get started.',
    title_color: '#1C2D47',
    text_color:  '#4A5568',
    title_size:  28,
  };

  // ── widget.yml ─────────────────────────────────────────────────────────────
  const yml = `name: "${slug}"\ntemplate_uuid: ""\nversion_uuid: ""\n`;

  // Write files
  fs.writeFileSync(path.join(widgetDir, 'widget.html'),  html);
  fs.writeFileSync(path.join(widgetDir, 'schema.json'),  JSON.stringify(schema, null, 2));
  fs.writeFileSync(path.join(widgetDir, 'config.json'),  JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(widgetDir, 'widget.yml'),   yml);

  console.log(`
  Widget created: ${slug}/
  ├── widget.html
  ├── schema.json
  ├── config.json
  └── widget.yml

  Preview locally:
    npx bcw dev ${slug}

  Push to BigCommerce when ready:
    npx bcw push ${slug}
`);
}

// ── Standalone ──────────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  const name = process.argv[2];
  if (!name) {
    console.error('\n  Usage: node scripts/create.js <widget-name>\n');
    process.exit(1);
  }
  createWidget(name);
}
