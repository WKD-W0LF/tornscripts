# TWI Chain Hit Calling Script — Plan

## Top-Level Overview

A new standalone Tampermonkey userscript (`TWI_Chain_Calls.user.js`) for Twilight-Reborn [56966] that provides a shared chain hit queue visible to all faction members on the main faction page (`factions.php`).

Members request up to 6 hits and are assigned a sequential chain slot range (e.g. hits 47–52). The server tracks the current Torn chain count via the Torn API independently using the faction's existing API key. When a member's slot is reached they receive a browser notification + visual highlight. Admins can toggle between two modes (Assigned Slots vs Ready Queue) and manage missed slots. Chain timeout auto-clears the queue server-side.

Special chain numbers (10, 25, 50, 100, 250, 500, 1000) are bonus-point hits that admins can manually assign to specific faction members. These slots appear visually distinct (gold/star) in the queue.

The script shares the same API server and authentication system as `TWI_Faction_Calls_Universal.user.js`. All reusable patterns are copied from that script with a new prefix.

---

## Confirmed Decisions

| # | Decision |
|---|---|
| 1 | **API key** — use faction's existing API key stored in a new env var `TORN_FACTION_API_KEY` (WKD-W0LF to create and add to ConfigMap) |
| 2 | **Max hits per request** — 6 |
| 3 | **Chain timeout** — server auto-clears queue when chain count resets to 0 (detected by count dropping significantly) |
| 4 | **Mode B notifications** — members in Queue mode ARE notified when it's their turn |
| 5 | **Special queue numbers** — 10, 25, 50, 100, 250, 500, 1000 are gold/star slots that only admins can manually assign to a specific player |

---

## Architecture

```
[Torn API]          [API Server - every 30s]     [PostgreSQL]
faction chain  ───► pollTornChainCount()    ───► twi_chain_state
                    mark missed slots             twi_chain_slots
                    auto-clear on timeout         twi_chain_special_slots

[Client - every 8s]
GET /api/v2/chain/state
renderQueue()  ──► inject next to chain widget on factions.php
```

---

## Constants & Prefix

- `APP_NAME = "TWI - Chain Calling"` ✅ confirmed
- `PREFIX = "twi-chain-calls-"` — localStorage namespace (separate from faction calls)
- `API_BASE = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1"` ✅ confirmed — chain endpoints added as `/api/v2/chain/...`
- `ADMIN_IDS = new Set(["3647423","3917106","3658650","3855001","3926412","4152155","4157019"])` ✅ confirmed — note: includes `4157019` (WKD-W0LF), unlike the faction calls script
- `POLL_MS = 8000`
- `MAX_HITS = 6`
- `SPECIAL_NUMBERS = [10, 25, 50, 100, 250, 500, 1000]`

---

## Server Data Model

### Table: `twi_chain_state`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | always 1 (single row singleton) |
| chain_count | INTEGER | current chain count from Torn API |
| next_slot | INTEGER | next sequential slot to assign |
| mode | VARCHAR(16) | `"assigned"` or `"queue"` |
| active | BOOLEAN | chain is currently running |
| updated_at | TIMESTAMPTZ | last Torn API poll time |

### Table: `twi_chain_slots`
| column | type | notes |
|---|---|---|
| id | SERIAL PK | |
| player_id | BIGINT | |
| player_name | VARCHAR(64) | |
| slot_start | INTEGER | first hit number in block |
| slot_end | INTEGER | last hit number in block (= slot_start + hitCount - 1) |
| status | VARCHAR(16) | `"pending"`, `"active"`, `"done"`, `"missed"` |
| created_at | TIMESTAMPTZ | |

