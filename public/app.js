/* ============================================================
   BigCommerce Widget Customizations — Frontend
   All BigCommerce API calls happen in the browser via a blind
   server proxy. Credentials are held only in JS memory and are
   never stored on the server.
   ============================================================ */

// ---- In-memory store (cleared on page refresh — intentional) ----
const state = {
  storeName:   '',
  os:          'mac',
  storeHash:   '',
  accessToken: '',
  widgets:     [],   // fetched templates
};

// ============================================================
// BigCommerce API via server proxy
// ============================================================
async function bcRequest(bcPath, method = 'GET', body = null) {
  const res = await fetch('/api/bc-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeHash:   state.storeHash,
      accessToken: state.accessToken,
      bcPath,
      method,
      body,
    }),
  });
  return { status: res.status, data: await res.json() };
}

async function validateCredentials() {
  return bcRequest('/widget-templates?limit=1');
}

async function fetchAllWidgets() {
  const templates = [];
  let page = 1;
  while (true) {
    const { status, data } = await bcRequest(`/widget-templates?page=${page}&limit=50`);
    if (status !== 200) throw Object.assign(new Error(`API ${status}`), { status, data });
    templates.push(...(data.data ?? []));
    const meta = data.meta?.pagination ?? {};
    if (page >= (meta.total_pages ?? 1)) break;
    page++;
  }
  return templates;
}

// ============================================================
// ZIP builder — runs entirely in browser using JSZip
// ============================================================
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildDefaultConfig(schema) {
  const config = {};
  if (!Array.isArray(schema)) return config;
  function walk(settings, target) {
    for (const s of settings) {
      if (s.settings) walk(s.settings, target);
      else if (s.id !== undefined) target[s.id] = s.default ?? '';
    }
  }
  for (const tab of schema) {
    if (tab.sections) {
      for (const section of tab.sections) {
        if (section.settings) walk(section.settings, config);
      }
    }
  }
  return config;
}

function buildReadme(storeName, os, widgetCount) {
  const isWin = os === 'windows';
  const pushCmd = isWin
    ? 'node scripts\\push.js widgets\\<widget-folder>'
    : 'node scripts/push.js widgets/<widget-folder>';
  const exampleCmd = isWin
    ? 'node scripts\\push.js widgets\\custom-slider'
    : 'node scripts/push.js widgets/custom-slider';

  return `# ${storeName} — Widget Templates

Downloaded ${widgetCount} widget template(s) from your BigCommerce store.

## Requirements
- Node.js 18 or higher
${isWin
  ? '  Download from https://nodejs.org (use the LTS installer)\n  After installing, open a new Command Prompt and run: node --version'
  : '  Install via Homebrew: brew install node\n  Or download from https://nodejs.org\n  Then run: node --version'}

## Folder structure
    widgets/
      <widget-name>/
        widget.html    ← Edit this to change the template markup
        schema.json    ← Edit this to change Page Builder settings
        config.json    ← Default values for testing
        widget.yml     ← Stores the UUID — do not delete this

## Editing a widget
1. Open \`widgets/<widget-name>/widget.html\` in your code editor
2. Make your changes and save
3. Push back to your store (see below)

## Pushing changes back to BigCommerce
\`\`\`
${pushCmd}
\`\`\`

Example:
\`\`\`
${exampleCmd}
\`\`\`

## Re-downloading all widgets
\`\`\`
${isWin ? 'node scripts\\download.js' : 'node scripts/download.js'}
\`\`\`

## Notes
- The .env file contains your store credentials — never commit it to git
- widget.yml in each folder contains the UUID that push.js uses to update the right template
- Changes go live on your store immediately after pushing
`;
}

