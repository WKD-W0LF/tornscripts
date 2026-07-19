# TWI Chain Alert Script — Plan

## Top-Level Overview

A new standalone Tampermonkey userscript (`TWI_Chain_Alert.user.js`) for Twilight-Reborn [56966].

It runs only on `factions.php` while the main faction tab (chain widget visible) is active. It polls the Torn API every 8 seconds using the player's own API key for the current faction chain count. When the chain count is **2 before** or **1 before** a bonus number (10, 25, 50, 100, 250, 500, 1000), an in-page banner is injected next to the chain widget with escalating urgency. The banner auto-hides once the chain count passes the bonus number. No browser notifications are used — banner only, works on desktop browser and TornPDA.

---

## Confirmed Decisions

| # | Decision |
|---|---|
| 1 | **New standalone script** — not part of `TWI_Faction_Calls_Universal.user.js` |
| 2 | **Runs on** `factions.php` main faction tab only (chain widget visible) |
| 3 | **Banner placement** — injected next to the chain widget |
| 4 | **Data source** — player's own Torn API key (entered in this script's settings), calls `GET /v2/faction/chain` |
| 5 | **Alert at -2** — amber warning: "⚠ Internal hits required — bonus at N in 2 hits!" |
| 6 | **Alert at -1** — red urgent: "🚨 Internal hits required — bonus at N NEXT HIT!" |
| 7 | **Auto-hide** — banner disappears when chain count passes the bonus number |
| 8 | **No manual dismiss** — no ✕ button |
| 9 | **Once-per-level tracking** — banner for a given bonus number does not re-appear if already shown at -2 and still visible at -1 (upgrades in place); clears after passing |
| 10 | **Poll rate** — 8 seconds (`POLL_MS = 8000`), same as faction calls script |
| 11 | **API key storage** — `localStorage` under prefix `twi-chain-alert-` |
| 12 | **ALLOWED_FACTION_ID** — 56966 |

---

## Constants

```
PREFIX               = "twi-chain-alert-"
POLL_MS              = 8000
ALLOWED_FACTION_ID   = 56966
BONUS_NUMBERS        = [10, 25, 50, 100, 250, 500, 1000]
TORN_API_BASE        = "https://api.torn.com"
```

---

## Sub-Tasks

---

### Sub-Task 1 — Script scaffold: header, constants, state, API key settings

**Intent:** Create `TWI_Chain_Alert.user.js` with its Tampermonkey header, constants, state object, localStorage helpers, and a minimal settings panel so members can enter their API key.

**Expected Outcomes:**
- File installs in Tampermonkey without errors on first load
- `@downloadURL` / `@updateURL` point to `TWI_Chain_Alert.user.js` on GitHub
- `@connect` includes `api.torn.com`
- `@match` targets `factions.php` only
- Player can enter and save their API key in the settings accordion
- API key is persisted to `localStorage` under `twi-chain-alert-api-key`

**Todo List:**
1. Create `TWI_Chain_Alert.user.js` with header:
   - `@name TWI Chain Alert`
   - `@namespace twilight-reborn`
   - `@version 1.0.0`
   - `@author WKD-W0LF`
   - `@description Chain bonus countdown alerts for Twilight-Reborn [56966]`
   - `@match https://www.torn.com/factions.php*`
   - `@match https://torn.com/factions.php*`
   - `@connect api.torn.com`
   - `@grant GM_addStyle`
   - `@grant GM_xmlhttpRequest`
   - `@run-at document-idle`
   - `@downloadURL https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js`
   - `@updateURL https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js`
2. Define constants: `PREFIX`, `POLL_MS`, `ALLOWED_FACTION_ID`, `BONUS_NUMBERS`, `TORN_API_BASE`
3. Define `state`: `{ apiKey, enabled, polling, chainCount: null, alertedFor: null, lastError: "" }`
   - `alertedFor` — the bonus number currently being shown in the banner (null = none)
4. Define localStorage helpers: `getApiKey()`, `setApiKey(v)`, `getEnabled()`, `setEnabled(v)`
5. Inject settings accordion (`<details id="twi-alert-settings">`) below the chain widget container; contains API key `<input>`, enable checkbox, save button, status line
6. Mount/unmount settings panel on tab navigation (same `ensureUI` pattern as faction calls)

