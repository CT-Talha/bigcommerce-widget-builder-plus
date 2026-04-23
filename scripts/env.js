/**
 * Shared credential loader for CLI scripts.
 *
 * Walks up the directory tree from cwd to find a .env file.
 * This means commands work whether you're in:
 *   - the client folder:          cd talha-sandbox && npx bcw push ...
 *   - a subfolder of the client:  cd talha-sandbox/widgets && npx bcw push ...
 *   - the project root:           npx bcw push ...  (auto-detects client folder)
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

// ── Walk up from startDir to find the nearest .env ──────────────────────────
export function findEnvPath(startDir = ROOT) {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) break; // reached filesystem root
    dir = parent;
  }
  return null;
}

// ── Parse a .env file into process.env ───────────────────────────────────────
function parseAndApply(content) {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = t.slice(eq + 1).trim();
  }
}

// ── Update a single key in the nearest .env file ─────────────────────────────
export function updateEnvKey(key, value) {
  const envPath = findEnvPath();
  if (!envPath) return;
  let content = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  content = regex.test(content)
    ? content.replace(regex, `${key}=${value}`)
    : content + `\n${key}=${value}`;
  fs.writeFileSync(envPath, content, 'utf8');
}

// ── Main export — call this at the top of any CLI script ────────────────────
export async function loadEnv() {
  const envPath = findEnvPath();

  if (!envPath) {
    console.error('\n  Error: No .env file found.');
    console.error('  Make sure you are inside a client folder.\n');
    console.error('  To create a new client:');
    console.error('    npx bcw init <client-name>\n');
    console.error('  To use an existing client:');
    console.error('    cd <client-name>\n');
    process.exit(1);
  }

  parseAndApply(fs.readFileSync(envPath, 'utf8'));

  const missing = ['BC_STORE_HASH', 'BC_ACCESS_TOKEN'].filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n  Error: missing in .env: ${missing.join(', ')}`);
    console.error(`  Edit ${envPath} and add the missing values.\n`);
    process.exit(1);
  }
}