### Table: `twi_chain_special_slots`
| column | type | notes |
|---|---|---|
| chain_number | INTEGER PK | one of 10, 25, 50, 100, 250, 500, 1000 |
| player_id | BIGINT NULL | null = unassigned |
| player_name | VARCHAR(64) NULL | |
| status | VARCHAR(16) | `"unassigned"`, `"assigned"`, `"done"`, `"missed"` |
| assigned_at | TIMESTAMPTZ NULL | |

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/v2/chain/state | session | Chain state + slot queue + special slots |
| POST | /api/v2/chain/slots | session | Request N hits (1–6) — allocates next slot |
| DELETE | /api/v2/chain/slots/:id | session | Cancel own slot |
| PATCH | /api/v2/chain/state | session+admin | Toggle mode / reset queue |
| DELETE | /api/v2/chain/slots/:id/admin | session+admin | Admin clear any slot |
| PUT | /api/v2/chain/special/:number | session+admin | Assign player to special slot |
| DELETE | /api/v2/chain/special/:number | session+admin | Unassign special slot |

---

## Modes

### Mode A — Assigned Slots (default)
- Member requests N hits (1–6) → gets `slot_start` to `slot_end` assigned sequentially
- `next_slot` advances by N (skips special numbers — they are separate)
- Server polls Torn API every 30s → updates `chain_count`
- When `chain_count >= slot_start` AND status `pending` → status → `active` → notify member
- When `chain_count > slot_end` AND status still `active` → status → `missed` → admin alerted
- When chain times out (count drops to 0 or below previous count by >10) → auto-clear all slots, reset `next_slot = 1`, set `active = false`

### Mode B — Ready Queue
- Members click "Join Queue" (no hit count, `hitCount = 1`)
- Queue is ordered by `created_at`
- When `chain_count` advances to `slot_start` → member at front of queue notified
- Members ARE notified when it's their turn
- Admins can manually advance/clear

### Special Slots (both modes)
- Numbers 10, 25, 50, 100, 250, 500, 1000 are tracked separately
- Only admins can assign a player to a special slot via the UI
- Special slots are shown as gold ⭐ rows in the queue, sorted by number
- When `chain_count` reaches a special number → assigned player notified with special message
- Special slots persist across mode changes; cleared by Reset or individually

---

## UI Layout

Injected as a `<div id="twi-chain-queue">` immediately to the right of the chain widget in the blank space visible in the screenshot.

```
┌──────────────────────────────────────────┐
│ ⛓ TWI Chain Queue    [Assigned ↔ Queue] │  ← admin sees toggle
│ Chain: 46   Next: 47   ● ACTIVE          │
│ ──────────────────────────────────────── │
│ ⭐ Hit 50   Dellzie       ○ pending  [✕]  │  ← gold special slot
│ → YOU  47–52   ● ACTIVE       [cancel]   │  ← own slot highlighted
│   Leandria  53–58   ○ pending       [✕]  │  ← admin sees [✕] on all
│   WKD-🐺🐺🐺  59–62  ○ pending            │
│ ──────────────────────────────────────── │
│ [Request Hits]   [Assign Special ⭐]     │  ← admin sees assign button
└──────────────────────────────────────────┘
```

---

## Sub-Tasks

---

### Sub-Task 1 — Server: Database schema + chain state polling

**Intent:** Add the three new tables to PostgreSQL and a server-side interval that polls the Torn API for current chain count, marks missed slots, and auto-clears on timeout.

**Expected Outcomes:**
- All three tables exist after server start
- `chain_count` in DB stays within 30s of Torn API
- Slots are auto-promoted to `active` and `missed` server-side
- Queue auto-clears when chain times out
- Special slot rows pre-populated with the 7 special numbers (unassigned)

