# BigCommerce Widget Fetch

A web-based tool for downloading and managing BigCommerce widget templates. Built for agency teams — no technical knowledge required to use.

---

## What it does

- Connects to any BigCommerce store using a Store Hash and API Access Token
- Downloads all custom widget templates as a ZIP file
- Each widget includes: `widget.html`, `schema.json`, `config.json`, `widget.yml`
- The ZIP includes scripts to push edited widgets back to the store

---

## Local Setup

### Requirements

- [Node.js](https://nodejs.org) v18 or higher
- A BigCommerce Store Hash and API Access Token

### 1. Clone the repo

```bash
git clone https://github.com/CT-Talha/bigcommerce-widget-fetch.git
cd bigcommerce-widget-fetch
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

**Mac / Linux:**
```bash
node server.js
```

**Apple Silicon Mac (M1/M2/M3):**
```bash
arch -x86_64 /usr/local/bin/node server.js
```

**Windows:**
```bash
node server.js
```

### 4. Open in browser

```
http://localhost:4040
```

---

## How to use the tool

1. Enter your **store name** and select your **OS**
2. Enter your **BigCommerce Store Hash**
   - Found in: BigCommerce Admin → Settings → API → Store-level API Accounts
3. Enter your **API Access Token** → click **Connect**
4. Click **Download ZIP**
5. Extract the ZIP to a folder on your computer

---

## Editing and pushing widgets

After extracting the ZIP you will have this structure:

```
your-store/
  widgets/
    <widget-name>/
      widget.html     ← edit this (template markup)
      schema.json     ← Page Builder settings
      config.json     ← default values
      widget.yml      ← stores the widget UUID (do not edit)
  scripts/
    push.js           ← pushes a widget back to your store
    download.js       ← re-downloads all widgets
  .env                ← your store credentials (pre-filled)
  README.md
```

### Push a widget after editing

**Mac / Linux:**
```bash
node scripts/push.js widgets/<widget-folder-name>
```

**Windows:**
```bash
node scripts\push.js widgets\<widget-folder-name>
```

> Node.js must be installed to run these scripts. Download from [nodejs.org](https://nodejs.org)

---

## Getting your BigCommerce API credentials

1. Log in to your BigCommerce store admin
2. Go to **Settings → API → Store-level API Accounts**
3. Click **Create API Account → Create V2/V3 API Token**
4. Under **OAuth Scopes**, set **Content** to `modify`
5. Copy the **Store Hash** and **Access Token**

---

## Security

- Credentials are entered in the browser and **never stored on the server**
- The server acts as a blind proxy only — it forwards requests to BigCommerce and immediately discards all data
- Safe to run locally or deploy on any hosting platform

---

## Tech stack

- **Server:** Node.js + Express (stateless blind proxy)
- **Frontend:** Vanilla JS, HTML, CSS
- **ZIP generation:** JSZip (runs entirely in the browser — nothing uploaded to server)