async function buildAndDownloadZip() {
  const zip = new JSZip();
  const slug = state.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // .env — pre-filled with user's own credentials
  zip.file('.env',
    `BC_STORE_HASH=${state.storeHash}\n` +
    `BC_ACCESS_TOKEN=${state.accessToken}\n`
  );

  // package.json
  zip.file('package.json', JSON.stringify({
    name: `${slug}-widgets`,
    version: '1.0.0',
    type: 'module',
    scripts: {
      download: 'node scripts/download.js',
      push:     'node scripts/push.js',
    },
    engines: { node: '>=18' },
  }, null, 2));

  // README
  zip.file('README.md', buildReadme(state.storeName, state.os, state.widgets.length));

  // Scripts — fetch from server (they're plain text files)
  const [dlScript, pushScript] = await Promise.all([
    fetch('/api/scripts/download.js').then(r => r.text()),
    fetch('/api/scripts/push.js').then(r => r.text()),
  ]);
  zip.file('scripts/download.js', dlScript);
  zip.file('scripts/push.js',     pushScript);

  // Widget files
  const seenSlugs = new Map();
  for (const template of state.widgets) {
    let widgetSlug = toSlug(template.name);
    const count = seenSlugs.get(widgetSlug) ?? 0;
    seenSlugs.set(widgetSlug, count + 1);
    if (count > 0) widgetSlug = `${widgetSlug}-${count + 1}`;

    const base = `widgets/${widgetSlug}`;
    zip.file(`${base}/widget.html`,  template.template ?? '');
    zip.file(`${base}/schema.json`,  JSON.stringify(template.schema ?? [], null, 2));
    zip.file(`${base}/config.json`,  JSON.stringify(buildDefaultConfig(template.schema ?? []), null, 2));
    zip.file(`${base}/widget.yml`,
      `name: "${template.name}"\n` +
      `template_uuid: "${template.uuid}"\n` +
      `version_uuid: "${template.version_uuid ?? ''}"\n`
    );
  }

  // Generate and trigger download
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${slug}-widgets.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ============================================================
// Wizard UI
// ============================================================
window.addEventListener('DOMContentLoaded', initWizard);

function initWizard() {
  // Step 1 → 2
  document.getElementById('step1-next').addEventListener('click', () => {
    const name = document.getElementById('w-store-name').value.trim();
    if (!name) return shake('w-store-name', 'Please enter a store name.');
    state.storeName = name;
    state.os = document.querySelector('input[name="os"]:checked').value;
    goToStep(2);
  });

  // Step 2 → 3
  document.getElementById('step2-back').addEventListener('click', () => goToStep(1));
  document.getElementById('step2-next').addEventListener('click', () => {
    const hash = document.getElementById('w-store-hash').value.trim();
    if (!hash) return shake('w-store-hash', 'Please enter your store hash.');
    state.storeHash = hash;
    goToStep(3);
  });

  // Step 3 → connect
  document.getElementById('step3-back').addEventListener('click', () => goToStep(2));
  document.getElementById('step3-connect').addEventListener('click', connectAndFetch);

  // Show/hide token
  document.getElementById('toggle-token').addEventListener('click', () => {
    const input  = document.getElementById('w-access-token');
    const isHide = input.type === 'password';
    input.type   = isHide ? 'text' : 'password';
    document.getElementById('eye-icon').innerHTML = isHide
      ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  // Step 4: download + restart
  document.getElementById('wizard-download-btn').addEventListener('click', buildAndDownloadZip);
  document.getElementById('step4-restart').addEventListener('click', () => {
    Object.assign(state, { storeName: '', os: 'mac', storeHash: '', accessToken: '', widgets: [] });
    ['w-store-name', 'w-store-hash', 'w-access-token'].forEach(id => {
      document.getElementById(id).value = '';
    });
    hideError();
    goToStep(1);
  });

  // Enter keys
  document.getElementById('w-store-name').addEventListener('keydown',   e => { if (e.key === 'Enter') document.getElementById('step1-next').click(); });
  document.getElementById('w-store-hash').addEventListener('keydown',   e => { if (e.key === 'Enter') document.getElementById('step2-next').click(); });
  document.getElementById('w-access-token').addEventListener('keydown', e => { if (e.key === 'Enter') connectAndFetch(); });
}

function goToStep(n) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`wstep-${n}`).classList.add('active');
  document.querySelectorAll('.progress-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s === n) el.classList.add('active');
    if (s < n)   el.classList.add('done');
  });
  document.querySelector('.wizard-body').scrollTop = 0;
}