**Todo List:**
1. Add `initChainDatabase()` — CREATE TABLE IF NOT EXISTS for all three tables; INSERT default row into `twi_chain_state` (id=1, chain_count=0, next_slot=1, mode='assigned', active=false); INSERT the 7 special numbers into `twi_chain_special_slots` ON CONFLICT DO NOTHING
2. Add `pollTornChainCount()` — calls Torn API `GET /v2/faction/chain` using `process.env.TORN_FACTION_API_KEY`; reuses existing `fetchTornEndpoint()`
3. In `pollTornChainCount()`: detect timeout (new count < previous count by >10 OR chain.timeout <= 0) → call `autoResetChain()`
4. Add `autoResetChain()` — sets all slot statuses to history (clear table), resets `next_slot=1`, `active=false`, resets special slots to `unassigned`
5. Promote `pending` slots to `active` when `chain_count >= slot_start`
6. Promote `active` slots to `missed` when `chain_count > slot_end`
7. Add env var `TORN_FACTION_API_KEY` to OCP ConfigMap `torn-calls-config` in `discord-dev`
8. Call `setInterval(pollTornChainCount, 30000)` inside `start()`
9. Call `initChainDatabase()` inside `start()` (after existing `initialiseDatabase()`)

**Relevant Context:**
- `server.js` in `torn-calls` pod at `/opt/app-root/src/src/server.js`
- `fetchTornEndpoint(path, apiKey)` already defined — reuse with faction key
- Torn chain API response: `GET /v2/faction/chain` returns `{ chain: { current, max, timeout, modifier, cooldown } }`
- OCP: `oc patch configmap torn-calls-config -n discord-dev ...`

**Status:** `[ ] pending`

---

### Sub-Task 2 — Server: Chain API endpoints

**Intent:** Add the 7 new REST endpoints for chain state, slot management, and special slot assignment.

**Expected Outcomes:**
- `GET /api/v2/chain/state` returns full state including slots array and special slots array
- `POST /api/v2/chain/slots` allocates next N sequential slots (skipping special numbers)
- DELETE/PATCH/PUT endpoints enforce ownership and admin rules correctly
- Special slot assign/unassign works for admins only

**Todo List:**
1. `GET /api/v2/chain/state` — query both tables, return `{ chainCount, nextSlot, mode, active, updatedAt, slots: [...], specialSlots: [...] }`
2. `POST /api/v2/chain/slots` — validate `hitCount` 1–6; allocate `slot_start = next_slot`, advance `next_slot` by `hitCount` (skip any special numbers in the range); INSERT row; return updated state
3. `DELETE /api/v2/chain/slots/:id` — own slot only (player_id = session.sub); 404 if not found, 403 if not owner
4. `PATCH /api/v2/chain/state` — admin only; accepts `{ mode?, active?, reset? }`; if `reset=true` calls `autoResetChain()`
5. `DELETE /api/v2/chain/slots/:id/admin` — admin only; deletes any slot by id
6. `PUT /api/v2/chain/special/:number` — admin only; validate number is in SPECIAL_NUMBERS set; body `{ playerId, playerName }`; UPDATE row; return updated special slots
7. `DELETE /api/v2/chain/special/:number` — admin only; sets player_id=null, status='unassigned'
8. Build new image via `oc start-build` and restart deployment

**Relevant Context:**
- Append all endpoints after existing `app.delete("/api/v1/admin/calls")` in server.js
- `ADMIN_PLAYER_IDS` Set already defined — reuse
- `requireSession` middleware already defined — reuse
- `next_slot` skip logic: while `next_slot` is in SPECIAL_NUMBERS, increment by 1

**Status:** `[ ] pending`

---

### Sub-Task 3 — Client: Scaffold new userscript + shared utilities

**Intent:** Create `TWI_Chain_Calls.user.js` with its header, constants, state, and all shared utility functions copied/adapted from the faction calls script.

**Expected Outcomes:**
- File installs in Tampermonkey without errors
- `@downloadURL`/`@updateURL` point to correct GitHub raw URL
- Auth works using the same API server session system
- All modal dialogs work on desktop, TornPDA, and iOS