**Relevant Context:**
- Copy `mountSettingsPanel` / `injectSettingsPanel` pattern from `TWI_Faction_Calls_Universal.user.js`
- Use same Torn accordion class: `accordion cont-gray border-round`
- Settings panel mounts inside `#factions` — check DOM exists before injecting
- API key is 16 characters, same validation as faction calls

**Status:** `[ ] pending`

---

### Sub-Task 2 — Page detection + banner DOM injection

**Intent:** Detect when the faction main tab with the chain widget is visible and inject the `#twi-alert-banner` element next to the chain widget. Remove it on other tabs.

**Expected Outcomes:**
- `#twi-alert-banner` element is present next to the chain widget when on the faction main tab
- Banner element is hidden (empty / display:none) when no alert is active
- Banner is removed when navigating away from the faction main tab
- Works with TornPDA hash-based navigation (`hashchange`)

**Todo List:**
1. Write `isChainPage()` — `location.pathname.endsWith("/factions.php")` AND `document.querySelector(".faction-chain-wrap, [class*='chain']")` exists AND NOT on war tab (`.faction-war` absent)
2. Write `findChainContainer()` — returns the element containing the chain widget; this is the insertion point for `#twi-alert-banner`
3. Write `ensureBannerEl()` — if `isChainPage()` and `#twi-alert-banner` not in DOM: create div, insert as sibling after chain widget container; if not chain page: call `removeBannerEl()`
4. Write `removeBannerEl()` — `document.getElementById("twi-alert-banner")?.remove()`; reset `state.alertedFor = null`
5. Set up `pageObserver` (MutationObserver on `document.body`, `childList: true, subtree: true`) calling `ensureBannerEl()` on each batch; filter own mutations by checking node id/class
6. `window.addEventListener("hashchange", () => { ensureBannerEl(); ensureUI(); })`

**Note:** Exact Torn DOM selector for chain widget must be confirmed during implementation. Initial probe: `document.querySelector(".faction-chain-wrap")` or `[class*='chain']`. The chain widget is on the default FACTION tab of `factions.php`.

**Relevant Context:**
- Same MutationObserver pattern as `TWI_Faction_Calls_Universal.user.js` `pageObserver`
- `isWarPage()` equivalent here is the inverse: chain page = faction tab = `.faction-war` NOT present

**Status:** `[ ] pending`

---

### Sub-Task 3 — Torn API polling for chain count

**Intent:** Poll `GET /v2/faction/chain` on the Torn API every 8 seconds using the player's own API key. Store the current chain count in state.

**Expected Outcomes:**
- `state.chainCount` updates every 8 seconds when enabled and on chain page
- Uses the same `GM_xmlhttpRequest` pattern as faction calls (TornPDA compatible — no `timeout`/`ontimeout` fields; manual `setTimeout` fallback instead)
- Rate-limit gate prevents concurrent or too-frequent requests
- Graceful error handling: sets `state.lastError`, updates status line in settings panel

**Todo List:**
1. Write `fetchChainCount()` — `GM_xmlhttpRequest` to `https://api.torn.com/v2/faction/chain?key=${state.apiKey}`; parses `{ chain: { current } }`; updates `state.chainCount`; calls `checkAlerts()`; on error sets `state.lastError`
2. Write `pollDue()` — same `Date.now() - lastPollTime >= POLL_MS` pattern
3. Write `throttledPoll()` — guard: `isChainPage() && state.enabled && state.apiKey && !state.polling && !pollDue() skipped`; sets `lastPollTime`; calls `fetchChainCount()`
4. `setInterval(throttledPoll, POLL_MS)`
5. `document.addEventListener("visibilitychange", ...)` — call `throttledPoll()` on resume from background
6. Update settings status line with current chain count and last error after each poll

**Relevant Context:**
- Torn API v2 faction chain endpoint: `GET https://api.torn.com/v2/faction/chain?key=<apiKey>`
- Response shape: `{ chain: { current: <number>, max: <number>, timeout: <seconds>, ... } }`
- Do NOT include `timeout` or `ontimeout` in `GM_xmlhttpRequest` options — causes silent failure in TornPDA; use manual `setTimeout` at 12000ms instead
- `@connect api.torn.com` required in header (added in Sub-Task 1)

**Status:** `[ ] pending`

---

### Sub-Task 4 — Alert logic + banner render

**Intent:** After each chain count update, check if the count is 1 or 2 below a bonus number and show/update/hide the banner accordingly.

