# BigCommerce Widget Builder

A web-based tool and developer CLI for downloading, creating, previewing, and managing BigCommerce widget templates. Built for agency teams — the web UI requires no technical knowledge, while the CLI gives developers a full local workflow with live preview.

---

## Features

- **Web UI** — download all store widgets as a ZIP with one click (no setup needed)
- **Developer CLI (`npx bcw`)** — create, preview, push, and delete widgets from the terminal
- **Multi-client support** — one installation, one folder per client store
- **Live preview server** — render widgets locally with real-time Page Builder-style controls
- **Auto-reload** — edit `widget.html`, `schema.json`, or `config.json` and the preview updates instantly
- **Duplicate protection** — push detects existing widgets by name, never creates duplicates

---

## Project Structure

```
bigcommerce-widget-builder/
  server.js              ← Web UI proxy server (port 4040)
  package.json
  scripts/
    cli.js               ← CLI entry point (npx bcw)
    init.js              ← Create a new client folder
    create.js            ← Scaffold a new widget
    dev.js               ← Live preview server (port 4041)
    push.js              ← Push widget to BigCommerce
    delete.js            ← Delete widget from BigCommerce
    download.js          ← Download widgets from store
    list.js              ← List all store widgets
    env.js               ← Credential loader (walks up directory tree)
    pack.js              ← Create distributable zip (npm run zip)

  acme/                  ← One folder per client (created by npx bcw init)
    .env                 ← Store credentials (never committed)
    my-banner/           ← Widget folders live directly here
      widget.html
      schema.json
      config.json
      widget.yml
    custom-slider/
      ...
```

---

## Installation

### Option A — From zip (share with your team)

```bash
# Build a distributable zip (run once from the project root)
npm run zip
# → bigcommerce-widget-builder.zip
```

Share the zip. Recipients:

```bash
unzip bigcommerce-widget-builder.zip
cd bigcommerce-widget-builder
npm install
```

### Option B — Clone from GitHub

```bash
git clone https://github.com/CT-Talha/bigcommerce-widget-fetch.git
cd bigcommerce-widget-fetch
npm install
```

---

## Web UI

Use this to download widgets through a browser — no credentials stored, no terminal needed.

```bash
node server.js
# Open http://localhost:4040
```

1. Enter your **Store Hash** and **Access Token** → click **Connect**
2. Your widgets are listed
3. Click **Download ZIP** to export all widgets as files

---

## Developer CLI — Quick Start

```bash
# 1. Create a client folder (run from the project root)
npx bcw init acme

# 2. Move into it
cd acme

# 3. Download all widgets from the store
npx bcw download

# 4. Start live preview for a widget
npx bcw dev my-banner

# 5. Push changes back to BigCommerce
npx bcw push my-banner
```

---

## Multi-Client Setup

Each client store gets its own folder. Credentials are stored per-folder in `.env` and never committed to git.

```bash
# From the project root — create one folder per client
npx bcw init acme
npx bcw init globex
npx bcw init initech

# Work on acme
cd acme
npx bcw list
npx bcw download

# Switch to another client
cd ../globex
npx bcw list
```

`npx bcw init` automatically:
- Creates the client folder
- Prompts for Store Hash and Access Token
- Saves credentials to `<client>/.env`
- Adds `/<client>` to `.gitignore`

---

## CLI Commands

Run all commands from **inside the client folder**.

### `npx bcw init <name>` — Create a client folder

```bash
npx bcw init acme
```

### `npx bcw list` — List all widgets in the store

```bash
npx bcw list
```

### `npx bcw download` — Download widgets from store

Downloads widgets directly into the current client folder.

```bash
npx bcw download           # download all widgets
npx bcw download --all     # same, explicit
npx bcw download "banner"  # download by partial name match
npx bcw download 3         # download by number (from list)
```

### `npx bcw create <name>` — Scaffold a new widget

```bash
npx bcw create my-banner
```

Creates `my-banner/` in the current folder with:

| File | Purpose |
|---|---|
| `widget.html` | Starter template with example fields |
| `schema.json` | Basic schema (title, body text, colors) |
| `config.json` | Default values for local preview |
| `widget.yml` | Empty UUID — push will create it on BigCommerce |

### `npx bcw dev <name>` — Live preview server