**Todo List:**
1. Create `TWI_Chain_Calls.user.js` with `@name TWI Chain Calls`, `@version 1.0.0`, same `@match`/`@connect`/`@grant` as faction calls; `@downloadURL` / `@updateURL` pointing to `TWI_Chain_Calls.user.js` on GitHub
2. Set `PREFIX = "twi-chain-calls-"`, `API_BASE` same URL, `ALLOWED_FACTION_ID = 56966`, `ADMIN_IDS` same set, `MAX_HITS = 6`, `SPECIAL_NUMBERS = new Set([10,25,50,100,250,500,1000])`, `DISPLAY_NAMES` same map
3. Copy verbatim from faction calls: `readJson`, `setEnabled`, `setApiKey`, `saveSession`, `clearSession`, `validSession`, `request` (GM_xmlhttpRequest wrapper), `createModal`, `showAlert`, `showConfirm`, `requestApiKey`, `authenticate`, `authRequest`, `isAdmin`
4. Define `state`: `{ apiKey, token, expiresAt, player, enabled, chainState: null, lastNotifiedSlotId: null, authenticating: null, polling: false, connected: false, lastError: "" }`
5. Copy `setInterval` / `visibilitychange` / `hashchange` scaffolding

**Relevant Context:**
- All source patterns in `TWI_Faction_Calls_Universal.user.js`
- `PREFIX` must differ from `"twi-faction-calls-"` so localStorage keys don't collide
- `state.lastNotifiedSlotId` used in Sub-Task 7 to avoid duplicate notifications

**Status:** `[ ] pending`

---

### Sub-Task 4 — Client: Chain page detection + DOM injection

**Intent:** Detect when the faction main page with chain widget is visible and inject `#twi-chain-queue` div into the blank space to the right of the chain widget.

**Expected Outcomes:**
- `#twi-chain-queue` appears next to chain widget on faction main tab
- Hidden/removed when on war tab, crimes tab, or other tabs
- Works with TornPDA hash-based navigation

**Todo List:**
1. Write `isChainPage()` — `location.pathname.endsWith("/factions.php")` AND chain widget element exists in DOM (selector TBD by inspection — likely `.faction-chain-wrap` or similar; fallback to text search for "Chain active")
2. Write `findChainContainer()` — returns the parent flex/grid container holding the chain widget; this is where `#twi-chain-queue` is inserted as a sibling
3. Write `ensureChainUI()` — if `isChainPage()` and `#twi-chain-queue` not present: create div, append to chain container; if not chain page: call `removeChainUI()`
4. Write `removeChainUI()` — `document.getElementById("twi-chain-queue")?.remove()`
5. Set up `pageObserver` (MutationObserver on `document.body`, `childList: true, subtree: true`) — call `ensureChainUI()` on each mutation batch; filter own mutations using element id check
6. `window.addEventListener("hashchange", ensureChainUI)` for TornPDA tab navigation
7. **Note:** Exact Torn DOM selector for chain widget must be confirmed by inspecting live `factions.php` during implementation — use `document.querySelector("[class*='chain']")` as initial probe

**Relevant Context:**
- From screenshot: chain widget is on the default FACTION tab, in a two-column layout; blank space is to the right
- The chain widget parent appears to be a flex row container
- Same `pageObserver` pattern as faction calls script

**Status:** `[ ] pending`

---

### Sub-Task 5 — Client: Poll + renderQueue

**Intent:** Poll the server every 8s for chain state and render the full queue UI including special slots.

**Expected Outcomes:**
- Queue renders within 8s of any state change on server
- Special slots rendered as gold ⭐ rows, sorted by chain number, above regular slots
- Active slot highlighted with green + "YOUR TURN" banner
- Missed slots shown in red (for admins and the affected member)
- Regular slot rows show: player display name, hit range, status dot, cancel/clear button

**Todo List:**
1. Write `refreshChainState()` — `GET /api/v2/chain/state` via `authRequest`; updates `state.chainState`; calls `renderQueue()`; calls `checkNotifications()`
2. Write `renderQueue()` — clears and rebuilds `#twi-chain-queue`:
   - Header: chain count, mode badge, admin mode toggle button (if admin)
   - Special slot section: gold rows for each of 7 special numbers; show assigned player or "— unassigned —" with assign button (admin only)
   - Divider
   - Regular slots: each row shows display name, hit range `X–Y`, status dot, cancel (own) or ✕ (admin)
   - "YOUR TURN" banner above own active slot
   - Footer: "Request Hits" button (disabled if already have a pending/active slot)
