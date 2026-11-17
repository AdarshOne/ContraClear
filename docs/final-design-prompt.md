# ContraClear: Final Design Prompt (all flows and views)

Design the complete ContraClear product as a desktop-first web app, with a mobile version of each view. This replaces all earlier design prompts. Keep the existing visual language: black and white, with red, yellow and green used only for confidence (always with an icon and a label). Apply Japanese design principles throughout: ma (empty space), kanso (simplicity), shibui (understated), omotenashi (anticipating the user's needs). Less, but better. Utilitarian, not decorative.

For every flow below, deliver: the screens in order, the states each screen can be in, and a clickable prototype with the steps linked. Start with one flow map showing how all flows connect. End with a checklist showing where each numbered item was designed.

## Global rules
- Two main states: the Drop state and the Workspace. Everything else is a panel, sheet or command layered on these. Avoid new full pages.
- Workspace layout (1440 and 1920 wide): library on the left (narrow, collapsible), document preview in the centre, "What needs you" on the right, a thin 90-day timeline strip across the top. About 60% of the screen stays empty.
- One primary button per screen. No menus nested deeper than one level. No controls that do nothing.
- Keyboard-first: arrows move, Enter confirms, E edits, Shift+Enter confirms all agreed items, C exports to calendar, Cmd/Ctrl+K opens search and every command. Show shortcuts quietly, never as clutter.
- Plain English first, legal text one tap behind it. Reading level around grade 8.
- Accessibility: WCAG 2.2 AA, 44px touch targets, visible focus, complete keyboard path, colour never the only signal, usable at 200% zoom, reduced-motion variant of every animation.
- A live network badge is always visible in the corner: "Nothing leaves this device" with a bytes-sent count (0 in local modes).
- The "not legal advice" note appears where decisions happen (next to calendar creation and next to computed deadlines), not only in a footer.

## Flow 1: Welcome and sign-in (one screen)
1. Landing at the tool's address on adarshsharma.ca: one headline, one trust line ("Your contracts never leave your device. We only keep your email."), and the sign-in gate.
2. "Continue with Google" button, and a quieter "Use my email instead" with a single field (human-check shown only if needed).
3. A separate, UNCHECKED checkbox: "Email me occasional updates about ContraClear and new tools from Adarsh Sharma. I can unsubscribe anytime." It must be clear the tool works either way.
4. States: loading, invalid email, rate-limited, Google sign-in cancelled, network down, signed-in success.
5. After sign-in, go directly to the vault setup (Flow 12) the first time, then the Drop state.

## Flow 2: Add contracts (Drop state)
1. The whole window is the drop target. One line of text, one button ("Choose files"), the trust line, and a quiet row of sources: "Folder on this computer", "Google Drive", "Paste text".
2. States: drag-over, file accepted, wrong file type (including legacy .doc with a helpful message), file too large, too many pages, password-protected PDF, French-language contract ("English only for now", preview still available), multiple files dropped (starts the batch queue).
3. Choosing a device folder: permission explanation, folder picked, list of found files with checkboxes (all pre-selected), "Add 14 files".
4. Choosing from Google Drive: explanation line ("Choose folders or files in Drive to add them"), the Google file picker, confirmation. Include the first-time permission explanation and the "unverified app" warning explanation in plain language.
5. Pasting text: a simple text area with "Add".

## Flow 3: Processing (animations that tell the real story)
1. A staged progress view driven by real pipeline stages, never fake progress: Reading the pages, Finding the clauses, Checking dates and amounts (rules), Asking the AI only about the important clauses, Comparing both checks, Working out the real deadlines.
2. Each stage has a small meaningful animation (pages turning into clause blocks, items flying into Money, Dates and Duties trays that become the sections of the workspace). The whole sequence is skippable and under 8 seconds for a typical contract.
3. Scan-quality screen for scanned files: a per-page quality meter with plain advice ("Page 4 looks blurry. Rescan for better results"), and options "Continue anyway" or "Add a better copy".
4. Batch queue for many files: a compact list with per-file state (waiting, reading, done, needs attention), pause and cancel, and the ability to open finished files while others continue.
5. States: success, partial success, failed file with reason, cancelled.

## Flow 4: The workspace and the Review flow
1. Right pane "What needs you", in plain English, grouped as:
   - "Needs your check" (expanded): items where the two checks disagree or one could not verify.
   - "Confirmed by both checks" (collapsed to one line, e.g., "12 confirmed by both checks"), expandable.
   - "Not found in this contract" (an explicit state, e.g., no renewal clause found), each with "Track this" and search suggestions.
2. Item card: plain-English sentence, who owes whom, amount, due date, the confidence status (green "Both checks agree", yellow "Checks disagree: please confirm", red "Couldn't verify"), and the exact quote with page.
3. Computed date explanation: show the formula ("Renews Mar 1, minus 60 days = Dec 31, business-day adjusted") with a small "How was this worked out?" expansion.
4. Conflict view: when the two checks disagree, show both answers side by side with their quotes and let the user pick one or edit.
5. Actions on each item: Confirm (Enter), Edit (E), "This is wrong" (opens an inline editor), Dismiss. Edits are remembered and shown in a small history.
6. Trace interaction: selecting or hovering an item instantly scrolls the preview to its exact quote and highlights it. No page change. A subtle zoom animation explains where it came from, skippable.
7. "Track this": the user selects any text in the preview and a small floating menu offers Date, Amount, or Duty, then a short form (title, who owes, reminder) creates a custom item anchored to that text.
8. Confirm all agreed: one key or button confirms everything both checks agree on.
9. 90-day strip: marks for deadlines and money, hover for details, click to focus the item.
10. Portfolio at a glance: one panel summarizing all contracts (total committed per year, what is due in 30, 60 and 90 days, what renews soon). It must fit one screen at 1440x900.

## Flow 5: Document preview
1. PDF and Word documents in the centre pane, with a clean toolbar: page navigation, zoom, thumbnails toggle, find in document, print, download original.
2. Highlight states: current item highlighted, other extracted items lightly marked, user-tracked text marked differently.
3. States: loading, scanned file with OCR text layer, unsupported element in a Word file (a quiet notice), file not available (needs to be re-added), very long document.
4. Mobile: preview becomes a full-screen sheet opened from an item.

## Flow 6: Library (a simple mini file explorer)
1. Left pane tree: All contracts, By counterparty, By type, By year, and Sources (This device, Google Drive, Dropped). Collapsible to icons.
2. List view with columns: name, counterparty, type, next deadline, status chip. One click opens it in the workspace.
3. Auto-organization needs no setup. The user can drag a contract to another counterparty or type to override, with a subtle "remembered" confirmation.
4. Duplicates and versions: "Same contract found in two places" with a one-click merge, and "Looks like an amendment of X" grouping with a "Latest" badge.
5. Re-scan a device folder: shows what is new or changed, with "Process 3 new files".
6. Empty library state: the Drop state. Library with only one contract: a calm single-row list.
7. Mobile: the library becomes the first stacked pane.

## Flow 7: Search and commands
1. Cmd/Ctrl+K opens a command bar: search across all contracts (keyword plus meaning), and commands (add files, export, switch engine, lock vault).
2. Search results show the quote, contract, page and a one-line plain-English summary. Filters as small chips (contract, type, date range).
3. States: no results (offer "Track this" or broaden), searching, recent searches.

## Flow 8: Amendments and versions
1. A contract timeline showing the original and its amendments, change orders and SOWs in order.
2. Items replaced by an amendment appear struck through with a one-line reason ("Replaced by Amendment 2, section 4"). The current effective version is clear.
3. When the tool does not understand an amendment's wording, show a "Please check this change" item rather than guessing.

## Flow 9: Calendar
1. Entry: "Add dates to my calendar" appears after review, never before. The "not legal advice" note sits next to it.
2. Connect Google Calendar: plain-language permission explanation, the Google consent step, the unverified-app warning explained, success.
3. Preview before creating: a list of the events that will be created, each showing the title ("Cancel by: Vendor, Service"), date, two reminders, and the description including the quote, clause and page, a link to the contract, and the formula. The user can untick any event.
4. Creating: progress with count, then success with "Undo" and "Open in Google Calendar".
5. Re-sync: changing an item updates its event instead of duplicating it. Dismissing an item offers to remove its event.
6. Fallbacks: if Google is not connected or not available, offer a downloadable .ics file with the same preview.
7. States: not connected, permission denied, token expired (quietly reconnect), partial failure with retry, quota error.

## Flow 10: Export and handover
1. Export panel (one panel, not a page): Google Sheets, CSV, calendar file (.ics), Handover pack (PDF and Sheets listing every obligation, who owns it and when it is due), and Encrypted vault file.
2. Google Sheets: permission explanation, creation progress, success with "Open sheet". Show the tabs it will create (Obligations, Deadlines, Money, Contracts).
3. A short preview of what each export contains before it is created.
4. States: Google not connected (offer CSV), export failed with retry, empty (nothing to export yet).

## Flow 11: Engine switcher (how the AI runs)
1. A small switcher in the workspace with three plain options and their cost shown: "Rules only (free)", "On-device AI (free)", "Cloud AI with your own key (pennies)".
2. On-device AI: shows the one-time download size before starting, a progress state, and a "your computer can't run this" fallback to Rules only. Note honestly that it is slower and less capable.
3. Cloud with your key: key entry with a plain explanation that the key is stored only in the encrypted vault. Before the first send, a redaction preview shows exactly what will be sent with names, amounts and addresses masked, and requires approval. A visible banner while cloud mode is active, and the network badge shows what was sent.
4. States: model downloading, model ready, model failed, key invalid, provider unavailable, cloud mode off.

## Flow 12: Vault and security
1. First-time setup: choose how to unlock (passkey if available, otherwise passphrase). Explain in one sentence what the vault is.
2. Recovery key: shown once, printable, with an explicit "I have saved this" step and a plain warning that losing it means losing the data.
3. Unlock screen: one action. Auto-lock after idle with a quiet countdown, and a lock button always available.
4. Share with a teammate: "Export vault file", with instructions to send the passphrase separately.
5. Import vault: file picker, unlock, merge or replace choice.
6. Delete everything: a confirmation that clearly lists what will be removed (local vault, email record) and requires typing a word to confirm.
7. A "What happens to my files?" panel written in plain language: step by step, where each file goes and when it is deleted.
8. States: wrong passphrase, passkey unavailable, recovery key used, vault corrupted, browser storage blocked, storage nearly full.

## Flow 13: Returning user home
1. When contracts exist, open on "Next 30 days": deadlines and money, sorted by what needs action next.
2. The drop zone shrinks to a compact bar at the top.
3. Quiet state when nothing is due: "Nothing needs you in the next 30 days."
4. A gentle prompt to connect the calendar if it has not been connected yet.

## Flow 14: Report a wrong extraction
1. "This is wrong" offers an optional "Help improve ContraClear" action.
2. A review screen shows exactly what would be shared (the quote and the correction, with names masked), with a clear "Nothing is sent until you approve" statement, and sends it as a public issue on the project page.
3. States: user declines, sent successfully, send failed.

## Flow 15: Settings (one small panel)
1. Only these: province (for holidays), default reminder timing, auto-lock time, engine choice, keep encrypted copies of files (on or off), sign out, delete everything.
2. No other settings. No tabs.

## Cross-cutting states to design
Offline (everything works except Google features), browser not supported (clear message and suggested browser), storage full, session expired, Google verification warning explained, loading skeletons for each pane, and an "empty" version of every list.

## Mobile
Design a 390px version of every flow using stacked panes: Library, then Contract, then Item. Preview is a full-screen sheet. The calendar and export flows become bottom sheets. Keep all trust and consent copy identical to desktop.

## Motion spec
Seven or fewer named animations, each answering a question: where did this come from (trace zoom), how was this date worked out (formula build-up), what is the tool doing (the staged processing), what changed (confirm and edit transitions), what will happen (calendar preview), is my data safe (lock and network badge). Each is skippable and has a reduced-motion variant. Nothing decorative.

## Deliverables
1. A flow map.
2. Desktop screens at 1440 and 1920 wide, plus a compact 1024 version, for every flow and state above.
3. Mobile screens at 390px.
4. A clickable prototype for each flow.
5. An updated style guide and component inventory.
6. A final checklist mapping every numbered item to a screen.

Hard constraints: no new colours, no marketing sections, no pricing or plan screens, no illustrations of people, no chatbot sidebar, no settings maze, no dashboard clutter.
