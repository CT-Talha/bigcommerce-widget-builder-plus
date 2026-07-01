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

/**
 * Minimal template engine for the BC-style Handlebars subset used in widget.html:
 *   {{field}}, {{{field}}}, {{a.b.c}}, {{../field}}, {{@index}}, {{_.id}}, {{_.data.field}}
 *   {{#if cond}}...{{else if cond}}...{{else}}...{{/if}}
 *   {{#unless cond}}...{{else}}...{{/unless}}
 *   {{#each field}}...{{/each}}
 * where cond is `field`, `field '===' 'value'`, `field '===' true|false|undefined`, or `!==`.
 * A real Handlebars-compiled render is used when pushed to BC — this only drives local preview.
 */

/** Resolve a (possibly dotted, possibly ../-prefixed) key against a render context */
function getValue(ctx, key, widgetId) {
  key = key.trim();
  if (key === '@index') return ctx.index;
  if (key.startsWith('../')) return ctx.parent ? getValue(ctx.parent, key.slice(3), widgetId) : undefined;
  if (key === '_.id') return widgetId;
  if (key.startsWith('_.data.')) return getValue(ctx, key.slice(7), widgetId);
  if (key.startsWith('_.')) return undefined; // BC runtime context — unavailable in local preview

  const resolve = (obj) => key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), obj);
  const own = resolve(ctx.data);
  if (own !== undefined || !ctx.parent) return own;
  return resolve(ctx.parent.data); // fall back to parent data for fields not on the current #each item
}

const COND_RE = /^(\S+)(?:\s+'(===|!==)'\s+(?:'([^']*)'|(true|false)|(undefined)))?$/;

/** Evaluate a `field`, `field '===' 'value'`, etc. condition string */
function evalCond(ctx, widgetId, raw) {
  const m = COND_RE.exec(raw.trim());
  if (!m) return false;
  const [, key, op, quotedVal, boolVal, bareVal] = m;
  const actual = getValue(ctx, key, widgetId);
  if (!op) return !!actual;
  const eq = bareVal === 'undefined'
    ? actual === undefined
    : String(actual ?? '') === (quotedVal !== undefined ? quotedVal : boolVal);
  return op === '!==' ? !eq : eq;
}

/** Substitute {{{field}}} and {{field}} expressions inside a leaf text chunk */
function renderText(str, ctx, widgetId) {
  str = str.replace(/\{\{\{\s*([^}]+?)\s*\}\}\}/g, (_, expr) => {
    // {{{json .}}} / {{{json field}}} — BC's Handlebars `json` helper, serializes a value to JSON
    const jsonCall = /^json\s+(.+)$/.exec(expr.trim());
    if (jsonCall) {
      const arg = jsonCall[1].trim();
      // '.'/'this' — the whole root context, which on real BC also carries `_` (id, editor state, etc.)
      const v = (arg === '.' || arg === 'this')
        ? { ...ctx.data, _: { id: widgetId, context: { isEditorMode: false }, pageBuilderData: { previewState: { editMode: false } } } }
        : getValue(ctx, arg, widgetId);
      return JSON.stringify(v ?? null);
    }
    const v = getValue(ctx, expr, widgetId);
    return v !== undefined ? String(v) : '';
  });
  str = str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const v = getValue(ctx, key, widgetId);
    return v !== undefined ? String(v) : '';
  });
  return str;
}

