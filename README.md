# BigCommerce Widget Fetch

A web-based tool for downloading and managing BigCommerce widget templates. Built for agency teams — no technical knowledge required to use.

## What it does

- Connects to any BigCommerce store using a Store Hash and Access Token
- Downloads all custom widget templates as a ZIP file
- Each widget includes: `widget.html`, `schema.json`, `config.json`, `widget.yml`
- ZIP includes scripts to push edited widgets back to the store

## How to use

1. Open the tool URL in your browser
2. Enter your store name and select your OS
3. Enter your BigCommerce Store Hash
4. Enter your API Access Token → click Connect
5. Click **Download ZIP**
6. Extract the ZIP, edit widget files, then run the push script

## Pushing changes back to BigCommerce

**Mac / Linux:**
```bash
node scripts/push.js widgets/<widget-folder-name>
```

**Windows:**
```bash
node scripts\push.js widgets\<widget-folder-name>
```

> Node.js must be installed. Download from [nodejs.org](https://nodejs.org)

## Security

- Credentials are entered in the browser and **never stored on the server**
- The server acts as a blind proxy only — it forwards requests to BigCommerce and immediately discards all credentials
- Safe to deploy on shared hosting platforms (Railway, Render, etc.)

## Local development

```bash
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

> **Apple Silicon Mac:** use `arch -x86_64 /usr/local/bin/node server.js`

## Deployment (Railway)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo — Railway auto-detects Node.js
4. Go to **Settings → Networking → Generate Domain**
5. Share the URL with your team

## Environment variables

No environment variables are required on the server. All credentials are entered by the user in the browser.

## Tech stack

- **Server:** Node.js + Express (stateless proxy)
- **Frontend:** Vanilla JS, HTML, CSS
- **ZIP generation:** JSZip (runs entirely in the browser)