```bash
npx bcw dev my-banner
# Open http://localhost:4041
```

- Controls generated from `schema.json` — supports all field types
- Default values loaded from `config.json`
- Preview reloads automatically on any file save
- Override port: `DEV_PORT=5000 npx bcw dev my-banner`

### `npx bcw push <name>` — Push widget to BigCommerce

```bash
npx bcw push my-banner
```

- No UUID in `widget.yml` → creates a new widget (`POST`) and saves UUID
- UUID present → updates the existing widget (`PUT`)
- Searches BC by name before creating to prevent accidental duplicates

### `npx bcw delete <name>` — Delete widget from BigCommerce

```bash
npx bcw delete my-banner
```

- Prompts for confirmation before deleting
- Removes widget from BigCommerce only — local folder is kept
- Clears UUID from `widget.yml` so the next push creates it fresh

### `npx bcw -h` — Show help

```bash
npx bcw -h
```

---

## Widget Template Syntax

BigCommerce widgets use a subset of Handlebars. Supported patterns in `widget.html`:

```handlebars
{{field}}                                        Output a field value

{{#if field}} ... {{else}} ... {{/if}}           Truthy check

{{#if field '===' 'value'}} ... {{/if}}          Equality check (string)
{{#if field '===' true}} ... {{/if}}             Equality check (boolean)

{{#each items}} {{title}} {{/each}}              Loop over an array field
{{@index}}                                       Current loop index (0-based)
{{../parentField}}                               Access parent data inside #each
```

---

## Schema Types

Supported `type` values in `schema.json`:

| Type | Description |
|---|---|
| `input` | Single-line text input |
| `text` | Multi-line text input |
| `color` | Colour picker |
| `range` | Slider — requires `typeMeta.rangeValues` |
| `select` | Dropdown — requires `typeMeta.selectOptions` |
| `boolean` | Yes/No toggle |
| `imageManager` | Image picker |
| `visibility` | Show/Hide toggle — value is `"show"` or `"hide"` |
| `array` | Repeatable group of fields |
| `tab` | Groups sections inside array or at top level |

### `range` example

```json
{
  "type": "range",
  "id": "title_size",
  "label": "Title Size",
  "default": 28,
  "typeMeta": {
    "rangeValues": { "min": 14, "max": 64, "step": 1, "unit": "px" }
  }
}
```

### `array` example

Arrays must be at the **top level** of `schema.json` and contain `tab → sections → settings`:

```json
[
  {
    "type": "array",
    "id": "slides",
    "label": "Slides",
    "defaultCount": 3,
    "entryLabel": "Slide",
    "schema": [
      {
        "type": "tab",
        "label": "Content",
        "sections": [
          {
            "settings": [
              { "type": "input",        "id": "title",    "label": "Title",  "default": "Slide Title" },
              { "type": "imageManager", "id": "imageUrl", "label": "Image" },
              { "type": "boolean",      "id": "show_cta", "label": "Show Button", "default": "true" }
            ]
          }
        ]
      }
    ]
  }
]
```

---

## Getting BigCommerce API Credentials

1. Log in to your BigCommerce store admin
2. Go to **Settings → API → Store-level API Accounts**
3. Click **Create API Account → Create V2/V3 API Token**
4. Under **OAuth Scopes** set **Content** to `modify`
5. Copy the **Store Hash** and **Access Token**

---

## Security

- Web UI credentials are **never stored on the server** — it is a stateless proxy
- CLI credentials are stored only in `<client>/.env` on your local machine
- `**/.env` is in `.gitignore` — credentials can never be accidentally committed
- Each `npx bcw init` adds the client folder to `.gitignore` automatically

---

## Ports

| Service | Default | Override |
|---|---|---|
| Web UI | `4040` | `PORT=xxxx node server.js` |
| Dev preview | `4041` | `DEV_PORT=xxxx npx bcw dev <name>` |

---

## Tech Stack

- **Server:** Node.js + Express (stateless proxy)
- **Frontend:** Vanilla JS, HTML, CSS (no build step)
- **ZIP generation:** JSZip (runs entirely in the browser)
- **CLI:** Node.js ESM, `npx`-compatible via `package.json` `bin` field
- **Live reload:** Server-Sent Events (SSE) + `fs.watch`
- **Iframe resize:** `ResizeObserver` + `postMessage`
