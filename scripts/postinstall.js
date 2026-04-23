#!/usr/bin/env node

const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';
const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const DIM   = '\x1b[2m';
const BLUE  = '\x1b[34m';

console.log(`
${CYAN}${BOLD}  ╔══════════════════════════════════════════════════════╗
  ║       BigCommerce Widget Builder Plus               ║
  ╚══════════════════════════════════════════════════════╝${RESET}

  ${BOLD}You're all set! Here's how to get started:${RESET}

  ${GREEN}${BOLD}── Web UI${RESET} ${DIM}(download widgets via browser — no CLI needed)${RESET}
  ${BOLD}  node server.js${RESET}
  ${DIM}  Then open http://localhost:4040${RESET}

  ${BLUE}${BOLD}── Developer CLI${RESET} ${DIM}(one folder per client)${RESET}
  ${BOLD}  npx bcw init <client>${RESET}          ${DIM}Create a client folder + save credentials${RESET}
  ${BOLD}  cd <client>${RESET}                    ${DIM}Switch into the client folder${RESET}
  ${BOLD}  npx bcw list${RESET}                   ${DIM}List all widgets in the store${RESET}
  ${BOLD}  npx bcw download${RESET}               ${DIM}Download widgets from the store${RESET}
  ${BOLD}  npx bcw create <name>${RESET}           ${DIM}Scaffold a new widget${RESET}
  ${BOLD}  npx bcw dev <name>${RESET}               ${DIM}Live preview at localhost:4041${RESET}
  ${BOLD}  npx bcw push <name>${RESET}              ${DIM}Push widget to BigCommerce${RESET}
  ${BOLD}  npx bcw delete <name>${RESET}            ${DIM}Delete widget from BigCommerce${RESET}

  ${DIM}Run ${RESET}${BOLD}npx bcw -h${RESET}${DIM} at any time to see all commands.${RESET}
`);
