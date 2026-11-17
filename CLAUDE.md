# ContraClear: build brief for Claude Code

ContraClear reads signed contracts and tells a small-business owner, in plain English, what they owe, to whom and when. It shows the exact quote and page for every item, and it puts the dates on their calendar. It is free and open source, runs local-first, and is not legal advice.

This repo starts from a finished design. **The design is the spec.** Build what the boards show. Don't redesign them.

## Where the design lives
- `docs/final-design-prompt.md`: the product requirements. Every numbered item (1.1 to 15.2, plus the global rules) must be met.
- `design/boards/*.dc.html`: the screens as working HTML/CSS/JS prototypes. Open any of them in a text editor; the markup, the CSS and the `renderVals()` logic show the exact layout, copy, states and behaviour. Notes on reading them:
  - `{{hole}}` = a value from `renderVals()`; `<sc-if value>` = conditional; `<sc-for list as>` = loop.
  - They need the design tool's runtime (`support.js`) to render, so treat them as reference source, not as code to ship.
  - `Checklist.dc.html` maps every numbered requirement to a board, step and state. Use it as the acceptance list.
  - `FlowMap.dc.html` shows how the flows connect.
  - `Workspace1440.dc.html` is the core screen. Its `JS` block holds the real interaction model: review, conflicts, keyboard, trace, tracking, search, library.
  - The `F01`–`F14` and `FX` boards are flow prototypes. The dashed "Prototype" bar at their top is **not product UI**.
  - Files ending in `M` are the 390 px versions.
- `design/tokens.css`: colours, type, spacing, layout widths. Use these values; add no new colours.
- `design/fixtures/*.json`: sample data from the prototype (the Brightwell contract, its 15 items with quotes, pages, formulas and conflicts, plus the library and next-30-days lists). Use them as seed data and test fixtures.

## Non-negotiables
1. **Two main states.** The Drop state and the Workspace. Everything else is a panel, sheet, popover or the Cmd/Ctrl+K bar. No new full pages.
2. **Colour only for confidence.** Green "Both checks agree", yellow "Checks disagree: please confirm", red "Couldn't verify", always with an icon (Lucide) and the words.
3. **Two independent checks per item.** A rules check and an AI check. Show both. Never present a guess as fact. "Not found in this contract" is a real result.
4. **Every item carries its exact quote and page**, and selecting or hovering it instantly scrolls the preview to that quote. No page change, no travelling animation.
5. **Calendar only after review.** Nothing reaches a calendar until "Needs your check" is empty. The not-legal-advice note sits next to calendar creation and computed deadlines.
6. **Local-first privacy.** Files are read in the browser. The network badge shows the real bytes sent and stays at 0 in local modes. That means self-hosted fonts, no analytics, and no third-party requests in local modes. We store only the user's email.
7. **Keyboard-first.** Arrow keys move, Enter confirms, 1/2 picks a side in a conflict, E edits, Shift+Enter confirms all agreed, C goes to the calendar, Cmd/Ctrl+K searches and runs every command, Esc closes.
8. **Accessibility.** WCAG 2.2 AA, 44 px targets, visible 3 px focus, a full keyboard path, works at 200% zoom, a reduced-motion variant of every animation, and live regions for the badge, toasts and processing stages.
9. **One primary button per screen. Menus one level deep. No control that does nothing.**
10. **Never build:** pricing, plans, seats or roles, an onboarding tour, a settings maze (only the 7 settings in Flow 15), workflow builders, templates, e-sign, redlining, or a chatbot.

## Suggested architecture (confirm before starting)
- **App:** Vite + React + TypeScript, a single-page app. Plain CSS using `tokens.css`, one CSS module per component. Lucide icons.
- **Reading files:** PDF.js for PDFs (text layer plus page coordinates for the trace), mammoth for .docx, and Tesseract.js OCR for scans, with a per-page quality score.
- **Pipeline:** the stages in Flow 3, in this order: read → find clauses → rules check → AI check (important clauses only) → compare → compute deadlines (business days plus provincial holidays). The progress UI must reflect real stage events.
- **Engines:**
  - "Rules only": deterministic regex and grammar for money, dates and durations.
  - "On-device AI": WebLLM/WebGPU, a one-time model download, capability check, fallback to Rules only.
  - "Cloud AI with your own key": the user's key, stored in the vault. A redaction pass masks names, amounts and addresses. Show the preview and get approval before the first send.
