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

  ${BLUE}${BOLD}── Developer CLI${RESET} ${DIM}(full local workflow for developers)${RESET}
  ${BOLD}  npx bcw list${RESET}                  ${DIM}List all widgets in your store${RESET}
  ${BOLD}  npx bcw create <name>${RESET}          ${DIM}Scaffold a new widget${RESET}
  ${BOLD}  npx bcw dev widgets/<name>${RESET}     ${DIM}Live preview with schema controls${RESET}
  ${BOLD}  npx bcw push widgets/<name>${RESET}    ${DIM}Push widget to BigCommerce${RESET}
  ${BOLD}  npx bcw download${RESET}               ${DIM}Download widgets from your store${RESET}
  ${BOLD}  npx bcw delete widgets/<name>${RESET}  ${DIM}Delete widget from BigCommerce${RESET}

  ${DIM}Run ${RESET}${BOLD}npx bcw -h${RESET}${DIM} at any time to see all commands.${RESET}
  ${DIM}First run will ask for your Store Hash and API Token.${RESET}
`);
