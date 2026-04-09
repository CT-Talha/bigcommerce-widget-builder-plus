/**
 * BigCommerce Widget CLI — unified entry point
 *
 * Usage:
 *   npm run bc-widget -- <command> [args]
 *   npm run bc-widget -- -h
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
    npm run bc-widget -- <command> [args]

  Commands:
    create <name>            Scaffold a new widget with starter files
    dev    <widget-folder>   Start live preview server with schema controls
    push   <widget-folder>   Push a widget to your BigCommerce store
    download                 Download all widgets from your store

  Examples:
    npm run bc-widget -- create my-banner
    npm run bc-widget -- dev widgets/my-banner
    npm run bc-widget -- push widgets/my-banner
    npm run bc-widget -- download

  Options:
    -h, --help               Show this help message

  Notes:
    • New widgets (no UUID) are automatically POSTed to create them.
    • Existing widgets (have UUID) are PUTed to update them.
    • The dev server runs on port 4041 by default (set DEV_PORT to override).
    • The main server runs on port 4040 (set PORT to override).
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
    case 'create': {
      if (!args[0]) {
        console.error('\n  Error: widget name is required.');
        console.error('  Example: npm run bc-widget -- create my-banner\n');
        process.exit(1);
      }
      const { createWidget } = await import('./create.js');
      await createWidget(args[0]);
      break;
    }

    case 'dev': {
      if (!args[0]) {
        console.error('\n  Error: widget folder is required.');
        console.error('  Example: npm run bc-widget -- dev widgets/my-banner\n');
        process.exit(1);
      }
      const { startDev } = await import('./dev.js');
      await startDev(args[0]);
      break;
    }

    case 'push': {
      if (!args[0]) {
        console.error('\n  Error: widget folder is required.');
        console.error('  Example: npm run bc-widget -- push widgets/my-banner\n');
        process.exit(1);
      }
      spawnScript('push.js', args);
      break;
    }

    case 'download': {
      spawnScript('download.js', []);
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
