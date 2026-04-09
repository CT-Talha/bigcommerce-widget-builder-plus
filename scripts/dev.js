/**
 * BigCommerce Widget — Local Preview Server
 *
 * Usage (via CLI):
 *   npm run bc-widget -- dev widgets/my-banner
 *
 * Usage (standalone):
 *   node scripts/dev.js widgets/my-banner
 *
 * Opens a preview at http://localhost:4041 with:
 *   • Live Page Builder-style controls (generated from schema.json)
 *   • Widget rendered in an isolated iframe
 *   • Changes to controls update the preview instantly
 *   • File saves on disk reload the preview automatically (SSE)
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replace {{_.data.fieldId}} with values from the data map */
function renderTemplate(html, data) {
  return html.replace(/\{\{_\.data\.([^}]+)\}\}/g, (_, key) => {
    const v = data[key.trim()];
    return v !== undefined ? String(v) : '';
  });
}

/** Flatten schema tabs/sections into a flat array of settings */
function flattenSettings(schema) {
  const out = [];
  for (const tab of (schema ?? [])) {
    if (tab.settings) out.push(...tab.settings);
    for (const section of (tab.sections ?? [])) {
      if (section.settings) out.push(...section.settings);
    }
  }
  return out;
}

/** Build default values map from schema settings */
function defaultsFromSchema(schema) {
  const out = {};
  for (const s of flattenSettings(schema)) {
    if (s.id !== undefined) out[s.id] = s.default ?? '';
  }
  return out;
}

/** Render one control row as HTML */
function renderControl(setting, value) {
  const id = `ctrl-${esc(setting.id)}`;
  const val = value !== undefined ? value : (setting.default ?? '');

  const label = `<label for="${id}">${esc(setting.label)}</label>`;

  switch (setting.type) {
    case 'color':
      return `<div class="ctrl-row">
        ${label}
        <div class="color-wrap">
          <input type="color" id="${id}" data-id="${esc(setting.id)}" value="${esc(val)}">
          <span class="color-val">${esc(val)}</span>
        </div>
      </div>`;

    case 'checkbox':
      return `<div class="ctrl-row ctrl-row--inline">
        ${label}
        <input type="checkbox" id="${id}" data-id="${esc(setting.id)}" ${val ? 'checked' : ''}>
      </div>`;

    case 'select': {
      const opts = (setting.options ?? [])
        .map(o => `<option value="${esc(o.value)}" ${String(val) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`)
        .join('');
      return `<div class="ctrl-row">
        ${label}
        <select id="${id}" data-id="${esc(setting.id)}">${opts}</select>
      </div>`;
    }

    case 'number':
      return `<div class="ctrl-row">
        ${label}
        <input type="number" id="${id}" data-id="${esc(setting.id)}" value="${esc(val)}">
      </div>`;

    case 'range':
      return `<div class="ctrl-row">
        <div class="range-label-row">
          ${label}
          <span class="range-val" data-for="${esc(setting.id)}">${esc(val)}</span>
        </div>
        <input type="range" id="${id}" data-id="${esc(setting.id)}"
          value="${esc(val)}" min="${esc(setting.min ?? 0)}"
          max="${esc(setting.max ?? 100)}" step="${esc(setting.step ?? 1)}">
      </div>`;

    default: // input / text
      return `<div class="ctrl-row">
        ${label}
        <input type="text" id="${id}" data-id="${esc(setting.id)}" value="${esc(val)}">
      </div>`;
  }
}

