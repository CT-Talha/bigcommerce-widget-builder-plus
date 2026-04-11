# BigCommerce Widget Builder Plus

A web-based tool and developer CLI for downloading, creating, previewing, and managing BigCommerce widget templates. Built for agency teams — the web UI requires no technical knowledge, while the CLI gives developers a full local workflow.

---

## Features

- **Web UI** — download all store widgets as a ZIP with one click (no setup needed)
- **Developer CLI (`npx bcw`)** — create, preview, push, and delete widgets from the terminal
- **Live preview server** — render widgets locally with real-time Page Builder-style controls
- **Auto-reload** — edit `widget.html`, `schema.json`, or `config.json` and the preview updates instantly
- **First-run setup** — automatically prompts for credentials on first use and saves them to `.env`

---

## Project Structure

```
bigcommerce-widget-fetch/
  server.js              ← Web UI proxy server (port 4040)
  package.json
  .env                   ← Auto-created on first CLI use (credentials)

  scripts/
    cli.js               ← CLI entry point (npx bcw)
    create.js            ← Scaffold a new widget
    dev.js               ← Live preview server (port 4041)
    push.js              ← Push widget to BigCommerce
    delete.js            ← Delete widget from BigCommerce
    download.js          ← Download widgets from store
    list.js              ← List all store widgets
    env.js               ← Shared credential loader

  widgets/
    <widget-name>/
      widget.html        ← Template markup (BigCommerce Handlebars)
      schema.json        ← Page Builder settings schema
      config.json        ← Default field values for local preview
      widget.yml         ← Stores widget UUID (managed automatically)
```

---

## Web UI Setup

Use this if you want to download widgets through a browser interface without using the CLI.

### Requirements

