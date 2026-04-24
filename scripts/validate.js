/**
 * Validate a widget's schema.json against BigCommerce's official rules.
 *
 * Usage:
 *   npx bcw validate <name>
 *   npx bcw validate my-banner
 *
 * Catches errors before they reach BigCommerce:
 *   - Invalid / unknown setting types
 *   - Missing required fields (id, type, label, entryLabel…)
 *   - range missing typeMeta.rangeValues
 *   - select missing typeMeta.selectOptions
 *   - visibility default not "show" or "hide"
 *   - array missing required top-level fields
 *   - Empty sections / settings arrays
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Valid types from the official BC widget-builder source ───────────────────
const VALID_SETTING_TYPES = new Set([
  'alignment', 'boolean', 'boxModel', 'code', 'color', 'element',
  'imageManager', 'input', 'number', 'productId', 'productImage',
  'range', 'regexInput', 'select', 'text', 'toggle', 'typography', 'visibility',
]);

const VALID_TOP_LEVEL_TYPES = new Set(['array', 'tab', 'hidden']);

// ── Error collector ──────────────────────────────────────────────────────────
class ValidationResult {
  constructor() {
    this.errors   = [];
    this.warnings = [];
  }

  error(path, message) {
    this.errors.push({ path, message });
  }

  warn(path, message) {
    this.warnings.push({ path, message });
  }

  get ok() {
    return this.errors.length === 0;
  }
}

// ── Validate a single setting object ────────────────────────────────────────
function validateSetting(setting, atPath, result) {
  // id is required
  if (!setting.id) {
    result.error(atPath, '"id" is required');
  }

  // type is required and must be valid
  if (!setting.type) {
    result.error(atPath, '"type" is required');
    return; // can't check type-specific rules without a type
  }

  if (!VALID_SETTING_TYPES.has(setting.type)) {
    result.error(
      atPath,
      `"${setting.type}" is not a valid setting type.\n     Valid types: ${[...VALID_SETTING_TYPES].join(', ')}`
    );
    return;
  }

  // label recommended for most types
  if (!setting.label && setting.type !== 'hidden') {
    result.warn(atPath, `"label" is missing (recommended for all settings)`);
  }

  // ── Type-specific rules ────────────────────────────────────────────────────

  if (setting.type === 'range') {
    const rv = setting.typeMeta?.rangeValues;
    if (!rv) {
      result.error(atPath, '"range" requires typeMeta.rangeValues: { min, max, step, unit }');
    } else {
      for (const key of ['min', 'max', 'step', 'unit']) {
        if (rv[key] === undefined || rv[key] === null || rv[key] === '') {
          result.error(atPath, `typeMeta.rangeValues.${key} is required for "range"`);
        }
      }
      if (typeof rv.min === 'number' && typeof rv.max === 'number' && rv.min >= rv.max) {
        result.error(atPath, `typeMeta.rangeValues.min (${rv.min}) must be less than max (${rv.max})`);
      }
    }
  }

  if (setting.type === 'select') {
    const opts = setting.typeMeta?.selectOptions;
    if (!opts || !Array.isArray(opts)) {
      result.error(atPath, '"select" requires typeMeta.selectOptions (array of { label, value })');
    } else if (opts.length === 0) {
      result.error(atPath, 'typeMeta.selectOptions must not be empty');
    } else {
      opts.forEach((opt, i) => {
        if (!opt.label) result.error(`${atPath}.typeMeta.selectOptions[${i}]`, '"label" is required');
        if (opt.value === undefined) result.error(`${atPath}.typeMeta.selectOptions[${i}]`, '"value" is required');
      });
    }
  }

  if (setting.type === 'visibility') {
    if (setting.default !== undefined && !['show', 'hide'].includes(setting.default)) {
      result.error(atPath, `"visibility" default must be "show" or "hide", got "${setting.default}"`);
    }
  }

  if (setting.type === 'boolean') {
    if (setting.default !== undefined && !['true', 'false', true, false].includes(setting.default)) {
      result.warn(atPath, `"boolean" default should be true, false, "true", or "false", got "${setting.default}"`);
    }
  }

  if (setting.type === 'imageManager') {
    if (setting.default !== undefined) {
      if (typeof setting.default !== 'object' || !setting.default.src) {
        result.warn(atPath, `"imageManager" default should be { src: "...", type: "IMAGE_MANAGER" }`);
      }
    }
  }
}

// ── Validate sections array (tab → sections → settings) ─────────────────────
function validateSections(sections, atPath, result) {
  if (!Array.isArray(sections) || sections.length === 0) {
    result.error(atPath, '"sections" must be a non-empty array');
    return;
  }

  sections.forEach((section, si) => {
    const sPath = `${atPath}[${si}]`;

    if (!Array.isArray(section.settings) || section.settings.length === 0) {
      result.error(`${sPath}.settings`, 'must be a non-empty array');
      return;
    }

    section.settings.forEach((setting, stI) => {
      validateSetting(setting, `${sPath}.settings[${stI}]`, result);
    });
  });
}

// ── Validate a tab element ───────────────────────────────────────────────────
function validateTab(tab, atPath, result) {
  if (!tab.label) result.error(atPath, '"label" is required on tab');
  validateSections(tab.sections, `${atPath}.sections`, result);
}

// ── Validate an array element ────────────────────────────────────────────────
function validateArray(item, atPath, result) {
  if (!item.id)         result.error(atPath, '"id" is required on array');
  if (!item.label)      result.error(atPath, '"label" is required on array');
  if (!item.entryLabel) result.error(atPath, '"entryLabel" is required on array');

  if (!Array.isArray(item.schema) || item.schema.length === 0) {
    result.error(`${atPath}.schema`, 'must be a non-empty array of tab objects');
    return;
  }

  item.schema.forEach((tab, ti) => {
    const tabPath = `${atPath}.schema[${ti}]`;
    if (tab.type !== 'tab') {
      result.error(tabPath, `items inside array.schema must have type "tab", got "${tab.type}"`);
      return;
    }
    validateTab(tab, tabPath, result);
  });

  if (item.defaultCount !== undefined) {
    if (!Number.isInteger(item.defaultCount) || item.defaultCount < 1) {
      result.warn(atPath, `"defaultCount" should be a positive integer, got ${item.defaultCount}`);
    }
  }
}

// ── Validate a hidden element ────────────────────────────────────────────────
function validateHidden(item, atPath, result) {
  if (!Array.isArray(item.settings) || item.settings.length === 0) {
    result.error(`${atPath}.settings`, 'must be a non-empty array');
    return;
  }
  item.settings.forEach((setting, si) => {
    validateSetting(setting, `${atPath}.settings[${si}]`, result);
  });
}

// ── Main schema validator ────────────────────────────────────────────────────
export function validateSchema(schema) {
  const result = new ValidationResult();

  if (!Array.isArray(schema)) {
    result.error('schema', 'schema.json must be a JSON array at the root');
    return result;
  }

  if (schema.length === 0) {
    result.warn('schema', 'schema.json is empty — widget will have no Page Builder controls');
    return result;
  }

  schema.forEach((item, i) => {
    const atPath = `[${i}]`;

    if (!item.type) {
      result.error(atPath, '"type" is required. Must be "array", "tab", or "hidden"');
      return;
    }

    if (!VALID_TOP_LEVEL_TYPES.has(item.type)) {
      result.error(atPath, `"${item.type}" is not a valid top-level type. Must be "array", "tab", or "hidden"`);
      return;
    }

    if (item.type === 'array')  validateArray(item, atPath, result);
    if (item.type === 'tab')    validateTab(item, atPath, result);
    if (item.type === 'hidden') validateHidden(item, atPath, result);
  });

  return result;
}

// ── Resolve widget directory (same logic as push/delete) ────────────────────
function resolveWidgetDir(arg) {
  if (!arg) {
    console.error('\n  Usage: npx bcw validate <widget-name>\n');
    process.exit(1);
  }
  const cwd = process.cwd();
  const stripped = arg.replace(/^widgets[\\/]/, '');
  const candidates = [path.resolve(cwd, stripped), path.resolve(cwd, arg)];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
  }
  console.error(`\n  Error: Widget folder not found: ${arg}\n`);
  process.exit(1);
}

// ── Print results ────────────────────────────────────────────────────────────
function printResults(result, widgetName) {
  const { errors, warnings } = result;
  const total = errors.length + warnings.length;

  if (total === 0) {
    console.log(`\n  ✓  ${widgetName}/schema.json is valid\n`);
    return;
  }

  console.log('');

  if (errors.length) {
    console.log(`  Errors (${errors.length}):`);
    for (const e of errors) {
      console.log(`\n  ✗  ${e.path}`);
      console.log(`     ${e.message}`);
    }
    console.log('');
  }

  if (warnings.length) {
    console.log(`  Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`\n  ⚠  ${w.path}`);
      console.log(`     ${w.message}`);
    }
    console.log('');
  }

  if (errors.length) {
    console.log(`  schema.json has ${errors.length} error${errors.length > 1 ? 's' : ''} — fix before pushing.\n`);
  } else {
    console.log(`  schema.json is valid (${warnings.length} warning${warnings.length > 1 ? 's' : ''}).\n`);
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);

async function main() {
  const arg = process.argv[2];
  const widgetDir = resolveWidgetDir(arg);
  const schemaPath = path.join(widgetDir, 'schema.json');

  if (!fs.existsSync(schemaPath)) {
    console.error(`\n  Error: schema.json not found in ${widgetDir}\n`);
    process.exit(1);
  }

  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  } catch (e) {
    console.error(`\n  Error: schema.json is not valid JSON — ${e.message}\n`);
    process.exit(1);
  }

  const widgetName = path.basename(widgetDir);
  console.log(`\n  Validating ${widgetName}/schema.json...`);

  const result = validateSchema(schema);
  printResults(result, widgetName);

  if (!result.ok) process.exit(1);
}

if (process.argv[1] === __filename) {
  main().catch(err => {
    console.error('  Unexpected error:', err.message);
    process.exit(1);
  });
}