/** Render all schema controls as HTML (tabs → sections → settings) */
function renderControls(schema, values) {
  if (!schema?.length) {
    return '<div class="no-schema">No schema.json found.<br>Add settings to see controls here.</div>';
  }

  let out = '';
  for (const tab of schema) {
    out += `<div class="tab-label">${esc(tab.label ?? '')}</div>`;
    if (tab.sections) {
      for (const section of tab.sections) {
        out += `<div class="section">`;
        if (section.label) out += `<div class="section-label">${esc(section.label)}</div>`;
        for (const s of (section.settings ?? [])) {
          out += renderControl(s, values[s.id]);
        }
        out += `</div>`;
      }
    }
    if (tab.settings) {
      out += `<div class="section">`;
      for (const s of tab.settings) out += renderControl(s, values[s.id]);
      out += `</div>`;
    }
  }
  return out;
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function startDev(widgetFolder) {
  const widgetPath = path.resolve(process.cwd(), widgetFolder);

  if (!fs.existsSync(widgetPath)) {
    console.error(`\n  Error: Widget folder not found: ${widgetFolder}\n`);
    process.exit(1);
  }

  const widgetName = path.basename(widgetPath);
  const PORT = Number(process.env.DEV_PORT) || 4041;

  // In-memory values — start from config.json, updated as user changes controls
  let liveValues = {};

  function loadConfig() {
    try {
      const p = path.join(widgetPath, 'config.json');
      if (fs.existsSync(p)) liveValues = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* ignore parse errors */ }
  }

  function getSchema() {
    try {
      return JSON.parse(fs.readFileSync(path.join(widgetPath, 'schema.json'), 'utf8'));
    } catch { return []; }
  }

  function getTemplate() {
    try {
      return fs.readFileSync(path.join(widgetPath, 'widget.html'), 'utf8');
    } catch { return '<p style="color:red">widget.html not found</p>'; }
  }

  loadConfig();

  // ── Express app ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // SSE clients
  const clients = new Set();

  function broadcast(event, data = {}) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const r of clients) r.write(msg);
  }

  // Watch widget files — on save, reload preview
  for (const file of ['widget.html', 'schema.json', 'config.json']) {
    const fp = path.join(widgetPath, file);
    if (fs.existsSync(fp)) {
      fs.watch(fp, () => {
        if (file === 'config.json') {
          loadConfig(); // sync in-memory values with disk
        }
        broadcast('reload', { file });
      });
    }
  }

  // ── Routes ───────────────────────────────────────────────────────────────────

  /** SSE — browser subscribes here to get live-reload events */
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
  });

  /** Called when a control value changes — returns re-rendered widget HTML */
  app.post('/update', (req, res) => {
    const { id, value } = req.body;
    liveValues[id] = value;
    const rendered = renderTemplate(getTemplate(), liveValues);
    res.json({ html: rendered });
  });

  /**
   * Called on SSE reload — returns fresh rendered HTML + fresh controls HTML
   * so the UI can rebuild itself without a full page refresh.
   */
  app.get('/render', (req, res) => {
    const schema = getSchema();
    // Merge schema defaults under live values so new fields appear correctly
    liveValues = { ...defaultsFromSchema(schema), ...liveValues };
    res.json({
      html: renderTemplate(getTemplate(), liveValues),
      controls: renderControls(schema, liveValues),
    });
  });

  /** Main preview page */
  app.get('/', (_req, res) => {
    const schema = getSchema();
    liveValues = { ...defaultsFromSchema(schema), ...liveValues };
    const rendered = renderTemplate(getTemplate(), liveValues);
    const controls = renderControls(schema, liveValues);

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(widgetName)} — BC Widget Preview</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --navy:   #1C2D47;
  --blue:   #3C64F4;
  --green:  #22C55E;
  --bg:     #F4F6FB;
  --white:  #FFFFFF;
  --border: #E2E8F0;
  --text:   #1A202C;
  --soft:   #6B7280;
  --font:   -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
html, body { height: 100%; font-family: var(--font); background: var(--bg); color: var(--text); }

/* ── Header ── */
.header {
  height: 52px; display: flex; align-items: center;
  padding: 0 20px; gap: 12px;
  background: var(--navy); flex-shrink: 0;
}
.header-name { color: #fff; font-size: 14px; font-weight: 600; }
.header-sub  { color: #94a3b8; font-size: 12px; }
.live-pill {
  margin-left: auto; display: flex; align-items: center; gap: 5px;
  background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3);
  border-radius: 20px; padding: 3px 10px;
}
.live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
.live-text { color: var(--green); font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
.reload-badge {
  display: none; font-size: 11px; font-weight: 600;
  background: var(--blue); color: #fff;
  padding: 3px 10px; border-radius: 20px;
}
.reload-badge.show { display: inline-block; }

/* ── Layout ── */
.layout { display: flex; height: calc(100vh - 52px); overflow: hidden; }

/* ── Controls panel ── */
.panel-controls {
  width: 264px; flex-shrink: 0;
  background: var(--white); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.panel-header {
  padding: 12px 16px;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--soft);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.controls-scroll { overflow-y: auto; flex: 1; padding: 12px; }

.tab-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--blue);
  margin: 8px 0 6px; padding-bottom: 4px;
}
.section { margin-bottom: 14px; }
.section-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--soft);
  margin-bottom: 8px; padding-bottom: 5px;
  border-bottom: 1px solid var(--border);
}
.ctrl-row { margin-bottom: 10px; }
.ctrl-row--inline { display: flex; align-items: center; justify-content: space-between; }
.ctrl-row label {
  display: block; font-size: 12px; font-weight: 500;
  color: var(--text); margin-bottom: 4px;
}
.ctrl-row--inline label { margin-bottom: 0; }
.ctrl-row input[type="text"],
.ctrl-row input[type="number"],
.ctrl-row select {
  width: 100%; padding: 6px 10px;
  border: 1px solid var(--border); border-radius: 6px;
  font-size: 13px; color: var(--text); background: var(--bg);
  transition: border-color 0.15s;
}
.ctrl-row input[type="text"]:focus,
.ctrl-row input[type="number"]:focus,
.ctrl-row select:focus { outline: none; border-color: var(--blue); }
.color-wrap { display: flex; align-items: center; gap: 8px; }
.ctrl-row input[type="color"] {
  width: 36px; height: 30px; padding: 2px;
  border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
}
.color-val { font-size: 11px; color: var(--soft); font-family: monospace; }
.range-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.range-label-row label { margin-bottom: 0; }
.range-val { font-size: 11px; color: var(--soft); font-family: monospace; }
.ctrl-row input[type="range"] { width: 100%; accent-color: var(--blue); }
.ctrl-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--blue); }
.no-schema { padding: 20px 16px; font-size: 13px; color: var(--soft); text-align: center; line-height: 1.6; }