- [Node.js](https://nodejs.org) v18 or higher

### 1. Clone and install

```bash
git clone https://github.com/CT-Talha/bigcommerce-widget-fetch.git
cd bigcommerce-widget-fetch
npm install
```

### 2. Start the server

```bash
node server.js
```

### 3. Open in browser

```
http://localhost:4040
```

### 4. How to use

1. Enter your **BigCommerce Store Hash** and **API Access Token** → click **Connect**
2. Your widgets will be listed
3. Click **Download ZIP** to export all widgets
4. Each widget in the ZIP includes `widget.html`, `schema.json`, `config.json`, and `widget.yml`

---

## Developer CLI

The CLI (`npx bcw`) gives developers a full local workflow for building and managing widgets.

### Requirements

- [Node.js](https://nodejs.org) v18 or higher
- A BigCommerce Store Hash and API Access Token

### Install

```bash
git clone https://github.com/CT-Talha/bigcommerce-widget-fetch.git
cd bigcommerce-widget-fetch
npm install
```

### First-time credentials setup

When you run any CLI command that needs your store credentials, the tool will automatically detect if a `.env` file is missing and prompt you to enter your Store Hash and Access Token. They are saved to `.env` locally and never sent anywhere except directly to BigCommerce.

---

## CLI Commands

### `npx bcw -h` — Show help

```bash
npx bcw -h
```

---

### `npx bcw list` — List all widgets

Lists all widget templates in your store with their names and UUIDs.

```bash
npx bcw list
```

---

### `npx bcw create <name>` — Scaffold a new widget

Creates a new widget folder under `widgets/<name>/` with starter files ready to edit.

```bash
npx bcw create my-banner
```

Generated files:

| File | Purpose |
|---|---|
| `widget.html` | Starter template with a simple text block |
| `schema.json` | Basic schema (title, body, colors) |
| `config.json` | Default values for local preview |
| `widget.yml` | Empty UUID — push will create a new widget |

---

### `npx bcw dev <widget-folder>` — Live preview server

Starts a local preview server at `http://localhost:4041` for the specified widget. Renders your widget with Page Builder-style controls generated from `schema.json`. Automatically reloads when you save any file.

```bash
npx bcw dev widgets/my-banner
```

- Controls are generated from `schema.json` — supports `input`, `color`, `range`, `select`, `visibility`, `array`
- `config.json` provides the default data for the preview
- Edit `widget.html`, `schema.json`, or `config.json` and the preview reloads automatically
- The iframe grows to fit widget content — no clipping when items expand
- Port defaults to `4041` — override with `DEV_PORT=5000 npx bcw dev widgets/my-banner`

---

### `npx bcw push <widget-folder>` — Push widget to BigCommerce

Pushes the widget to your store. If the widget has no UUID (new widget), it is created via `POST`. If it already has a UUID, it is updated via `PUT`. The UUID is automatically saved to `widget.yml` after creation.

```bash
npx bcw push widgets/my-banner
```

---

### `npx bcw download` — Download widgets from store

Downloads widgets from your BigCommerce store and saves them to the `widgets/` folder.

```bash
# Download all widgets
npx bcw download
npx bcw download --all

# Download one widget by partial name match
npx bcw download "my-banner"

# Download one widget by number (from npx bcw list)
npx bcw download 3
```

---

### `npx bcw delete <widget-folder>` — Delete widget from BigCommerce

Deletes the widget from BigCommerce after a `yes/no` confirmation. The local folder is **not** deleted. The UUID in `widget.yml` is automatically cleared — so running `npx bcw push` afterwards will create the widget fresh.

```bash
npx bcw delete widgets/my-banner
```

---

## Widget Template Syntax

BigCommerce widgets use a subset of Handlebars. Use these patterns in `widget.html`:

```handlebars
{{field}}                              ← output a field value
{{#if show_title '===' 'show'}} ... {{/if}}   ← equality check (visibility fields)
{{#if title}} ... {{else}} ... {{/if}}         ← truthy check
{{#each faq_items}} {{question}} {{/each}}     ← loop over an array field
{{@index}}                             ← current loop index (0-based)
{{../parentField}}                     ← access parent data inside #each
```

---

## Schema Types

Supported `schema.json` field types:

| Type | Description |
|---|---|
| `input` | Single-line text field |
| `color` | Colour picker |
| `range` | Slider — requires `typeMeta.rangeValues` with `min`, `max`, `step`, `unit` |
| `select` | Dropdown — requires `typeMeta.selectOptions` array |
| `visibility` | Show/Hide toggle — value is the string `"show"` or `"hide"` |
| `array` | Repeatable group of fields — must be at the **top level** of schema |
| `tab` | Groups sections in Page Builder — use for non-array settings |

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

Arrays must be at the top level of `schema.json` and use a `tab → sections → settings` structure inside:

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
        "sections": [
          {
            "settings": [
              { "type": "input", "id": "question", "label": "Question", "default": "Your question here" },
              { "type": "input", "id": "answer",   "label": "Answer",   "default": "Your answer here" }
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
4. Under **OAuth Scopes**, set **Content** to `modify`
5. Copy the **Store Hash** (from the URL or the credential page) and the **Access Token**

---

## Security

- Credentials entered in the Web UI are **never stored on the server** — the server is a stateless blind proxy
- CLI credentials are stored only in a local `.env` file on your machine
- The `.env` file is listed in `.gitignore` — it will never be committed to version control

---

## Ports

| Service | Default Port | Override |
|---|---|---|
| Web UI server | `4040` | `PORT=xxxx node server.js` |
| Dev preview server | `4041` | `DEV_PORT=xxxx npx bcw dev ...` |

---

## Tech Stack

- **Server:** Node.js + Express (stateless proxy)
- **Frontend:** Vanilla JS, HTML, CSS
- **ZIP generation:** JSZip (runs entirely in the browser)
- **CLI:** Node.js ESM, `npx`-compatible via `package.json` `bin` field
- **Live reload:** Server-Sent Events (SSE) + `fs.watch`
- **Iframe resize:** `ResizeObserver` + `postMessage`
