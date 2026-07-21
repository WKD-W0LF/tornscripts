// ==UserScript==
// @name         TWI Chain Alert
// @namespace    twilight-reborn
// @version      1.4.2
// @author       WKD-W0LF
// @description  Chain bonus countdown alerts for Twilight-Reborn [56966]. Settings on Torn preferences page. Banner visible on all Torn pages.
// @license      MIT
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @connect      api.torn.com
// @connect      torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// ==/UserScript==

// ── Changelog ────────────────────────────────────────────────────────────────
// v1.4.2 (2026-07-21) — TEMP: on-screen DOM diagnostic (twiDebugDumpDom) to
//   identify TornPDA's content-column selector. Remove this block once pinned.
// v1.4.1 (2026-07-21) — TornPDA (iOS) settings-panel placement fix
//   - Root cause: the panel was inserted as a *sibling* after #react-root
//     (or appended to document.body). On iOS Safari that lands in the empty
//     area below the "General settings" card, but inside TornPDA's WKWebView
//     the SPA re-renders after our first inject and/or the react-root sibling
//     ends up outside the visible content column, so the panel never showed.
//   - Fix: the panel is now inserted INTO the main content column
//     (#mainContainer / .content-wrapper / [role=main] / react-root, first
//     that exists) as its last child, so it inherits the page width and flows
//     directly beneath the General settings card on every platform.
//   - injectSettingsPage() is now self-healing: the 2s interval re-attaches the
//     panel if TornPDA's SPA re-render detaches it, instead of the old
//     "inject once and never touch again" guard.
//   - Added addStyle() wrapper: falls back to a <style> element if GM_addStyle
//     is unavailable/flaky in the embedded webview.
// v1.3.2 (2026-07-20) — updated by Claude Sonnet
//   - Cross-platform hardening pass (Apple/Android mobile+tablet, Safari/
//     Chrome/Firefox desktop):
//   - Added lsGet/lsSet/lsRemove helpers; every localStorage read/write now
//     wrapped in try/catch so storage failures (Safari private-mode edge
//     cases, storage-restricted embedded webviews) can't throw and break
//     the script.
//   - Banner now adds `env(safe-area-inset-top)` padding so it clears the
//     notch/status bar when Torn is opened as an iOS home-screen web app.
//   - ensureBannerEl() now falls back to document.documentElement if
//     document.body isn't available yet.
// ──────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  const API_BASE        = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const TORN_API_BASE   = "https://api.torn.com";
  const ALLOWED_FACTION_ID = 56966;
  const ADMIN_IDS       = new Set(["3647423","3917106","3658650","3855001","3926412","4152155","4157019"]);
  const BONUS_NUMBERS   = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
  const CHAIN_CACHE_TTL = 10000;  // ms — hide banner if cache is older than this
  const ASSIGN_POLL_MS  = 30000;  // re-fetch assignments every 30s
  const PREFIX          = "twi-chain-alert-";
  const CACHE_KEY       = `${PREFIX}chain-cache`;

  // ── localStorage helpers ───────────────────────────────────────────────────
  // localStorage can throw (Safari private-mode quota edge cases, storage
  // disabled in some embedded webviews) — never let a storage write crash
  // the script on any platform.
  function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function lsRemove(key) { try { localStorage.removeItem(key); } catch {} }

  // GM_addStyle can be missing or a no-op in some embedded webviews (TornPDA).
  // Fall back to a plain <style> element so our CSS always applies.
  function addStyle(css) {
    try {
      if (typeof GM_addStyle === "function") { GM_addStyle(css); return; }
    } catch {}
    try {
      const s = document.createElement("style");
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    } catch {}
  }

  // ── State ──────────────────────────────────────────────────────────────────

  const state = {
    apiKey:          lsGet(`${PREFIX}api-key`) || "",
    sessionToken:    lsGet(`${PREFIX}session`) || "",
    sessionExpires:  lsGet(`${PREFIX}session-expires`) || "",
    enabled:         lsGet(`${PREFIX}enabled`) !== "false",
    chainCount:      null,
    alertedFor:      null,
    lastError:       "",
    playerId:        lsGet(`${PREFIX}player-id`) || "",
    playerName:      lsGet(`${PREFIX}player-name`) || "",
    assignments:     new Map(),
    lastAssignFetch: 0
  };

  function setApiKey(value) {
    state.apiKey = String(value || "").trim();
    state.apiKey
      ? lsSet(`${PREFIX}api-key`, state.apiKey)
      : lsRemove(`${PREFIX}api-key`);
  }

  function setEnabled(value) {
    state.enabled = value;
    lsSet(`${PREFIX}enabled`, value ? "true" : "false");
  }

  function validSession() {
    return Boolean(
      state.sessionToken &&
      state.sessionExpires &&
      Date.parse(state.sessionExpires) - Date.now() > 60000
    );
  }

  function setSession(token, expiresAt, playerId, playerName) {
    state.sessionToken   = token || "";
    state.sessionExpires = expiresAt || "";
    state.playerId       = String(playerId || "");
    state.playerName     = String(playerName || "");
    token
      ? lsSet(`${PREFIX}session`, token)
      : lsRemove(`${PREFIX}session`);
    expiresAt
      ? lsSet(`${PREFIX}session-expires`, expiresAt)
      : lsRemove(`${PREFIX}session-expires`);
    state.playerId
      ? lsSet(`${PREFIX}player-id`, state.playerId)
      : lsRemove(`${PREFIX}player-id`);
    state.playerName
      ? lsSet(`${PREFIX}player-name`, state.playerName)
      : lsRemove(`${PREFIX}player-name`);
  }

  function isAdmin() { return ADMIN_IDS.has(state.playerId); }

  // ── Page detection ─────────────────────────────────────────────────────────

  function isSettingsPage() { return location.pathname.includes("/preferences.php"); }
  function isFactionPage()  { return location.pathname.includes("/factions.php"); }
  function isChainPage()    { return isFactionPage() && Boolean(document.querySelector("div.chain-box")); }

  // ── Session / auth ─────────────────────────────────────────────────────────

  function authenticate(callback) {
    if (!state.apiKey) return;
    if (validSession()) { if (callback) callback(); return; }
    GM_xmlhttpRequest({
      method: "POST",
      url: `${API_BASE}/auth`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ apiKey: state.apiKey }),
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success && data.sessionToken) {
          setSession(data.sessionToken, data.expiresAt, data.player?.id, data.player?.name);
          updateSettingsPanel();
          renderAssignmentTable();
          if (callback) callback();
        } else {
          state.lastError = data.error || "Auth failed";
          updateSettingsPanel();
        }
      },
      onerror() {
        state.lastError = "Auth request failed";
        updateSettingsPanel();
      }
    });
  }

  // ── Bonus assignment fetch ─────────────────────────────────────────────────

  function fetchAssignments() {
    if (!state.sessionToken) return;
    const now = Date.now();
    if (now - state.lastAssignFetch < ASSIGN_POLL_MS) return;
    state.lastAssignFetch = now;
    GM_xmlhttpRequest({
      method: "GET",
      url: `${API_BASE}/bonus-assignments`,
      headers: { "Authorization": `Bearer ${state.sessionToken}` },
      onload(response) {
        if (response.status === 401) {
          setSession("", "", "", "");
          state.lastAssignFetch = 0;
          authenticate(() => fetchAssignments());
          return;
        }
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success && Array.isArray(data.assignments)) {
          state.assignments.clear();
          for (const a of data.assignments) {
            state.assignments.set(Number(a.bonusNumber), {
              playerId:   String(a.playerId),
              playerName: a.playerName,
              assignedBy: a.assignedBy
            });
          }
          checkAlerts();
          updateSettingsPanel();
          renderAssignmentTable();
        }
      }
    });
  }

  // ── PUT / DELETE assignment (admin only) ───────────────────────────────────

  function putAssignment(bonusNumber, playerId, playerName, callback) {
    if (!state.sessionToken) {
      authenticate(() => putAssignment(bonusNumber, playerId, playerName, callback));
      return;
    }
    GM_xmlhttpRequest({
      method: "PUT",
      url: `${API_BASE}/bonus-assignments/${bonusNumber}`,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${state.sessionToken}` },
      data: JSON.stringify({ playerId: String(playerId), playerName: String(playerName) }),
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success) {
          state.assignments.set(bonusNumber, { playerId: String(playerId), playerName, assignedBy: state.playerName });
          state.lastAssignFetch = 0;
          renderAssignmentTable();
          if (callback) callback(null);
        } else {
          if (callback) callback(data.error || "Failed");
        }
      },
      onerror() { if (callback) callback("Network error"); }
    });
  }

  function deleteAssignment(bonusNumber, callback) {
    if (!state.sessionToken) return;
    GM_xmlhttpRequest({
      method: "DELETE",
      url: `${API_BASE}/bonus-assignments/${bonusNumber}`,
      headers: { "Authorization": `Bearer ${state.sessionToken}` },
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success) {
          state.assignments.delete(bonusNumber);
          renderAssignmentTable();
          if (callback) callback(null);
        } else {
          if (callback) callback(data.error || "Failed");
        }
      },
      onerror() { if (callback) callback("Network error"); }
    });
  }

  // ── Banner ─────────────────────────────────────────────────────────────────

  function ensureBannerEl() {
    if (document.getElementById("twi-alert-banner")) return;
    const banner = document.createElement("div");
    banner.id = "twi-alert-banner";
    (document.body || document.documentElement).appendChild(banner);
  }

  function showBanner(bonusNumber, level, assignedName) {
    ensureBannerEl();
    const banner = document.getElementById("twi-alert-banner");
    if (!banner) return;
    state.alertedFor = bonusNumber;
    banner.className = level === "urgent" ? "twi-alert-urgent" : "twi-alert-warn";
    banner.style.display = "";
    const diff = bonusNumber - state.chainCount;
    const hitterLine = assignedName ? ` — ${assignedName}'s hit` : "";
    if (level === "urgent") {
      banner.textContent = `🚨 Slow Hits Please — Bonus Level in 1 hit! (${bonusNumber})${hitterLine}`;
    } else {
      banner.textContent = `⚠️ Slow Hits Please — Bonus Level in ${diff} hits! (${bonusNumber})${hitterLine}`;
    }
  }

  function showPersonalBanner(bonusNumber, diff) {
    ensureBannerEl();
    const banner = document.getElementById("twi-alert-banner");
    if (!banner) return;
    state.alertedFor = bonusNumber;
    banner.className = diff === 1 ? "twi-alert-mine-urgent" : "twi-alert-mine";
    banner.style.display = "";
    if (diff === 1) {
      banner.textContent = `🚨 ATTACK NOW — Bonus ${bonusNumber} hit is YOURS!`;
    } else {
      banner.textContent = `🎯 YOUR HIT in ${diff} — Get ready for bonus ${bonusNumber}!`;
    }
  }

  function hideBanner() {
    const banner = document.getElementById("twi-alert-banner");
    if (banner) { banner.style.display = "none"; banner.className = ""; banner.textContent = ""; }
    state.alertedFor = null;
  }

  // ── Alert logic ────────────────────────────────────────────────────────────

  function checkAlerts() {
    const count = state.chainCount;
    if (count === null || count === 0) { hideBanner(); return; }
    const nextBonus = BONUS_NUMBERS.find(n => n > count);
    if (!nextBonus) { hideBanner(); return; }
    const diff = nextBonus - count;
    if (diff > 5) { hideBanner(); return; }
    const assignment = state.assignments.get(nextBonus);
    const isMyHit = assignment && assignment.playerId === state.playerId && state.playerId;
    if (isMyHit) {
      showPersonalBanner(nextBonus, diff);
    } else {
      showBanner(nextBonus, diff === 1 ? "urgent" : "warn", assignment?.playerName || null);
    }
  }

  // ── Chain count observer ───────────────────────────────────────────────────

  let chainObserver = null;

  function readChainFromDOM() {
    const el = document.querySelector(".chain-box-center-stat");
    if (!el) return null;
    const n = parseInt(el.textContent.trim(), 10);
    return isNaN(n) ? null : n;
  }

  function applyChainCount(count) {
    if (count === state.chainCount) return;
    state.chainCount = count;
    fetchAssignments();
    checkAlerts();
    updateSettingsPanel();
  }

  function writeCacheFromDOM() {
    const count = readChainFromDOM();
    if (count !== null) {
      lsSet(CACHE_KEY, JSON.stringify({ count, ts: Date.now() }));
    } else {
      lsRemove(CACHE_KEY);
    }
    return count;
  }

  function readChainFromCache() {
    try {
      const raw = lsGet(CACHE_KEY);
      if (!raw) return null;
      const { count, ts } = JSON.parse(raw);
      if (Date.now() - ts > CHAIN_CACHE_TTL) return null;
      return count;
    } catch { return null; }
  }

  function attachChainObserver() {
    if (chainObserver) { chainObserver.disconnect(); chainObserver = null; }
    const el = document.querySelector(".chain-box-center-stat");
    if (!el) return false;
    chainObserver = new MutationObserver(() => applyChainCount(writeCacheFromDOM()));
    chainObserver.observe(el, { childList: true, subtree: true, characterData: true });
    applyChainCount(writeCacheFromDOM());
    return true;
  }

  function detachChainObserver() {
    if (chainObserver) { chainObserver.disconnect(); chainObserver = null; }
    state.chainCount = null;
  }

  // ── Assignment table ───────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function renderAssignmentTable() {
    const container = document.getElementById("twi-assign-table-wrap");
    if (!container) return;
    const rows = BONUS_NUMBERS.map(bn => {
      const a = state.assignments.get(bn);
      return `<tr>
        <td class="twi-assign-bn">${bn}</td>
        <td class="twi-assign-name">${a ? escHtml(a.playerName) : '<span class="twi-assign-empty">— unassigned —</span>'}</td>
        <td class="twi-assign-actions">
          ${isAdmin() ? `
            <button class="torn-btn twi-btn-assign" data-bn="${bn}">
              ${a ? "Change" : "Assign"}
            </button>
            ${a ? `<button class="torn-btn twi-btn-remove" data-bn="${bn}">✕</button>` : ""}
          ` : ""}
        </td>
      </tr>`;
    }).join("");
    container.innerHTML = `
      <table class="twi-assign-table">
        <thead><tr>
          <th>Bonus</th><th>Assigned Hitter</th>${isAdmin() ? "<th></th>" : ""}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    if (isAdmin()) {
      container.querySelectorAll(".twi-btn-assign").forEach(btn => {
        btn.addEventListener("click", () => openInlineAssign(Number(btn.dataset.bn), btn.closest("tr")));
      });
      container.querySelectorAll(".twi-btn-remove").forEach(btn => {
        btn.addEventListener("click", () => {
          deleteAssignment(Number(btn.dataset.bn), err => { if (err) alert(`Error: ${err}`); });
        });
      });
    }
  }

  let factionMemberCache = null;

  function fetchFactionMembers(callback) {
    if (factionMemberCache) { callback(factionMemberCache); return; }
    GM_xmlhttpRequest({
      method: "GET",
      url: `${TORN_API_BASE}/v2/faction/members?key=${state.apiKey}`,
      headers: { "Content-Type": "application/json" },
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { callback([]); return; }
        const raw = data?.members ?? data?.faction?.members ?? {};
        const members = Object.entries(raw)
          .map(([id, m]) => ({ id: String(id), name: String(m.name ?? m.player_name ?? id) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        factionMemberCache = members;
        callback(members);
      },
      onerror() { callback([]); }
    });
  }

  function openInlineAssign(bonusNumber, row) {
    const existing = state.assignments.get(bonusNumber);
    row.innerHTML = `
      <td colspan="3" class="twi-assign-inline-cell">
        <span class="twi-assign-inline-label">Bonus ${bonusNumber}:</span>
        <div class="twi-assign-inline-wrap">
          <input type="text" class="twi-assign-inline-input"
            placeholder="Type member name…" autocomplete="off" spellcheck="false"
            value="${existing ? escHtml(existing.playerName) : ''}" />
          <div class="twi-assign-inline-dropdown"></div>
        </div>
        <button class="torn-btn twi-btn-secondary twi-assign-inline-cancel">✕</button>
        <span class="twi-assign-inline-status"></span>
      </td>`;
    const inputEl    = row.querySelector(".twi-assign-inline-input");
    const dropdownEl = row.querySelector(".twi-assign-inline-dropdown");
    const cancelBtn  = row.querySelector(".twi-assign-inline-cancel");
    const statusEl   = row.querySelector(".twi-assign-inline-status");
    cancelBtn.addEventListener("click", () => renderAssignmentTable());
    function selectMember(id, name) {
      inputEl.value = name;
      dropdownEl.style.display = "none";
      statusEl.textContent = "Saving…"; statusEl.style.color = "#888";
      putAssignment(bonusNumber, id, name, err => {
        if (err) { statusEl.textContent = `Error: ${err}`; statusEl.style.color = "#e74c3c"; }
        else { renderAssignmentTable(); }
      });
    }
    function showDropdown(filter) {
      const q = filter.toLowerCase();
      const hits = (factionMemberCache || []).filter(m => m.name.toLowerCase().includes(q) || m.id.includes(q));
      if (!hits.length || !filter) { dropdownEl.style.display = "none"; return; }
      dropdownEl.innerHTML = hits.slice(0, 20).map(m =>
        `<div class="twi-assign-option" data-id="${m.id}" data-name="${escHtml(m.name)}">
          ${escHtml(m.name)} <span class="twi-assign-optid">#${m.id}</span>
        </div>`).join("");
      dropdownEl.style.display = "block";
      dropdownEl.querySelectorAll(".twi-assign-option").forEach(opt => {
        opt.addEventListener("mousedown", e => { e.preventDefault(); selectMember(opt.dataset.id, opt.dataset.name); });
      });
    }
    inputEl.addEventListener("input", () => showDropdown(inputEl.value));
    inputEl.addEventListener("focus",  () => { if (inputEl.value) showDropdown(inputEl.value); });
    inputEl.addEventListener("blur",   () => setTimeout(() => { dropdownEl.style.display = "none"; }, 150));
    fetchFactionMembers(() => inputEl.focus());
  }

  // ── Settings panel HTML builder (shared by inline + modal) ─────────────────

  function buildSettingsPanelHTML() {
    return `
      <div class="twi-prefs-card">
        <button type="button" class="twi-prefs-header" aria-expanded="false">
          <span class="twi-prefs-arrow" aria-hidden="true">&#9658;</span>
          <span class="twi-prefs-title-text">TWI Chain Alert Settings</span>
          <span class="twi-prefs-status-badge" id="twi-alert-badge"></span>
        </button>
        <div class="twi-prefs-body" hidden>

          <div class="twi-settings-row">
            <label for="twi-alert-apikey"><strong>Torn API Key</strong></label>
            <input type="text" id="twi-alert-apikey" class="twi-settings-input"
              maxlength="16" placeholder="Paste 16-char API key here..."
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
            <p class="twi-settings-hint">
              Provide your 16-character Torn API key with <em>Faction</em> read access.
            </p>
          </div>

          <div class="twi-settings-row twi-settings-row-inline">
            <input type="checkbox" id="twi-alert-enabled" />
            <label for="twi-alert-enabled">Enable TWI Chain Alert banners</label>
          </div>

          <div class="twi-settings-status" id="twi-alert-status-line"></div>

          <div class="twi-settings-actions">
            <button type="button" id="twi-alert-save" class="torn-btn twi-btn-save">Save &amp; Connect</button>
            <button type="button" id="twi-alert-forget" class="torn-btn twi-btn-secondary">Forget API Key</button>
            <span id="twi-alert-saved-msg" style="display:none;color:#4CAF50;font-weight:bold;margin-left:10px;">&#10003; Saved!</span>
          </div>

          <div id="twi-assign-section">
            <div class="twi-assign-heading">Bonus Hit Assignments</div>
            <div id="twi-assign-table-wrap"></div>
          </div>

        </div>
      </div>`;
  }

  // ── Settings: wire up panel events (save / forget / accordion) ─────────────

  function wireSettingsPanel(panel) {
    // Accordion only present on the desktop inline panel, not the mobile modal
    const accordionHeader = panel.querySelector(".twi-prefs-header");
    if (accordionHeader) {
      accordionHeader.addEventListener("click", () => {
        const body   = panel.querySelector(".twi-prefs-body");
        const arrow  = panel.querySelector(".twi-prefs-arrow");
        const open   = !body.hidden;
        body.hidden  = open;
        arrow.innerHTML = open ? "&#9658;" : "&#9660;";
        accordionHeader.setAttribute("aria-expanded", String(!open));
      });
    }

    panel.querySelector("#twi-alert-save").addEventListener("click", () => {
      const keyInput  = panel.querySelector("#twi-alert-apikey");
      const enabledCb = panel.querySelector("#twi-alert-enabled");
      const savedMsg  = panel.querySelector("#twi-alert-saved-msg");
      const newKey    = keyInput.value.trim();
      if (newKey && newKey !== state.apiKey) {
        setApiKey(newKey);
        setSession("", "", "", "");  // force re-auth with new key
      }
      setEnabled(enabledCb.checked);
      if (!state.enabled) hideBanner();
      // Always attempt auth on save so status updates immediately
      authenticate(() => {
        state.lastAssignFetch = 0;
        fetchAssignments();
      });
      updateSettingsPanel();
      savedMsg.style.display = "inline";
      setTimeout(() => { savedMsg.style.display = "none"; }, 2500);
    });

    panel.querySelector("#twi-alert-forget").addEventListener("click", () => {
      setApiKey("");
      setSession("", "", "", "");
      setEnabled(false);
      state.chainCount = null;
      state.assignments.clear();
      hideBanner();
      renderAssignmentTable();
      updateSettingsPanel();
    });
  }

  // ── Settings page injection (preferences.php) ──────────────────────────────
  // Insert the panel as the LAST CHILD of the main content column so it inherits
  // the page width and flows directly beneath the "General settings" card on
  // every platform. The old approach (sibling after #react-root, or append to
  // document.body) worked on iOS Safari but failed inside TornPDA's WKWebView,
  // where the SPA re-renders after the first inject and the react-root sibling
  // lands outside the visible content column.

  function findContentColumn() {
    const selectors = [
      "#mainContainer",      // legacy Torn outer content column (most stable)
      ".content-wrapper",    // React content wrapper
      "[role='main']",
      "#react-root",
      "#root",
      "#app"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.getClientRects().length) return el;   // exists & rendered
    }
    return document.body || document.documentElement;
  }

  function injectSettingsPage() {
    const anchor = findContentColumn();
    const existing = document.getElementById("twi-alert-settings");

    if (existing) {
      // Self-heal: TornPDA's SPA re-render can detach or reparent our panel.
      // Re-attach it to the content column if it fell out of the DOM, or if it
      // ended up somewhere other than inside the current content column.
      if (!document.body.contains(existing)) {
        anchor.appendChild(existing);
      } else if (existing.parentElement !== anchor && !anchor.contains(existing)) {
        anchor.appendChild(existing);
      }
      return;
    }

    const panel = document.createElement("div");
    panel.id = "twi-alert-settings";
    panel.innerHTML = buildSettingsPanelHTML();
    anchor.appendChild(panel);

    wireSettingsPanel(panel);
    updateSettingsPanel();
    renderAssignmentTable();
    twiDebugDumpDom();   // TEMP DIAGNOSTIC — remove after selector is confirmed
  }

  // ── TEMP DIAGNOSTIC ─────────────────────────────────────────────────────────
  // Renders an on-screen box (no console needed) listing which candidate anchors
  // exist in TornPDA and every element ID on the page, so the correct content
  // column can be identified. Remove this whole block once confirmed.
  function twiDebugDumpDom() {
    if (document.getElementById("twi-debug-box")) return;
    const candidates = ["#mainContainer", ".content-wrapper", "[role='main']", "#react-root", "#root", "#app"];
    const chosen = findContentColumn();
    const chosenDesc = chosen === document.body ? "document.body (fallback!)"
      : `<${chosen.tagName.toLowerCase()}${chosen.id ? " id=" + chosen.id : ""}${chosen.className ? " class=\"" + chosen.className + "\"" : ""}>`;
    const candLines = candidates.map(sel => {
      const el = document.querySelector(sel);
      const rendered = el && el.getClientRects().length;
      return `${el ? (rendered ? "✅" : "⚠️ hidden") : "❌"}  ${sel}`;
    }).join("\n");
    const allIds = Array.from(document.querySelectorAll("[id]"))
      .map(el => `#${el.id} <${el.tagName.toLowerCase()}>`).join("\n");
    const box = document.createElement("div");
    box.id = "twi-debug-box";
    box.style.cssText = "position:relative;z-index:2147483647;margin:8px 12px;padding:12px;" +
      "background:#000;color:#0f0;border:2px solid #0f0;border-radius:6px;" +
      "font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all;" +
      "max-height:60vh;overflow:auto;";
    box.textContent =
      "TWI DEBUG — send this whole box to Claude\n" +
      "────────────────────────\n" +
      "CHOSEN ANCHOR:\n" + chosenDesc + "\n\n" +
      "CANDIDATES:\n" + candLines + "\n\n" +
      "ALL ELEMENT IDs ON PAGE:\n" + (allIds || "(none)");
    (chosen === document.body ? document.body : chosen).appendChild(box);
  }
  // ── END TEMP DIAGNOSTIC ─────────────────────────────────────────────────────

  function updateSettingsPanel() {
    const panel = document.getElementById("twi-alert-settings");
    if (!panel) return;
    const keyInput   = panel.querySelector("#twi-alert-apikey");
    const enabledCb  = panel.querySelector("#twi-alert-enabled");
    const statusLine = panel.querySelector("#twi-alert-status-line");
    const badge      = document.getElementById("twi-alert-badge");
    if (keyInput && !keyInput.matches(":focus")) {
      keyInput.value = "";
      keyInput.placeholder = state.apiKey
        ? `API key saved (${state.apiKey.slice(0, 4)}${"*".repeat(12)})`
        : "Paste 16-char API key here...";
    }
    if (enabledCb) enabledCb.checked = state.enabled;
    if (statusLine) {
      if (validSession() && state.playerName) {
        statusLine.textContent = `✓ Connected as ${state.playerName}${isAdmin() ? " (admin)" : ""}`;
        statusLine.style.color = "#4CAF50";
        if (badge) { badge.textContent = "✓ Connected"; badge.className = "twi-prefs-status-badge ok"; }
      } else if (state.lastError) {
        statusLine.textContent = `✗ ${state.lastError}`;
        statusLine.style.color = "#e74c3c";
        if (badge) { badge.textContent = "✗ Error"; badge.className = "twi-prefs-status-badge err"; }
      } else {
        statusLine.textContent = state.apiKey ? "Not connected — click Save & Connect." : "Enter an API key to get started.";
        statusLine.style.color = "#999";
        if (badge) { badge.textContent = ""; badge.className = "twi-prefs-status-badge"; }
      }
    }
  }

  // ── ensureUI ───────────────────────────────────────────────────────────────

  function ensureUI() {
    ensureBannerEl();

    if (isSettingsPage()) {
      injectSettingsPage();
      return;
    }

    if (!state.enabled) { hideBanner(); return; }

    if (isChainPage()) {
      attachChainObserver();
    } else if (isFactionPage()) {
      detachChainObserver();
      hideBanner();
    } else {
      // Non-faction page: read chain count from localStorage cache (no network)
      detachChainObserver();
      const count = readChainFromCache();
      if (count !== null && count !== state.chainCount) {
        state.chainCount = count;
        checkAlerts();
      } else if (count === null) {
        hideBanner();
      }
    }
  }

  // 2s interval: drives cache-based banner on non-faction pages + chain observer recovery.
  setInterval(() => {
    if (isSettingsPage()) { injectSettingsPage(); return; }
    ensureBannerEl();
    if (!state.enabled) return;
    if (isFactionPage()) {
      if (isChainPage() && !chainObserver) attachChainObserver();
      else if (!isChainPage() && chainObserver) detachChainObserver();
    } else {
      const count = readChainFromCache();
      if (count !== null && count !== state.chainCount) {
        state.chainCount = count;
        checkAlerts();
      } else if (count === null) {
        hideBanner();
      }
    }
  }, 2000);

  window.addEventListener("hashchange", () => {
    detachChainObserver();
    ensureUI();
  });

  // ── CSS ────────────────────────────────────────────────────────────────────

  addStyle(`
    /* ── Banner ── */
    #twi-alert-banner {
      display: none;
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      padding: 10px 16px; font-size: 15px; font-weight: 700;
      line-height: 1.3; text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5); box-sizing: border-box;
      /* iPhone notch/status-bar clearance when Torn is opened as a standalone
         home-screen web app; ignored (falls back to 10px) on browsers/engines
         without env() support. */
      padding-top: calc(10px + env(safe-area-inset-top, 0px));
    }
    #twi-alert-banner.twi-alert-warn {
      display: block; background: #f6c344; color: #3d2f00;
      border-bottom: 3px solid #e6a800;
    }
    #twi-alert-banner.twi-alert-urgent {
      display: block; background: #c92a2a; color: #fff;
      border-bottom: 3px solid #ff4444;
      animation: twi-pulse 1s ease-in-out infinite;
    }
    #twi-alert-banner.twi-alert-mine {
      display: block; background: #1a5fa8; color: #fff;
      border-bottom: 3px solid #4a9eff;
    }
    #twi-alert-banner.twi-alert-mine-urgent {
      display: block; background: #7c35ab; color: #fff;
      border-bottom: 3px solid #c084fc;
      animation: twi-pulse 0.8s ease-in-out infinite;
    }
    @keyframes twi-pulse { 0%,100% { opacity:1; } 50% { opacity:0.75; } }

    /* ── Preferences page section ── */
    #twi-alert-settings {
      display: block !important;
      width: 100%; box-sizing: border-box;
      padding: 8px 12px 12px;
      background: #181818;
      border-top: 3px solid #3a3a3a;
      margin-top: 0;
      position: relative; z-index: 10;
      clear: both;
    }
    .twi-prefs-card {
      background: #1e1e1e; border: 1px solid #3a3a3a; border-radius: 8px;
      overflow: hidden; margin: 0 auto;
      width: 100%; max-width: 680px; box-sizing: border-box;
    }
    /* Accordion header — full-width clickable bar */
    .twi-prefs-header {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 12px 16px;
      background: #2a2a2a; border: none; border-radius: 0;
      color: #f0f0f0; font-size: 14px; font-weight: 700;
      cursor: pointer; text-align: left;
      touch-action: manipulation; -webkit-user-select: none; user-select: none;
    }
    .twi-prefs-header:hover, .twi-prefs-header:active { background: #333; }
    .twi-prefs-arrow { font-size: 11px; color: #888; flex-shrink: 0; }
    .twi-prefs-title-text { flex: 1; }
    .twi-prefs-status-badge {
      font-size: 11px; font-weight: 600; padding: 2px 7px;
      border-radius: 10px; flex-shrink: 0;
    }
    .twi-prefs-status-badge.ok  { background: #1a4a1a; color: #4CAF50; }
    .twi-prefs-status-badge.err { background: #4a1a1a; color: #e74c3c; }
    /* Accordion body */
    .twi-prefs-body {
      padding: 16px 16px 20px;
      border-top: 1px solid #3a3a3a;
    }
    .twi-prefs-body[hidden] { display: none; }
    .twi-settings-row     { margin-bottom: 14px; }
    .twi-settings-row label { font-size: 13px; color: #ccc; display: block; margin-bottom: 6px; }
    .twi-settings-row-inline { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .twi-settings-row-inline input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; }
    .twi-settings-row-inline label { cursor: pointer; font-size: 13px; color: #ccc; margin-bottom: 0; }
    .twi-settings-input {
      display: block; width: 100%; max-width: 100%;
      padding: 10px 12px; border: 1px solid #555; border-radius: 6px;
      background: #1a1a1a; color: #fff; font-size: 16px;
      font-family: monospace; box-sizing: border-box;
    }
    .twi-settings-input:focus { outline: none; border-color: #4a9eff; }
    .twi-settings-hint { margin: 6px 0 0; font-size: 12px; color: #888; line-height: 1.5; }
    .twi-settings-status { margin: 10px 0 14px; font-size: 13px; min-height: 18px; font-weight: 500; }
    .twi-settings-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 4px; }
    .twi-btn-save         { background: #2f9e44 !important; color: #fff !important; }
    .twi-btn-save:hover   { background: #37b24d !important; }
    .twi-btn-secondary    { background: #555 !important; color: #ddd !important; }
    .twi-btn-secondary:hover { background: #666 !important; }

    /* ── Assignment table ── */
    #twi-assign-section { margin-top: 18px; border-top: 1px solid #333; padding-top: 14px; }
    .twi-assign-heading { font-size: 12px; font-weight: 700; color: #aaa; margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: 0.5px; }
    .twi-assign-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .twi-assign-table th { color: #888; font-weight: 600; padding: 4px 6px; text-align: left;
      border-bottom: 1px solid #333; }
    .twi-assign-table td { padding: 5px 6px; border-bottom: 1px solid #2a2a2a; color: #ddd; }
    .twi-assign-bn    { font-weight: 700; color: #f6c344; width: 56px; }
    .twi-assign-empty { color: #555; font-style: italic; }
    .twi-assign-actions { width: 100px; text-align: right; }
    .twi-btn-assign { font-size: 11px !important; padding: 2px 7px !important;
      background: #1a5fa8 !important; color: #fff !important; }
    .twi-btn-assign:hover { background: #2372c9 !important; }
    .twi-btn-remove { font-size: 11px !important; padding: 2px 6px !important;
      background: #7a1e1e !important; color: #fff !important; margin-left: 4px !important; }
    .twi-btn-remove:hover { background: #a02424 !important; }
    .twi-assign-inline-cell { padding: 6px 4px !important; }
    .twi-assign-inline-label { font-size: 11px; color: #f6c344; font-weight: 700;
      display: block; margin-bottom: 4px; }
    .twi-assign-inline-wrap { position: relative; display: inline-block; width: 100%; }
    .twi-assign-inline-input {
      width: 100%; padding: 5px 8px; box-sizing: border-box;
      background: #1a1a1a; color: #fff;
      border: 1px solid #4a9eff; border-radius: 4px; font-size: 12px; font-family: inherit;
    }
    .twi-assign-inline-input:focus { outline: none; }
    .twi-assign-inline-dropdown {
      display: none; position: absolute; z-index: 100001;
      top: 100%; left: 0; right: 0; background: #2a2a2a;
      border: 1px solid #555; border-top: none; border-radius: 0 0 6px 6px;
      max-height: 180px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }
    .twi-assign-option { padding: 6px 10px; cursor: pointer; font-size: 12px; color: #ddd;
      border-bottom: 1px solid #333; }
    .twi-assign-option:last-child { border-bottom: none; }
    .twi-assign-option:hover { background: #3a3a3a; }
    .twi-assign-optid { color: #666; font-size: 11px; margin-left: 5px; }
    .twi-assign-inline-cancel { font-size: 11px !important; padding: 2px 6px !important;
      margin-left: 4px !important; vertical-align: top; }
    .twi-assign-inline-status { display: block; font-size: 11px; color: #888; margin-top: 3px; }

  `);

  // ── Boot ───────────────────────────────────────────────────────────────────

  if (state.apiKey) {
    authenticate(() => {
      state.lastAssignFetch = 0;
      fetchAssignments();
    });
  }

  ensureUI();

})();