- **Vault:** IndexedDB, AES-GCM encrypted. The key comes from a passkey (WebAuthn PRF extension) or a passphrase (Argon2id or PBKDF2), plus a one-time recovery key. It auto-locks after idle and can be exported and imported as an encrypted file.
- **Google (optional):** sign-in, the Drive Picker, Calendar (events tagged so re-sync updates instead of duplicating) and Sheets. Every Google feature has a non-Google fallback (folder access, .ics, CSV).
- **Hosting:** a static app under adarshsharma.ca. The only server piece is the email sign-in record.

## Build order
1. Tokens, the base components (button, chip, card, key cap, panel/sheet/popover, toast, network badge) and the Drop state.
2. The file reading and rules pipeline on the fixture contract, with the processing view driven by real stage events.
3. The Workspace: the three panes, the 90-day strip, the review flow (needs check / confirmed / not found / tracked / dismissed), conflict view, formula, trace, keyboard.
4. The vault (setup, recovery key, unlock, auto-lock, delete everything).
5. Search and commands (Cmd/Ctrl+K), the library tree and list, duplicates and amendments.
6. Calendar (.ics first, then Google), Export (CSV, .ics, handover PDF, vault file, then Sheets).
7. Engines (on-device, then cloud with the redaction preview), report-a-wrong-extraction, settings, the cross-cutting states, and the 390 px stacked layout.
8. An accessibility pass against `docs/final-design-prompt.md` and `Checklist.dc.html`.

## Open questions to raise with Adarsh before building
- Model choice and size for on-device AI (the design assumes about 380 MB).
- File limits (the design says 50 MB and 300 pages) and how long the email sign-in link stays valid (15 min in the design).
- Where the sign-in and email record lives, and how "Delete everything" removes it server-side.
- Google OAuth verification status; the "unverified app" copy is already designed.

## Build status (keep this current)
Run: `npm install`, `npm run dev`, `npm test`, `npm run build` (static output in `dist/`).

**Built and working**
- Flow 1 sign-in screen (email is stored on this device only; there is no server yet).
- Flow 12 vault: passphrase, one-time recovery key, unlock, wrong passphrase, recovery-key reset, auto-lock countdown, lock button, export/import vault file (merge or replace), delete everything, storage-blocked and corrupt states. AES-GCM + PBKDF2 in IndexedDB (`src/lib/vault.ts`).
- Flow 2 Drop state: whole-window drop, choose files, device folder with checklist, paste text, and the error states (.doc, wrong type, too large, too many pages, password PDF, French, scan, damaged).
- Flow 3 processing driven by real pipeline events, skip, cancel, batch queue with pause.
- Rules check (`src/lib/rules.ts`): amounts, recurring payments, term, renewal cancel-by with business days and provincial holidays, late interest, tax, notice periods, notice method, plus real "Not found" results.
- Flows 4 to 7, 13, 15: workspace, review, conflict view, formula, trace, track-this, keyboard, 90-day strip, portfolio, preview toolbar, library tree and list, drag to re-file, duplicate merge, Cmd/Ctrl+K search and commands, Next 30 days, the 7 settings.
- Flow 9 and 10: event preview and `.ics` (stable UIDs, so re-importing updates instead of duplicating), CSV, vault file.
- Network badge reads a real byte counter (`src/lib/net.ts`); the build ships a CSP that blocks every other origin; fonts are self-hosted.
- The design's Brightwell contract is available from Cmd/Ctrl+K as "Open the sample contract". It carries both checks, so it shows conflicts.

**Not built yet (each shows an honest "not in this version" state, never a dead control)**
- Google sign-in, Drive picker, Google Calendar, Sheets, handover pack (need an OAuth client and Google verification).
- Email sign-in link and the server-side email record (needs a small backend).
- On-device AI and cloud AI with redaction preview (so real contracts are "Rules check only" and every item waits for the user).
- OCR for scans, passkeys (WebAuthn PRF), keeping encrypted copies of original files (the setting is stored but nothing is kept).
- Flow 8 amendments and versions, Flow 14 report a wrong extraction, folder re-scan, meaning-based search.

**Deviations from the suggested architecture**
- One stylesheet (`src/styles/app.css`) assembled verbatim from the boards' CSS, instead of a CSS module per component. It keeps the build identical to the design.
- The preview shows the contract's text reflowed (as the boards do), not a rendered PDF canvas.