async function connectAndFetch() {
  const token = document.getElementById('w-access-token').value.trim();
  if (!token) return shake('w-access-token', 'Please paste your access token.');

  state.accessToken = token;
  hideError();
  setLoading(true);

  try {
    // 1. Validate
    const { status, data } = await validateCredentials();

    if (status !== 200) {
      setLoading(false);
      return showError(friendlyBcError(status, data));
    }

    // 2. Fetch all widgets
    const templates = await fetchAllWidgets();
    state.widgets = templates;

    setLoading(false);
    showSuccessStep(data.meta?.pagination?.total ?? templates.length, templates.length);

  } catch (err) {
    setLoading(false);
    showError('Network error — please check your connection and try again.');
    console.error(err);
  }
}

function buildClaudeHelpUrl() {
  const isWin = state.os === 'windows';
  const pushCmd = isWin
    ? 'node scripts\\push.js widgets\\<widget-folder>'
    : 'node scripts/push.js widgets/<widget-folder>';
  const prompt = `I downloaded BigCommerce widget templates using the Widget Customizations tool. I have a local folder with this structure:

widgets/
  <widget-name>/
    widget.html    ← the template markup
    schema.json    ← Page Builder settings
    config.json    ← default values
    widget.yml     ← stores the UUID

.env               ← BC_STORE_HASH and BC_ACCESS_TOKEN
scripts/push.js    ← pushes a widget back to BigCommerce
scripts/download.js

To push a widget I run:
  ${pushCmd}

My OS is ${isWin ? 'Windows' : 'Mac'}.

[Ask your question here — e.g. "How do I install Node.js?", "How do I open a terminal?", "Why is push.js giving an error?"]`;

  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}

function showSuccessStep(total, fetched) {
  const slug = state.storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const isWin = state.os === 'windows';

  document.getElementById('success-summary').textContent =
    `Connected to "${state.storeName}". Fetched ${fetched} widget template${fetched !== 1 ? 's' : ''}.`;

  document.getElementById('zip-name').textContent  = `${slug}-widgets.zip`;
  document.getElementById('zip-desc').textContent  =
    `${fetched} widget${fetched !== 1 ? 's' : ''} · scripts · pre-filled .env · README`;

  document.getElementById('push-instructions').textContent = [
    '# 1. Unzip and open a terminal in the folder',
    '',
    isWin
      ? '# 2. Edit a widget\n#    Open widgets\\<name>\\widget.html in any editor'
      : '# 2. Edit a widget\n#    Open widgets/<name>/widget.html in any editor',
    '',
    isWin
      ? '# 3. Push to your store\nnode scripts\\push.js widgets\\<widget-name>'
      : '# 3. Push to your store\nnode scripts/push.js widgets/<widget-name>',
  ].join('\n');

  document.getElementById('claude-help-btn').href = buildClaudeHelpUrl();

  goToStep(4);
}

// ---- UI helpers ----
function setLoading(on) {
  const btn     = document.getElementById('step3-connect');
  const label   = document.getElementById('connect-label');
  const spinner = document.getElementById('connect-spinner');
  btn.disabled       = on;
  label.textContent  = on ? 'Connecting…' : 'Connect & Fetch Widgets';
  spinner.classList.toggle('hidden', !on);
}

function showError(msg) {
  const el = document.getElementById('wizard-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
  document.getElementById('wizard-error').classList.add('hidden');
}

function friendlyBcError(status, data) {
  if (status === 401) return 'Invalid or expired token. Re-create it at Store Settings → API Accounts and make sure Content scope is set to Modify.';
  if (status === 403) return 'Access denied. Your plan may not include API access. You can get a free Developer Sandbox at partners.bigcommerce.com/partner-portal.';
  if (status === 404) return `Store hash "${state.storeHash}" was not found. Check your admin URL: https://store-XXXXX.mybigcommerce.com`;
  return data?.title ?? data?.error ?? `Unexpected error (HTTP ${status}). Please check your credentials and try again.`;
}

function shake(inputId, msg) {
  const el = document.getElementById(inputId);
  el.style.borderColor = 'var(--bc-red)';
  el.focus();
  const group = el.closest('.field-group');
  let hint = group.querySelector('.field-error');
  if (!hint) {
    hint = document.createElement('span');
    hint.className = 'field-error';
    hint.style.cssText = 'font-size:12px;color:var(--bc-red);';
    group.appendChild(hint);
  }
  hint.textContent = msg;
  setTimeout(() => { hint.textContent = ''; el.style.borderColor = ''; }, 3000);
}