3. Write `scheduleRender(delay=80)` and `throttledRefresh()` — copy exact pattern from faction calls script
4. `setInterval(throttledRefresh, POLL_MS)`, `visibilitychange` listener
5. Mode B (queue): show position number next to each slot row ("Queue position: 3")

**Relevant Context:**
- `DISPLAY_NAMES` map used here for player name display
- `state.chainState.specialSlots` is array of `{ chainNumber, playerId, playerName, status }`
- `state.chainState.slots` is array of `{ id, playerId, playerName, slotStart, slotEnd, status }`

**Status:** `[ ] pending`

---

### Sub-Task 6 — Client: Request hits + cancel + admin slot management

**Intent:** Wire up all interactive buttons — request hits, cancel own slot, admin clear, and admin assign special slot.

**Expected Outcomes:**
- "Request Hits" button prompts for count (1–6), allocates slot, re-renders
- Cancel button on own slot releases it
- Admin ✕ button clears any slot
- Admin "Assign ⭐" button on a special slot shows a player picker modal

**Todo List:**
1. Write `showHitCountPrompt()` — modal with `<input type="number" min="1" max="6">`; returns number or null; follows `requestApiKey` pattern
2. Write `requestSlot(n)` — `POST /api/v2/chain/slots { hitCount: n }`; update `state.chainState`; call `renderQueue()`
3. Wire "Request Hits" button → `showHitCountPrompt()` → `requestSlot(n)`
4. Write `cancelSlot(id)` — `DELETE /api/v2/chain/slots/:id`; re-render
5. Write `adminClearSlot(id)` — `DELETE /api/v2/chain/slots/:id/admin`; re-render
6. Write `showPlayerPickerModal()` — admin modal with text input for player name + player ID; submits to `PUT /api/v2/chain/special/:number { playerId, playerName }`; re-render
7. Write `adminUnassignSpecial(number)` — `DELETE /api/v2/chain/special/:number`; re-render
8. Mode B: "Request Hits" → "Join Queue"; skip `showHitCountPrompt()`, call `requestSlot(1)` directly

**Relevant Context:**
- Busy-state pattern: grey out the specific row/button during async ops
- `showPlayerPickerModal` needs to accept the `chainNumber` as context

**Status:** `[ ] pending`

---

### Sub-Task 7 — Client: Browser notifications

**Intent:** Fire a browser notification when own slot (regular or special) becomes active, with special messaging for bonus numbers.

**Expected Outcomes:**
- Permission requested on first script load (if not already granted)
- Notification fires exactly once when own slot goes `pending → active`
- Special slot notifications include "BONUS HIT" messaging
- No duplicate notifications across poll cycles
- TornPDA fallback if `Notification` API unavailable

**Todo List:**
1. On script init: `if (Notification?.permission === "default") Notification.requestPermission()`
2. Write `checkNotifications(prevState, newState)` — compare own slots between previous and new chainState
3. Detect `pending → active` transition on own regular slot → fire: `new Notification("⛓ TWI Chain — Your Turn!", { body: "Hit now! Hits X–Y" })`
4. Detect own special slot becoming `active` → fire: `new Notification("⭐ BONUS HIT — Chain ${N}!", { body: "You have a bonus hit at chain number ${N}!" })`
5. Track `state.lastNotifiedSlotId` (and `state.lastNotifiedSpecialNumber`) — only notify once
6. TornPDA fallback: `if (typeof GM_notification === "function") GM_notification(...)` else use `Notification` API

**Relevant Context:**
- `checkNotifications` called inside `refreshChainState()` BEFORE updating `state.chainState`
- Compare `prevState?.slots` with `newState.slots` to detect transitions

**Status:** `[ ] pending`

---