**Expected Outcomes:**
- Banner shows amber warning at count -2: `"⚠ Internal hits required — bonus at N in 2 hits!"`
- Banner shows red urgent at count -1: `"🚨 Internal hits required — bonus at N NEXT HIT!"`
- Banner auto-upgrades from amber to red in place when count advances from -2 to -1 (no flicker)
- Banner auto-hides when chain count reaches or passes the bonus number
- No re-trigger for the same bonus number once passed (tracked via `state.alertedFor` clearing on pass)
- If chain count is 0 (chain ended / no active chain), banner is hidden

**Todo List:**
1. Write `checkAlerts()` — called after each successful `fetchChainCount()`:
   - If `state.chainCount === null || state.chainCount === 0`: call `hideBanner()`; return
   - Find nearest upcoming bonus: `BONUS_NUMBERS.find(n => n > state.chainCount)`
   - If none (count > 1000): call `hideBanner()`; return
   - `const diff = nextBonus - state.chainCount`
   - If `diff === 2`: call `showBanner(nextBonus, "warn")`
   - If `diff === 1`: call `showBanner(nextBonus, "urgent")`
   - If `diff <= 0 || diff > 2`: call `hideBanner()`
2. Write `showBanner(bonusNumber, level)`:
   - Calls `ensureBannerEl()` to guarantee the element exists
   - Sets `state.alertedFor = bonusNumber`
   - Updates `#twi-alert-banner` innerHTML and CSS class based on `level`:
     - `"warn"`: amber background, text `"⚠ Internal hits required — bonus at ${bonusNumber} in 2 hits!"`
     - `"urgent"`: red background, text `"🚨 Internal hits required — bonus at ${bonusNumber} NEXT HIT!"`
3. Write `hideBanner()`:
   - Sets `#twi-alert-banner` to empty / `display:none`
   - Sets `state.alertedFor = null`

**Relevant Context:**
- `BONUS_NUMBERS = [10, 25, 50, 100, 250, 500, 1000]` — sorted ascending, use `Array.find`
- Chain count = 0 means no active chain (Torn returns `current: 0` when chain is inactive)
- Banner element guaranteed to exist by `ensureBannerEl()` before `showBanner` writes to it

**Status:** `[ ] pending`

---

### Sub-Task 5 — CSS styling

**Intent:** Inject all CSS for the banner and settings panel using `GM_addStyle`.

**Expected Outcomes:**
- Amber warn banner is clearly visible, not obtrusive
- Red urgent banner is visually distinct and eye-catching
- Settings accordion matches the Torn UI style (same as faction calls script)
- Works on mobile (TornPDA) and desktop

**Todo List:**
1. `GM_addStyle(...)` — CSS for:
   - `#twi-alert-banner` — default hidden (`display:none`), padding, border-radius, font-weight bold, margin to sit neatly next to chain widget
   - `#twi-alert-banner.twi-alert-warn` — amber/gold background `#f6c344`, dark text `#3d2f00`, left border `4px solid #e6a800`
   - `#twi-alert-banner.twi-alert-urgent` — red background `#c92a2a`, white text, left border `4px solid #ff4444`, subtle pulse animation
   - `@keyframes twi-pulse` — opacity 1 → 0.75 → 1 over 1s, applied to `.twi-alert-urgent`
   - Settings accordion styles: reuse `.twi-settings-*` class names from faction calls script (copy verbatim) — avoids re-inventing the wheel and keeps visual consistency
2. Ensure banner has `min-width` so it doesn't collapse when text changes between warn/urgent

**Relevant Context:**
- Copy all `.twi-settings-*`, `.twi-btn-save`, `.twi-btn-secondary` CSS from `TWI_Faction_Calls_Universal.user.js` — these classes are safe to reuse as the two scripts can coexist on the same page
- `#twi-alert-banner` sits next to the chain widget in the faction main tab layout

**Status:** `[ ] pending`

---

## Open Items for Implementation

1. **Chain widget DOM selector** — exact class/ID for the chain widget on `factions.php` must be confirmed by inspecting live DOM during Sub-Task 2. Initial probes:
   - `document.querySelector(".faction-chain-wrap")`
   - `document.querySelector("[class*='chain']")`
   - Text search: element containing "Chain" heading text
2. **API key permissions** — the player's Torn API key needs `Faction` read access (public key type is sufficient for `GET /v2/faction/chain`). The settings panel hint should mention this.
