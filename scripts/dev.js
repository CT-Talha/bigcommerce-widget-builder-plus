/**
 * BigCommerce Widget — Local Preview Server
 *
 * Usage (via CLI):
 *   npx bcw dev my-banner
 *
 * Usage (standalone):
 *   node scripts/dev.js my-banner
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

/** Render one {{#each}} item body with its own context */
function renderEachItem(body, item, index, parentData, widgetId) {
  // {{#if ../field '===' 'value'}} or '===' true/false — parent context equality
  body = body.replace(
    /\{\{#if\s+\.\.\/(\w+)\s+'==='\s+(?:'([^']*)'|(true|false))\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, k, quotedVal, boolVal, truthy, falsy = '') => {
      const actual   = String(parentData[k] ?? '');
      const expected = quotedVal !== undefined ? quotedVal : boolVal;
      return actual === expected ? truthy : falsy;
    }
  );
  // {{#if field '===' 'value'}} or {{#if field '===' true/false}} — item context equality
  body = body.replace(
    /\{\{#if\s+(\w+)\s+'==='\s+(?:'([^']*)'|(true|false))\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, k, quotedVal, boolVal, truthy, falsy = '') => {
      const actual   = String(item[k] ?? parentData[k] ?? '');
      const expected = quotedVal !== undefined ? quotedVal : boolVal;
      return actual === expected ? truthy : falsy;
    }
  );
  // {{#if ../field}} — parent truthy
  body = body.replace(
    /\{\{#if\s+\.\.\/(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, k, truthy, falsy = '') => parentData[k] ? truthy : falsy
  );
  // {{#if field}} — item truthy
  body = body.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, k, truthy, falsy = '') => item[k] ? truthy : falsy
  );
  body = body.replace(/\{\{@index\}\}/g, String(index));
  body = body.replace(/\{\{\.\.\/_\.id\}\}/g, widgetId);
  body = body.replace(/\{\{_\.id\}\}/g, widgetId);
  // {{../_.data.field}} and {{_.data.field}} — legacy
  body = body.replace(/\{\{\.\.\/_\.data\.(\w+)\}\}/g, (_, k) => String(parentData[k] ?? ''));
  body = body.replace(/\{\{_\.data\.(\w+)\}\}/g, (_, k) => String(parentData[k] ?? ''));
  // {{../field}} — parent direct access
  body = body.replace(/\{\{\.\.\/(\w+)\}\}/g, (_, k) => String(parentData[k] ?? ''));
  // {{field}} — item direct access with fallback to parent data
  body = body.replace(/\{\{(\w+)\}\}/g, (_, k) => String(item[k] ?? parentData[k] ?? ''));
  return body;
}

/** Replace template expressions with values from the data map */
function renderTemplate(html, data) {
  const widgetId = 'preview';

  // {{#each field}} and {{#each _.data.field}} — both patterns
  html = html.replace(
    /\{\{#each\s+(?:_\.data\.)?(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, key, body) => {
      const arr = data[key];
      if (!Array.isArray(arr) || arr.length === 0) return '';
      return arr.map((item, i) => renderEachItem(body, item, i, data, widgetId)).join('');
    }
  );

  // {{#if field '===' 'value'}} or {{#if field '===' true/false}} — equality
  html = html.replace(
    /\{\{#if\s+(\w+)\s+'==='\s+(?:'([^']*)'|(true|false))\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, key, quotedVal, boolVal, truthy, falsy = '') => {
      const actual   = String(data[key] ?? '');
      const expected = quotedVal !== undefined ? quotedVal : boolVal;
      return actual === expected ? truthy : falsy;
    }
  );

  // {{#if _.data.field}} and {{#if field}} — truthy check
  html = html.replace(
    /\{\{#if\s+(?:_\.data\.)?(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_, key, truthy, falsy = '') => data[key] ? truthy : falsy
  );

  // {{_.id}}
  html = html.replace(/\{\{_\.id\}\}/g, widgetId);

  // {{_.data.field}} — legacy
  html = html.replace(/\{\{_\.data\.([^}]+)\}\}/g, (_, key) => {
    const v = data[key.trim()];
    return v !== undefined ? String(v) : '';
  });

  // {{field}} — direct access (must be last)
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : '';
  });

  return html;
}

/** Flatten schema into a flat array of settings — handles array + tab at root */
function flattenSettings(schema) {
  const out = [];
  for (const item of (schema ?? [])) {
    if (item.type === 'array') {
      out.push(item); // keep array itself for renderControl
      for (const inner of (item.schema ?? [])) {
        if (inner.settings) out.push(...inner.settings);
        for (const section of (inner.sections ?? [])) {
          if (section.settings) out.push(...section.settings);
        }
      }
    } else if (item.type === 'tab') {
      for (const section of (item.sections ?? [])) {
        if (section.settings) out.push(...section.settings);
      }
    } else if (item.id) {
      out.push(item); // direct setting at root level
    }
  }
  return out;
}

/** Build default values map from schema — arrays become arrays of default items */
function defaultsFromSchema(schema) {
  const out = {};
  for (const s of flattenSettings(schema)) {
    if (s.type === 'array') {
      if (out[s.id] === undefined) {
        const itemDefaults = {};
        for (const inner of (s.schema ?? [])) {
          const settings = inner.settings
            ?? (inner.sections ?? []).flatMap(sec => sec.settings ?? [])
            ?? [];
          for (const f of settings) {
            if (f.id) itemDefaults[f.id] = f.default ?? '';
          }
          if (inner.id) itemDefaults[inner.id] = inner.default ?? '';
        }
        out[s.id] = Array.from({ length: s.defaultCount ?? 1 }, () => ({ ...itemDefaults }));
      }
    } else if (s.id !== undefined) {
      out[s.id] = s.default ?? '';
    }
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

    case 'boolean':
      return `<div class="ctrl-row ctrl-row--inline">
        ${label}
        <select id="${id}" data-id="${esc(setting.id)}">
          <option value="true"  ${String(val) === 'true'  ? 'selected' : ''}>Yes</option>
          <option value="false" ${String(val) === 'false' ? 'selected' : ''}>No</option>
        </select>
      </div>`;

    case 'imageManager': {
      const src = (val && typeof val === 'object') ? (val.src ?? '') : String(val ?? '');
      return `<div class="ctrl-row">
        ${label}
        <input type="text" id="${id}" data-id="${esc(setting.id)}"
          value="${esc(src)}" placeholder="Paste image URL">
      </div>`;
    }

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

    case 'range': {
      const rv = setting.typeMeta?.rangeValues ?? {};
      const unit = rv.unit ?? '';
      return `<div class="ctrl-row">
        <div class="range-label-row">
          ${label}
          <span class="range-val" data-for="${esc(setting.id)}">${esc(val)}${esc(unit)}</span>
        </div>
        <input type="range" id="${id}" data-id="${esc(setting.id)}"
          value="${esc(val)}" min="${esc(rv.min ?? 0)}"
          max="${esc(rv.max ?? 100)}" step="${esc(rv.step ?? 1)}">
      </div>`;
    }

    case 'array': {
      const count = Array.isArray(val) ? val.length : 0;
      return `<div class="ctrl-row">
        ${label}
        <div style="font-size:12px;color:var(--soft);padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">
          ${count} item${count !== 1 ? 's' : ''} — edit <code style="font-size:11px">config.json</code> to modify
        </div>
      </div>`;
    }

    case 'visibility':
      return `<div class="ctrl-row ctrl-row--inline">
        ${label}
        <select id="${id}" data-id="${esc(setting.id)}">
          <option value="show" ${val === 'show' ? 'selected' : ''}>Show</option>
          <option value="hide" ${val === 'hide' ? 'selected' : ''}>Hide</option>
        </select>
      </div>`;

    default: // input / text
      return `<div class="ctrl-row">
        ${label}
        <input type="text" id="${id}" data-id="${esc(setting.id)}" value="${esc(val)}">
      </div>`;
  }
}

/** Render all schema controls as HTML — handles array + tab at root level */
function renderControls(schema, values) {
  if (!schema?.length) {
    return '<div class="no-schema">No schema.json found.<br>Add settings to see controls here.</div>';
  }

  let out = '';
  for (const item of schema) {
    if (item.type === 'array') {
      out += `<div class="tab-label">${esc(item.label ?? 'Items')}</div>`;
      out += `<div class="section">`;

      // Array item count
      const count = Array.isArray(values[item.id]) ? values[item.id].length : 0;
      out += `<div class="ctrl-row"><div style="font-size:12px;color:var(--soft);padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;">
        ${count} item${count !== 1 ? 's' : ''} — edit <code style="font-size:11px">config.json</code> to add/remove
      </div></div>`;

      // Render inner settings (from the first item) so they're controllable in preview
      const firstItem = Array.isArray(values[item.id]) ? (values[item.id][0] ?? {}) : {};
      for (const inner of (item.schema ?? [])) {
        for (const section of (inner.sections ?? [])) {
          if (section.label) out += `<div class="section-label">${esc(section.label)}</div>`;
          for (const s of (section.settings ?? [])) {
            if (s.type === 'imageManager') continue; // image picker — skip in preview
            const val = firstItem[s.id] ?? values[s.id] ?? s.default ?? '';
            out += renderControl(s, val);
          }
        }
      }

      out += `</div>`;

    } else if (item.type === 'tab') {
      out += `<div class="tab-label">${esc(item.label ?? '')}</div>`;
      for (const section of (item.sections ?? [])) {
        out += `<div class="section">`;
        if (section.label) out += `<div class="section-label">${esc(section.label)}</div>`;
        for (const s of (section.settings ?? [])) {
          out += renderControl(s, values[s.id]);
        }
        out += `</div>`;
      }

    } else if (item.id) {
      // Direct root-level setting (no tab wrapper)
      out += `<div class="section">${renderControl(item, values[item.id])}</div>`;
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
    // Also push the updated value into every array item that has this field,
    // so inner-array controls (e.g. per-slide settings) reflect instantly
    for (const arr of Object.values(liveValues)) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === 'object' && item !== null && id in item) {
            item[id] = value;
          }
        }
      }
    }
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
  overflow: visible; min-height: 80px;
}
iframe#preview-frame {
  display: block; width: 100%; border: none;
  min-height: 90vh; overflow: hidden;
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
const INITIAL_HTML = ${JSON.stringify(rendered).replace(/<\/(script)/gi, '<\\/$1')};

function makeDoc(html) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>*{box-sizing:border-box}html,body{margin:0;padding:0;overflow:visible;height:auto}body{padding:16px;font-family:sans-serif}</style>'
    + '<script>'
    + 'function notifyHeight(){'
    +   'window.parent.postMessage({type:"bcw-resize",h:document.body.scrollHeight},"*");'
    + '}'
    + 'new ResizeObserver(notifyHeight).observe(document.body);'
    + 'document.addEventListener("click",function(){setTimeout(notifyHeight,350)});'
    + '<\\/script>'
    + '</head><body>' + html + '</body></html>';
}

const frame = document.getElementById('preview-frame');

// Listen for height updates from inside the iframe
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'bcw-resize' && e.data.h > 0) {
    frame.style.height = e.data.h + 'px';
  }
});

function setPreview(html) {
  frame.srcdoc = makeDoc(html);
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
        if (span) {
          // preserve any unit suffix (px, em, %) that was in the original label
          const orig = span.textContent;
          const unit = orig.replace(/[\d.]/g, '');
          span.textContent = v + unit;
        }
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
