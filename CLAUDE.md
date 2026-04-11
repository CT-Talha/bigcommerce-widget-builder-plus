# BigCommerce Widget Builder Plus — Project Context

This file gives Claude full context about this project so any new session can continue without re-explaining anything.

---

## What this project is

A tool for BigCommerce agency developers with two parts:

1. **Web UI** (`server.js` on port `4040`) — browser-based tool for downloading widgets from any BC store as a ZIP. No CLI needed. Credentials are entered in the browser and never stored server-side (blind proxy).

2. **Developer CLI** (`npx bcw`) — full local workflow for creating, previewing, editing, pushing, and deleting BC widgets.

---

## Tech stack

- Node.js ESM (`"type": "module"` in package.json)
- Express.js (proxy server + dev preview server)
- Vanilla JS/HTML/CSS (no frameworks)
- `npx bcw` binary via `bin` field in package.json → `scripts/cli.js`
- Live reload via Server-Sent Events (SSE) + `fs.watch`
- Iframe auto-resize via `ResizeObserver` + `postMessage`

---

## CLI commands

```bash
npx bcw list                        # List all store widgets (numbered)
npx bcw create <name>               # Scaffold new widget folder
npx bcw dev widgets/<name>          # Live preview server at localhost:4041
npx bcw push widgets/<name>         # POST (new) or PUT (existing) to BC
npx bcw delete widgets/<name>       # Delete from BC + clear UUID in widget.yml
npx bcw download                    # Download all widgets
npx bcw download --all              # Same as above
npx bcw download "<name>"           # Download by partial name match
npx bcw download <number>           # Download by number from list
npx bcw -h                          # Show help
```

---

## File structure

```
bigcommerce-widget-fetch/
  server.js              ← Web UI proxy (port 4040)
  package.json           ← bin: { bcw: ./scripts/cli.js }, postinstall script
  .env                   ← BC_STORE_HASH + BC_ACCESS_TOKEN (auto-created, gitignored)

  scripts/
    cli.js               ← Unified CLI entry point, dispatches to other scripts
    create.js            ← Scaffolds widgets/<name>/ with starter files
    dev.js               ← Live preview server (port 4041)
    push.js              ← POST (no UUID) or PUT (has UUID) to BC API
    delete.js            ← DELETE from BC API, then clears UUID in widget.yml
    download.js          ← Downloads widgets from BC, writes to widgets/
    list.js              ← Fetches + prints widget list, exported for download.js
    env.js               ← Shared credential loader (reads .env or prompts user)
    postinstall.js       ← Welcome message shown after npm install

  widgets/
    <widget-name>/
      widget.html        ← BC Handlebars template
      schema.json        ← Page Builder schema
      config.json        ← Default values for local dev preview
      widget.yml         ← template_uuid + version_uuid (managed automatically)
```

---

## Important behaviours

### push.js
- Empty `template_uuid` in `widget.yml` → `POST` (creates new widget)
- Non-empty UUID → `PUT` (updates existing widget)
- After POST, writes the new UUID back to `widget.yml` automatically

### delete.js
- Prompts `yes/no` confirmation before deleting
- After successful DELETE, clears `template_uuid` and `version_uuid` in `widget.yml` to empty strings
- Does NOT delete the local widget folder
- This means `npx bcw push` after `npx bcw delete` will correctly create a fresh widget

### env.js
- On first run (no `.env` file), interactively prompts for `BC_STORE_HASH` and `BC_ACCESS_TOKEN`
- Writes credentials to `.env`
- `.env` is gitignored — safe

### dev.js (preview server)
- Reads `widget.html`, `schema.json`, `config.json` from the widget folder
- Generates Page Builder-style controls from schema
- Renders widget using a custom Handlebars-like renderer (not actual Handlebars)
- Iframe auto-resizes via `ResizeObserver` + `postMessage` so accordion/expanding content isn't clipped
- SSE (`/events`) + `fs.watch` trigger live reload on file save
- Controls post to `/update` → returns re-rendered HTML
- SSE reload fetches `/render` → returns fresh HTML + controls HTML

---

## BC widget template syntax (used in widget.html)

```handlebars
{{field}}                                    direct field output
{{#if show_title '===' 'show'}} ... {{/if}}  equality check (for visibility fields)
{{#if title}} ... {{else}} ... {{/if}}       truthy check
{{#each faq_items}} {{question}} {{/each}}   loop over array field
{{@index}}                                   loop index (0-based)
{{../parentField}}                           access parent context inside #each
```

---

## BC schema types (validated from live testing)

| Type | Notes |
|---|---|
| `input` | Single-line text. Use instead of `textarea` (not valid in BC) |
| `color` | Colour picker |
| `range` | Requires `typeMeta.rangeValues: { min, max, step, unit }` |
| `select` | Requires `typeMeta.selectOptions: [{ value, label }]` |
| `visibility` | Returns string `"show"` or `"hide"` — NOT a boolean |
| `array` | Must be at **top level** of schema array, NOT inside a tab |
| `tab` | Groups sections. Use for non-array settings |
| `hidden` | Hidden field |

**Invalid types (confirmed from live BC testing):**
- `checkbox` — NOT valid
- `textarea` — NOT valid
- `boolean` — NOT valid

**Invalid Handlebars helpers in BC:**
- `(eq ...)` subexpression — NOT registered. Use `'==='` operator syntax instead

### Array schema structure (required format)
```json
[
  {
    "type": "array",
    "id": "faq_items",
    "label": "FAQ Items",
    "defaultCount": 3,
    "entryLabel": "question",
    "schema": [
      {
        "type": "tab",
        "label": "Content",
        "sections": [{ "settings": [ ...fields ] }]
      }
    ]
  },
  {
    "type": "tab",
    "label": "Settings",
    "sections": [ { "label": "Section", "settings": [ ...fields ] } ]
  }
]
```

### Range field format
```json
{
  "type": "range",
  "id": "title_size",
  "label": "Title Size",
  "default": 28,
  "typeMeta": { "rangeValues": { "min": 14, "max": 64, "step": 1, "unit": "px" } }
}
```

### Visibility field usage
```json
{ "type": "visibility", "id": "show_title", "default": "show" }
```
```handlebars
{{#if show_title '===' 'show'}} ... {{/if}}
```
In JS: `var isVisible = '{{show_title}}' === 'show';`

---

## Widgets built so far

### faq-accordion (`widgets/faq-accordion/`)
- FAQ accordion with expand/collapse per item
- Settings: title visibility, allow multiple open, title/question/answer colors and sizes, border color
- Schema: `array` at root (faq_items with question + answer), `tab` for Settings
- `config.json` has 7 sample FAQ items
- Known working and tested on live BigCommerce store

---

## Ports

| Service | Default | Override env var |
|---|---|---|
| Web UI | 4040 | `PORT` |
| Dev preview | 4041 | `DEV_PORT` |

---

## GitHub

Repo: `https://github.com/CT-Talha/bigcommerce-widget-fetch`
Branch: `main`

---

## Known quirks / things to remember

- `config.json` must be valid JSON — trailing commas will silently break the dev preview (loadConfig catches the parse error silently and falls back to schema defaults)
- After deleting a widget on BC and re-pushing, always make sure `widget.yml` has an empty UUID, otherwise push will 404
- The `dev.js` renderer is a custom regex-based renderer, not real Handlebars — complex helpers not in the supported list won't work in preview (but will work when pushed to BC)
- `visibility` type returns the string `"hide"` which is truthy in JS — always compare with `=== 'show'` not just a truthy check