const BLOCK_TAG_RE = /\{\{\s*(#if|#unless|#each|else if|else|\/if|\/unless|\/each)\s*([^}]*?)\s*\}\}/g;

/** Parse block helpers ({{#if}}/{{#unless}}/{{#each}} incl. else-if chains) into a small AST */
function parseTemplate(src) {
  const root = { active: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const pushText = (str) => { if (str) top().active.push({ type: 'text', value: str }); };

  BLOCK_TAG_RE.lastIndex = 0;
  let pos = 0, match;
  while ((match = BLOCK_TAG_RE.exec(src))) {
    pushText(src.slice(pos, match.index));
    pos = match.index + match[0].length;
    const [, tag, args] = match;

    if (tag === '#if' || tag === '#unless') {
      const node = { type: tag === '#if' ? 'if' : 'unless', branches: [{ cond: args, children: [] }], elseChildren: null };
      top().active.push(node);
      stack.push({ node, active: node.branches[0].children });
    } else if (tag === 'else if') {
      const branch = { cond: args, children: [] };
      top().node.branches.push(branch);
      top().active = branch.children;
    } else if (tag === 'else') {
      top().node.elseChildren = [];
      top().active = top().node.elseChildren;
    } else if (tag === '/if' || tag === '/unless') {
      stack.pop();
    } else if (tag === '#each') {
      const node = { type: 'each', key: args.trim(), children: [] };
      top().active.push(node);
      stack.push({ node, active: node.children });
    } else if (tag === '/each') {
      stack.pop();
    }
  }
  pushText(src.slice(pos));
  return root.active;
}

/** Walk the AST, evaluating conditions/loops and substituting leaf text against ctx */
function renderNodes(nodes, ctx, widgetId) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += renderText(node.value, ctx, widgetId);
    } else if (node.type === 'if' || node.type === 'unless') {
      const branch = node.branches.find(b => {
        const cond = evalCond(ctx, widgetId, b.cond);
        return node.type === 'unless' ? !cond : cond;
      });
      if (branch) out += renderNodes(branch.children, ctx, widgetId);
      else if (node.elseChildren) out += renderNodes(node.elseChildren, ctx, widgetId);
    } else if (node.type === 'each') {
      const arr = getValue(ctx, node.key.replace(/^_\.data\./, ''), widgetId);
      if (Array.isArray(arr)) {
        arr.forEach((item, i) => {
          out += renderNodes(node.children, { data: item, parent: ctx, index: i }, widgetId);
        });
      }
    }
  }
  return out;
}

/** Replace template expressions with values from the data map */
function renderTemplate(html, data) {
  const widgetId = 'preview';
  const ast = parseTemplate(html);
  return renderNodes(ast, { data, parent: null, index: undefined }, widgetId);
}

/** Push a setting, also pulling in its typography-style conditionalSettings (nested sub-fields) */
function pushSetting(out, item) {
  out.push(item);
  for (const cond of (item.typeMeta?.conditionalSettings ?? [])) {
    for (const s of (cond.settings ?? [])) pushSetting(out, s);
  }
}

/** Flatten schema into a flat array of settings — handles array + tab + hidden at root */
function flattenSettings(schema) {
  const out = [];
  for (const item of (schema ?? [])) {
    if (item.type === 'array') {
      out.push(item); // keep array itself for renderControl
      for (const inner of (item.schema ?? [])) {
        if (inner.settings) inner.settings.forEach(s => pushSetting(out, s));
        for (const section of (inner.sections ?? [])) {
          if (section.settings) section.settings.forEach(s => pushSetting(out, s));
        }
      }
    } else if (item.type === 'tab') {
      for (const section of (item.sections ?? [])) {
        if (section.settings) section.settings.forEach(s => pushSetting(out, s));
      }
    } else if (item.settings) {
      item.settings.forEach(s => pushSetting(out, s)); // e.g. { type: 'hidden', settings: [...] }
    } else if (item.id) {
      pushSetting(out, item); // direct setting at root level
    }
  }
  return out;
}

/** Merge schema defaults into live values, including per-item defaults for arrays */
function mergeWithDefaults(schema, live) {
  const defaults = defaultsFromSchema(schema);
  const merged = { ...defaults, ...live };
  for (const s of flattenSettings(schema)) {
    if (s.type === 'array' && Array.isArray(merged[s.id]) && defaults[s.id]?.[0]) {
      const itemDefaults = defaults[s.id][0];
      merged[s.id] = merged[s.id].map(item => ({ ...itemDefaults, ...item }));
    }
  }
  return merged;
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
      const opts = (setting.typeMeta?.selectOptions ?? [])
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

    case 'boxModel': {
      const v = (val && typeof val === 'object') ? val : {};
      const side = (s) => `${esc(v[s]?.value ?? '0')}${esc(v[s]?.type ?? 'px')}`;
      return `<div class="ctrl-row">
        ${label}
        <div style="font-size:12px;color:var(--soft);padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">
          T:${side('top')} R:${side('right')} B:${side('bottom')} L:${side('left')} — edit <code style="font-size:11px">config.json</code> to modify
        </div>
      </div>`;
    }

    case 'alignment': {
      const v = (val && typeof val === 'object') ? val : {};
      return `<div class="ctrl-row">
        ${label}
        <div style="font-size:12px;color:var(--soft);padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">
          ${esc(v.horizontal ?? '')} / ${esc(v.vertical ?? '')} — edit <code style="font-size:11px">config.json</code> to modify
        </div>
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
    liveValues = mergeWithDefaults(schema, liveValues);
    res.json({
      html: renderTemplate(getTemplate(), liveValues),
      controls: renderControls(schema, liveValues),
    });
  });

  /** Main preview page */
  app.get('/', (_req, res) => {
    const schema = getSchema();
    liveValues = mergeWithDefaults(schema, liveValues);
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