### Sub-Task 8 — Client: Admin controls

**Intent:** Admins see mode toggle, reset button, per-slot clear, per-special-slot assign/unassign, and missed slot alerts.

**Expected Outcomes:**
- Mode toggle button visible only to admins — switches between Assigned and Queue
- Reset button clears all slots and special assignments
- Missed slots show red "MISSED" badge — admins see this for ALL missed slots, regular members only see their own
- Admin assign/unassign on special slots works correctly

**Todo List:**
1. `isAdmin()` helper — copy from faction calls script, uses `ADMIN_IDS`
2. Mode toggle in `renderQueue()` header — `PATCH /api/v2/chain/state { mode: "assigned"|"queue" }`
3. Reset button — confirm dialog (`showConfirm`) then `PATCH { reset: true }`
4. Missed slot rows: regular members see only their own missed slot; admins see all missed slots with "MISSED" badge and ✕ button
5. Special slot admin controls: each unassigned special row has `[Assign]` button; each assigned row has `[Unassign]` button

**Relevant Context:**
- `showConfirm()` already in shared utilities (Sub-Task 3)
- All admin checks: `isAdmin()` on client + server enforces admin requirement on endpoints

**Status:** `[ ] pending`

---

### Sub-Task 9 — Client: Settings panel + CSS

**Intent:** Add settings accordion for API key + enable toggle, and inject all CSS for the chain queue UI.

**Expected Outcomes:**
- Settings panel injects on faction page with same styling as faction calls script
- Full CSS for queue UI: slot rows, gold special slots, active/missed/pending states, YOUR TURN banner, mode badge, responsive layout

**Todo List:**
1. `injectSettingsPanel()` — `<details>` accordion with API key input, enable checkbox, status line showing player name + ID + ⭐ Admin badge; mount below chain UI
2. `mountSettingsPanel()` — attaches to faction page; removes when off faction tab
3. `GM_addStyle(...)` — CSS for:
   - `#twi-chain-queue` — flex column, dark background, rounded, fits in blank space
   - `.twc-header` — chain count + mode badge row
   - `.twc-slot-row` — flex row, player name, hit range, status dot, button
   - `.twc-slot-active` — green left border + background tint
   - `.twc-slot-missed` — red left border + background tint
   - `.twc-slot-pending` — neutral
   - `.twc-slot-own` — bold player name, slightly brighter background
   - `.twc-special-row` — gold/amber left border, ⭐ prefix
   - `.twc-your-turn` — bright green banner "⚔ YOUR TURN — HIT NOW!"
   - `.twc-mode-badge` — small pill badge "ASSIGNED" or "QUEUE"
   - `.twc-btn` — reuse torn-btn styling
   - Copy all `.twi-modal-*` and `.twi-key-*` CSS from faction calls (modals are identical)
4. Mobile responsive at 900px breakpoint — stack queue below chain widget if no horizontal space

**Relevant Context:**
- CSS prefix `twc-` for chain-specific styles; modal styles use same `twi-modal-` prefix (copied verbatim)
- `#twi-chain-queue` sits in the blank space to the right of the chain widget — it needs `min-width` and `flex: 1` or similar to fill the space

**Status:** `[ ] pending`

---

## Open Items for Implementation

1. **`TORN_FACTION_API_KEY`** — WKD-W0LF needs to create a Torn API key with `Faction` access and add it to the OCP ConfigMap before Sub-Task 1 can be implemented:
   ```
   oc patch configmap torn-calls-config -n discord-dev ... TORN_FACTION_API_KEY=<key>
   ```
2. **Torn DOM selector for chain widget** — exact class/ID to be confirmed by inspecting `factions.php` live during Sub-Task 4 implementation. Initial probe: `document.querySelector("[class*='chain']")` or look for the element containing "Chain active" text.
3. **Player picker for special slots** — Sub-Task 6 uses a simple text input for player name + ID. Consider whether a dropdown of known faction members (from a cached `GET /calls` members list) would be better UX.