/* ── Preview panel ── */
.panel-preview { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.preview-bar {
  padding: 8px 16px; background: var(--white);
  border-bottom: 1px solid var(--border);
  font-size: 11px; color: var(--soft);
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.preview-bar code {
  background: var(--bg); padding: 1px 6px;
  border-radius: 4px; font-size: 11px; color: var(--navy);
}
.preview-scroll {
  flex: 1; overflow: auto; padding: 32px;
  background: repeating-linear-gradient(
    45deg, transparent, transparent 10px,
    rgba(0,0,0,0.015) 10px, rgba(0,0,0,0.015) 20px
  );
}
.widget-card {
  background: var(--white); border-radius: 10px;
  box-shadow: 0 2px 16px rgba(0,0,0,0.07);
  overflow: hidden; min-height: 80px;
}
iframe#preview-frame {
  display: block; width: 100%; border: none;
  min-height: 120px;
}
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="header-name">${esc(widgetName)}</div>
    <div class="header-sub">BigCommerce Widget Preview</div>
  </div>
  <span class="reload-badge" id="reload-badge">Reloaded</span>
  <div class="live-pill">
    <div class="live-dot"></div>
    <div class="live-text">LIVE</div>
  </div>
</div>

<div class="layout">

  <!-- Controls -->
  <div class="panel-controls">
    <div class="panel-header">Page Builder Controls</div>
    <div class="controls-scroll" id="controls-body">${controls}</div>
  </div>

  <!-- Preview -->
  <div class="panel-preview">
    <div class="preview-bar">
      Previewing <code>${esc(widgetFolder)}/widget.html</code>
      — controls update instantly, file saves auto-reload
    </div>
    <div class="preview-scroll">
      <div class="widget-card">
        <iframe id="preview-frame" srcdoc="" scrolling="no"></iframe>
      </div>
    </div>
  </div>

</div>

<script>
const INITIAL_HTML = ${JSON.stringify(rendered)};

function makeDoc(html) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>*{box-sizing:border-box}body{margin:0;padding:0;font-family:sans-serif}</style>'
    + '</head><body>' + html + '</body></html>';
}

const frame = document.getElementById('preview-frame');

function setPreview(html) {
  frame.srcdoc = makeDoc(html);
  // Auto-resize iframe to content height
  frame.onload = () => {
    try {
      const h = frame.contentDocument.body.scrollHeight;
      if (h > 0) frame.style.height = h + 'px';
    } catch {}
  };
}

setPreview(INITIAL_HTML);

// ── Wire up controls ────────────────────────────────────────────────────────
async function update(id, value) {
  const res = await fetch('/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, value }),
  });
  const { html } = await res.json();
  setPreview(html);
}

function wireControls() {
  document.querySelectorAll('[data-id]').forEach(el => {
    if (el.type === 'checkbox') {
      el.addEventListener('change', () => update(el.dataset.id, el.checked));

    } else if (el.type === 'color') {
      el.addEventListener('input', e => {
        const v = e.target.value;
        const span = e.target.closest('.color-wrap')?.querySelector('.color-val');
        if (span) span.textContent = v;
        update(el.dataset.id, v);
      });

    } else if (el.type === 'range') {
      el.addEventListener('input', e => {
        const v = e.target.value;
        const span = document.querySelector('.range-val[data-for="' + el.dataset.id + '"]');
        if (span) span.textContent = v;
        update(el.dataset.id, v);
      });

    } else {
      el.addEventListener('input', e => update(el.dataset.id, e.target.value));
    }
  });
}

wireControls();

// ── SSE live reload ─────────────────────────────────────────────────────────
const es = new EventSource('/events');

es.addEventListener('reload', async () => {
  const res = await fetch('/render');
  const { html, controls } = await res.json();

  setPreview(html);

  document.getElementById('controls-body').innerHTML = controls;
  wireControls();

  const badge = document.getElementById('reload-badge');
  badge.classList.add('show');
  setTimeout(() => badge.classList.remove('show'), 2000);
});
</script>
</body>
</html>`);
  });

  app.listen(PORT, () => {
    console.log(`
  BC Widget Preview — ${widgetName}
  ──────────────────────────────────
  Open:    http://localhost:${PORT}
  Watching: ${widgetFolder}/

  Edit widget.html, schema.json, or config.json and the preview
  will reload automatically. Press Ctrl+C to stop.
`);
  });
}

// ── Standalone ───────────────────────────────────────────────────────────────
if (process.argv[1] === __filename) {
  const folder = process.argv[2];
  if (!folder) {
    console.error('\n  Usage: node scripts/dev.js widgets/<widget-name>\n');
    process.exit(1);
  }
  startDev(folder);
}
