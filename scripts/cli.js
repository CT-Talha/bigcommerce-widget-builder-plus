#!/usr/bin/env node
/**
 * BigCommerce Widget CLI — unified entry point
 *
 * Usage:
 *   npx bcw <command> [args]
 *   npx bcw -h
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [,, command, ...args] = process.argv;

const HELP = `
  ╔══════════════════════════════════════════════════╗
  ║       BigCommerce Widget CLI                     ║
  ╚══════════════════════════════════════════════════╝

  Usage:
    npx bcw <command> [args]

  ── Servers ────────────────────────────────────────
    node server.js
      Web UI at http://localhost:4040
      Download widgets from any store via browser

    npx bcw dev <name>
      Live preview at http://localhost:4041
      Build & preview a widget with schema controls

  ── Setup ──────────────────────────────────────────
    init <name>              Create a new client folder + save credentials
                             Then: cd <name> and use all commands below

  ── Commands (run from inside the client folder) ───
    list                     List all widgets in the store
    create <name>            Scaffold a new widget
    dev      <name>          Start live preview server
    validate <name>          Validate schema.json before pushing
    push     <name>          Validate + push widget to BigCommerce
    delete   <name>          Delete widget from BigCommerce
    download                 Download all widgets
    download --all           Download all widgets (explicit)
    download "<name>"        Download one widget by name
    download <number>        Download one widget by number

  ── Examples ───────────────────────────────────────
    npx bcw init acme           (run from project root)

    cd acme
    npx bcw list
    npx bcw download
    npx bcw create my-banner
    npx bcw dev my-banner
    npx bcw validate my-banner
    npx bcw push my-banner
    npx bcw delete my-banner

  ── Options ────────────────────────────────────────
    -h, --help               Show this help

  ── Ports ──────────────────────────────────────────
    Web UI      : 4040  (override: PORT=xxxx node server.js)
    Dev preview : 4041  (override: DEV_PORT=xxxx npx bcw dev ...)
`;

function spawnScript(scriptName, scriptArgs) {
  const scriptPath = path.join(__dirname, scriptName);
  const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  child.on('exit', code => process.exit(code ?? 0));
}

async function run() {
  switch (command) {

    case 'init': {
      const { initClient } = await import('./init.js');
      await initClient(args[0]);
      break;
    }

    case 'create': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Usage: npx bcw create <widget-name>\n');
        process.exit(1);
      }
      const { createWidget } = await import('./create.js');
      await createWidget(args[0]);
      break;
    }

    case 'dev': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Usage: npx bcw dev <name>\n');
        process.exit(1);
      }
      const { startDev } = await import('./dev.js');
      await startDev(args[0]);
      break;
    }

    case 'list': {
      const { fetchTemplates, printTable } = await import('./list.js');
      const templates = await fetchTemplates();
      printTable(templates);
      break;
    }

    case 'validate': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Usage: npx bcw validate <name>\n');
        process.exit(1);
      }
      const { validateSchema } = await import('./validate.js');
      const fs = await import('node:fs');
      const pathMod = await import('node:path');
      const cwd = process.cwd();
      const stripped = args[0].replace(/^widgets[\\/]/, '');
      const widgetDir = fs.default.existsSync(pathMod.default.resolve(cwd, stripped))
        ? pathMod.default.resolve(cwd, stripped)
        : pathMod.default.resolve(cwd, args[0]);
      const schemaPath = pathMod.default.join(widgetDir, 'schema.json');
      if (!fs.default.existsSync(schemaPath)) {
        console.error(`\n  Error: schema.json not found in ${widgetDir}\n`);
        process.exit(1);
      }
      let schema;
      try { schema = JSON.parse(fs.default.readFileSync(schemaPath, 'utf8')); }
      catch (e) { console.error(`\n  Error: schema.json is not valid JSON — ${e.message}\n`); process.exit(1); }
      console.log(`\n  Validating ${pathMod.default.basename(widgetDir)}/schema.json...`);
      const result = validateSchema(schema);
      const { errors, warnings } = result;
      if (errors.length === 0 && warnings.length === 0) {
        console.log(`\n  ✓  schema.json is valid\n`);
      } else {
        if (errors.length) {
          console.log(`\n  Errors (${errors.length}):`);
          for (const e of errors) { console.log(`\n  ✗  ${e.path}\n     ${e.message}`); }
        }
        if (warnings.length) {
          console.log(`\n  Warnings (${warnings.length}):`);
          for (const w of warnings) { console.log(`\n  ⚠  ${w.path}\n     ${w.message}`); }
        }
        console.log('');
        if (!result.ok) process.exit(1);
      }
      break;
    }

    case 'push': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Usage: npx bcw push <name>\n');
        process.exit(1);
      }
      spawnScript('push.js', args);
      break;
    }

    case 'delete': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Usage: npx bcw delete <name>\n');
        process.exit(1);
      }
      spawnScript('delete.js', args);
      break;
    }

    case 'download': {
      spawnScript('download.js', args);
      break;
    }

    case '-h':
    case '--help':
    default:
      console.log(HELP);
      break;
  }
}

run().catch(err => {
  console.error('\n  Unexpected error:', err.message, '\n');
  process.exit(1);
});
