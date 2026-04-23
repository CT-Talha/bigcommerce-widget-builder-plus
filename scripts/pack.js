/**
 * Creates a distributable zip of the tool.
 *
 * Usage:
 *   npm run zip
 *
 * Output:
 *   bigcommerce-widget-builder.zip
 *
 * The zip contains everything a new developer needs:
 *   scripts/, server.js, package.json, README.md
 *
 * Recipients just:
 *   1. Unzip
 *   2. npm install
 *   3. npx bcw init <client-name>
 */

import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_FILE = path.join(ROOT, 'bigcommerce-widget-builder.zip');

// Files/folders to include in the zip
const INCLUDE = [
  { type: 'directory', src: 'scripts',   dest: 'scripts'   },
  { type: 'file',      src: 'server.js', dest: 'server.js' },
  { type: 'file',      src: 'package.json', dest: 'package.json' },
  { type: 'file',      src: 'README.md', dest: 'README.md' },
];

async function pack() {
  // Remove old zip if it exists
  if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);

  const output  = fs.createWriteStream(OUT_FILE);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  for (const entry of INCLUDE) {
    const fullSrc = path.join(ROOT, entry.src);
    if (!fs.existsSync(fullSrc)) {
      console.warn(`  ⚠  Skipping missing file: ${entry.src}`);
      continue;
    }
    if (entry.type === 'directory') {
      archive.directory(fullSrc, entry.dest);
    } else {
      archive.file(fullSrc, { name: entry.dest });
    }
  }

  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });

  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`
  ✓  bigcommerce-widget-builder.zip created  (${kb} KB)

  Share this file with your team. They just need to:

    1.  Unzip it
    2.  cd bigcommerce-widget-builder
    3.  npm install
    4.  npx bcw init <client-name>
    5.  cd <client-name>
`);
}

pack().catch(err => {
  console.error('  Error creating zip:', err.message);
  process.exit(1);
});
