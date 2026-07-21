// ==UserScript==
// @name         TWI Faction_Calls (Universal)
// @namespace    twilight-reborn
// @version      2.1.9
// @author       Leandria & Wolf (Universal: Bob)
// @description  Shared target calls, priorities and assist requests for Twilight - Reborn [56966]. Settings on Torn preferences page. Optimized for all devices.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @match        https://www.torn.com/preferences.php*
// @match        https://torn.com/*
// @connect      torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Faction_Calls_Universal.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Faction_Calls_Universal.user.js
// ==/UserScript==

// ── Changelog ────────────────────────────────────────────────────────────────
// v2.1.1 (2026-07-20) — updated by Claude Sonnet
//   - Cross-platform hardening pass (Apple/Android mobile+tablet, Safari/
//     Chrome/Firefox desktop):
//   - Replaced CSS `inset:0` on the API-key modal with explicit
//     top/right/bottom/left — `inset` shorthand isn't supported before
//     Safari 14.1, so older iOS/macOS Safari would mis-position the modal.
//   - Added lsGet/lsSet/lsRemove helpers; every localStorage read/write now
//     wrapped in try/catch so storage failures (Safari private-mode edge
//     cases, storage-restricted embedded webviews) can't throw and break
//     the script.
// ──────────────────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  const APP_NAME = "TWI Faction Calls";
  const API_BASE = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const ALLOWED_FACTION_ID = 56966;
  // Faction admins — can place priority/assist calls on unclaimed targets.
  // Their calls can be taken over by any member clicking the CALL button.
  const ADMIN_IDS = new Set(["3647423","3917106","3658650","3855001","3926412","4152155"]);
  // Display name overrides — shown in the call meta instead of the player's real name.
  const DISPLAY_NAMES = new Map([
    ["4157019", "\u{1F43A}\u{1F43A}\u{1F43A}"],
    ["3658650", "\u{1F60E}\u{1F60E}\u{1F60E}"],
    ["3859007", "\u{1F478}\u{1F478}\u{1F478}"],
  ]);
  // 8s poll = 7.5 calls/min per device.
  // At 20 active users that is 150 calls/min to the server — monitor if load increases.
  // All refresh triggers (interval, visibilitychange, hashchange) share the same
  // lastPollTime gate so no combination of events can exceed this rate.
  const POLL_MS = 8000;
  const COUNTDOWN_MS = 1000;
  const PREFIX = "twi-faction-calls-";

  // localStorage can throw (Safari private-mode quota edge cases, storage
  // disabled in some embedded webviews) — never let a storage write crash
  // the script on any platform.
  function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function lsSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function lsRemove(key) { try { localStorage.removeItem(key); } catch {} }

  const state = {
    apiKey: lsGet(`${PREFIX}api-key`) || "",
    token: lsGet(`${PREFIX}session-token`) || "",
    expiresAt: lsGet(`${PREFIX}session-expires`) || "",
    player: readJson(`${PREFIX}player`),
    enabled: lsGet(`${PREFIX}enabled`) !== "false",
    calls: new Map(),
    authenticating: null,
    polling: false,
    connected: false,
    lastError: ""
  };

  function readJson(key) {
    try { return JSON.parse(lsGet(key) || "null"); }
    catch { return null; }
  }

  function setEnabled(value) {
    state.enabled = value;
    lsSet(`${PREFIX}enabled`, value ? "true" : "false");
  }

  function setApiKey(value) {
    state.apiKey = String(value || "").trim();
    state.apiKey
      ? lsSet(`${PREFIX}api-key`, state.apiKey)
      : lsRemove(`${PREFIX}api-key`);
    clearSession();
  }

  function saveSession(data) {
    state.token = data.sessionToken;
    state.expiresAt = data.expiresAt;
    state.player = data.player;
    lsSet(`${PREFIX}session-token`, state.token);
    lsSet(`${PREFIX}session-expires`, state.expiresAt);
    lsSet(`${PREFIX}player`, JSON.stringify(state.player));
  }

  function clearSession() {
    state.token = "";
    state.expiresAt = "";
    state.player = null;
    lsRemove(`${PREFIX}session-token`);
    lsRemove(`${PREFIX}session-expires`);
    lsRemove(`${PREFIX}player`);
  }

  function isWarPage() {
    if (!location.pathname.endsWith("/factions.php")) return false;
    // Primary: DOM presence of .faction-war (authoritative, works on Chrome/Firefox)
    if (document.querySelector(".faction-war")) return true;
    // Fallback: hash check for TornPDA Android — during its partial DOM swaps
    // .faction-war is briefly absent while the hash still correctly says #/war/
    return (location.hash || "").startsWith("#/war/");
  }

  function validSession() {
    return Boolean(
      state.token && state.player &&
      Number(state.player.factionId) === ALLOWED_FACTION_ID &&
      Date.parse(state.expiresAt) - Date.now() > 60000
    );
  }

  function request(method, path, body, authenticated = true) {
    return new Promise((resolve, reject) => {
      const headers = { "Content-Type": "application/json" };
      if (authenticated && state.token) headers.Authorization = `Bearer ${state.token}`;
      // TornPDA: omit timeout/ontimeout — those fields cause TornPDA's GM engine
      // to silently drop the whole request. Use a manual setTimeout instead.
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Server request timed out"));
      }, 12000);
      GM_xmlhttpRequest({
        method,
        url: `${API_BASE}${path}`,
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        onload(response) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          let data;
          try { data = JSON.parse(response.responseText || "{}"); }
          catch { reject(new Error(`Invalid server response (${response.status})`)); return; }
          if (response.status >= 200 && response.status < 300) {
            resolve({ status: response.status, data });
          } else {
            const error = new Error(data.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            reject(error);
          }
        },
        onerror() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(new Error("Unable to reach TWI Faction Calls server"));
        }
      });
    });
  }

  // ── Modal dialogs (custom, works on all platforms incl. iOS Safari) ────────

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "twi-modal-overlay";
    modal.innerHTML = `<div class="twi-modal-container"><div class="twi-modal-content"></div></div>`;
    (document.body || document.documentElement).appendChild(modal);
    return modal;
  }

  function showAlert(message) {
    return new Promise((resolve) => {
      const modal = createModal();
      const content = modal.querySelector(".twi-modal-content");
      content.innerHTML = `
        <div class="twi-modal-header">${APP_NAME}</div>
        <div class="twi-modal-body">
          <p class="twi-modal-message">${message.replace(/\n/g, "<br>")}</p>
        </div>
        <div class="twi-modal-footer">
          <button type="button" class="twi-modal-btn twi-modal-btn-primary">OK</button>
        </div>`;
      const cleanup = () => { modal.remove(); resolve(); };
      content.querySelector(".twi-modal-btn-primary").addEventListener("click", cleanup);
      modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(); });
    });
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      const modal = createModal();
      const content = modal.querySelector(".twi-modal-content");
      content.innerHTML = `
        <div class="twi-modal-header">${APP_NAME}</div>
        <div class="twi-modal-body">
          <p class="twi-modal-message">${message.replace(/\n/g, "<br>")}</p>
        </div>
        <div class="twi-modal-footer">
          <button type="button" class="twi-modal-btn twi-modal-btn-cancel">Cancel</button>
          <button type="button" class="twi-modal-btn twi-modal-btn-primary">OK</button>
        </div>`;
      const cleanup = (v) => { modal.remove(); resolve(v); };
      content.querySelector(".twi-modal-btn-cancel").addEventListener("click", () => cleanup(false));
      content.querySelector(".twi-modal-btn-primary").addEventListener("click", () => cleanup(true));
      modal.addEventListener("click", (e) => { if (e.target === modal) cleanup(false); });
    });
  }

  // ── API key prompt modal ──────────────────────────────────────────────────
  // Used when no key is saved — works on all platforms including TornPDA Android.
  // Synchronous input.focus() is intentional: setTimeout focus is blocked by
  // the User Activation API on Android 16.

  function requestApiKey(initialValue = "") {
    return new Promise((resolve) => {
      document.getElementById("twi-api-key-modal")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "twi-api-key-modal";
      overlay.innerHTML = `
        <div class="twi-key-dialog" role="dialog" aria-modal="true" aria-labelledby="twi-key-title">
          <div id="twi-key-title" class="twi-key-title">TWI Faction Calls</div>
          <div class="twi-key-copy">
            Enter your 16-character Torn Public API key named <strong>Target Caller</strong>.
            Used only to confirm membership of Twilight&nbsp;&ndash;&nbsp;Reborn&nbsp;[56966].
          </div>
          <input id="twi-key-input" class="twi-key-input" type="text" maxlength="16"
            autocomplete="off" autocapitalize="none" spellcheck="false"
            placeholder="16-character API key" />
          <div id="twi-key-error" class="twi-key-error"></div>
          <div class="twi-key-buttons">
            <button type="button" class="twi-key-cancel">Cancel</button>
            <button type="button" class="twi-key-save">Save Key</button>
          </div>
        </div>`;
      (document.body || document.documentElement).appendChild(overlay);

      const input  = overlay.querySelector("#twi-key-input");
      const error  = overlay.querySelector("#twi-key-error");
      const save   = overlay.querySelector(".twi-key-save");
      const cancel = overlay.querySelector(".twi-key-cancel");
      input.value  = initialValue || "";

      const finish = (value) => { overlay.remove(); resolve(value); };
      const submit = () => {
        const key = input.value.trim();
        if (key.length !== 16) {
          error.textContent = "Must be exactly 16 characters.";
          input.focus();
          return;
        }
        finish(key);
      };

      save.addEventListener("click", submit);
      cancel.addEventListener("click", () => finish(null));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") finish(null);
      });
      input.focus();
    });
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  async function authenticate(force = false) {
    if (!force && validSession()) return true;
    if (state.authenticating) return state.authenticating;

    state.authenticating = (async () => {
      // No API key saved — prompt via modal (works on desktop, TornPDA, iOS)
      if (!state.apiKey) {
        const entered = await requestApiKey("");
        if (entered === null) return false;
        setApiKey(entered);
        // Also pre-fill the settings panel input if it's in the DOM
        const keyInput = document.getElementById("twi-settings-apikey");
        if (keyInput) keyInput.placeholder =
          `API key saved (${entered.slice(0, 4)}${"*".repeat(12)})`;
      }
      if (state.apiKey.length !== 16) {
        await showAlert("The Target Caller API key must be exactly 16 characters.");
        return false;
      }
      try {
        const { data } = await request("POST", "/auth", { apiKey: state.apiKey }, false);
        saveSession(data);
        state.connected = true;
        state.lastError = "";
        updateSettingsPanel();
        return true;
      } catch (error) {
        clearSession();
        state.connected = false;
        if (error.data?.error === "wrong_faction")
          state.lastError = "This API key is not a member of Twilight - Reborn [56966].";
        else if (error.data?.error === "torn_api_error")
          state.lastError = `Torn rejected the key: ${error.data.tornMessage || "Unknown error"}`;
        else
          state.lastError = error.message;
        await showAlert(state.lastError);
        return false;
      } finally {
        state.authenticating = null;
      }
    })();
    return state.authenticating;
  }

  async function authRequest(method, path, body) {
    if (!(await authenticate())) throw new Error("Authentication required");
    try { return await request(method, path, body, true); }
    catch (error) {
      if (error.status === 401) {
        clearSession();
        if (await authenticate(true)) return request(method, path, body, true);
      }
      throw error;
    }
  }

  // ── War page helpers ───────────────────────────────────────────────────────

  function targetRows() {
    return Array.from(document.querySelectorAll("ul.members-list li.enemy")).map((li) => {
      const profile = li.querySelector("a[href*='/profiles.php']");
      if (!profile) return null;
      let id;
      try { id = new URL(profile.href, location.origin).searchParams.get("XID"); }
      catch { return null; }
      if (!id) return null;
      const aria = profile.getAttribute("aria-label")?.match(/^View profile of (.+)$/i)?.[1];
      return {
        id: String(id),
        name: (aria || profile.textContent || `Target ${id}`).trim(),
        li,
        member: li.querySelector(".member"),
        status: li.querySelector("div.status")
      };
    }).filter(Boolean);
  }

  function hospitalised(status) {
    if (!status) return false;
    const cls = status.getAttribute("class") || "";
    return status.classList.contains("hospital") || status.classList.contains("jail") || /hospital|jail/i.test(cls);
  }

  // Returns the hospital/jail release time as an ISO string, or null if not determinable.
  // Torn renders the remaining time inside div.status in one of these forms:
  //   • data-time / data-endtime attribute (Unix seconds, most reliable)
  //   • text like "2m 30s", "1h 5m 10s", "45s"
  function hospitalReleaseTime(status) {
    if (!status) return null;
    // 1. Prefer a machine-readable epoch attribute
    const timeEl = status.querySelector("[data-time]") || status.querySelector("[data-endtime]");
    if (timeEl) {
      const epoch = parseInt(timeEl.dataset.time || timeEl.dataset.endtime, 10);
      if (!isNaN(epoch) && epoch > 0) return new Date(epoch * 1000).toISOString();
    }
    // 2. Parse human-readable countdown text (e.g. "1h 2m 3s", "5m 30s", "45s")
    const text = status.textContent || "";
    const hours   = (/(\d+)\s*h/i.exec(text)?.[1] | 0);
    const minutes = (/(\d+)\s*m/i.exec(text)?.[1] | 0);
    const seconds = (/(\d+)\s*s/i.exec(text)?.[1] | 0);
    const totalSec = hours * 3600 + minutes * 60 + seconds;
    if (totalSec > 0) return new Date(Date.now() + totalSec * 1000).toISOString();
    return null;
  }

  function remaining(call) {
    return Math.max(0, Math.ceil((Date.parse(call.expiresAt) - Date.now()) / 1000));
  }

  function format(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  async function refreshCalls() {
    // Guard: polling flag prevents concurrent requests; isWarPage() prevents
    // running off the war tab. Do NOT gate on state.enabled here — that belongs
    // at the call site. Gating here causes the poll loop to silently skip when
    // enabled is toggled, losing the connection without any visible feedback.
    if (state.polling || !isWarPage()) return;
    state.polling = true;
    try {
      const { data } = await authRequest("GET", "/calls");
      // Rebuild the calls map, but preserve any locally-extended expiresAt
      // (e.g. hospital timer override) that is longer than the server's value.
      state.calls = new Map((data.calls || []).map((c) => {
        const id = String(c.targetId);
        const existing = state.calls.get(id);
        if (existing?.expiresAt && Date.parse(existing.expiresAt) > Date.parse(c.expiresAt)) {
          c.expiresAt = existing.expiresAt;
        }
        return [id, c];
      }));
      state.connected = true;
      state.lastError = "";
      updateChip();
      updateSettingsPanel();
    } catch (error) {
      state.connected = false;
      state.lastError = error.message;
      updateChip();
      updateSettingsPanel();
    } finally {
      state.polling = false;
    }
  }

  function busy(id, value) {
    document.querySelectorAll(`[data-twi-target-id="${CSS.escape(String(id))}"]`)
      .forEach((el) => el.classList.toggle("twi-busy", value));
  }

  function isAdmin() {
    return state.player && ADMIN_IDS.has(String(state.player.id));
  }

  function isAdminCall(call) {
    return call && ADMIN_IDS.has(String(call.calledById));
  }

  async function claim(row, flags = {}) {
    busy(row.id, true);
    // Read hospital release time before the async call so we can override the
    // server's expiresAt locally — the server may not honour the field.
    const hospRelease = hospitalised(row.status) ? hospitalReleaseTime(row.status) : null;
    try {
      const body = { targetId: row.id, targetName: row.name, priority: false, assistRequested: false, ...flags };
      if (hospRelease) body.expiresAt = hospRelease;
      const { data } = await authRequest("POST", "/calls", body);
      const call = data.call;
      if (hospRelease) call.expiresAt = hospRelease;
      state.calls.set(row.id, call);
    } catch (error) {
      if (error.status === 409 && error.data?.call) {
        const call = error.data.call;
        if (hospRelease) call.expiresAt = hospRelease;
        state.calls.set(row.id, call);
      } else await showAlert(`Unable to call ${row.name}: ${error.message}`);
    } finally {
      busy(row.id, false);
      renderAll();
    }
  }

  // Non-admin taking over an admin-placed call: DELETE with ?takeover=1 then claim.
  async function takeover(row) {
    busy(row.id, true);
    try {
      await authRequest("DELETE", `/calls/${encodeURIComponent(row.id)}?takeover=1`);
      state.calls.delete(row.id);
      busy(row.id, false);
    } catch (error) {
      busy(row.id, false);
      if (error.status === 404) {
        state.calls.delete(row.id);
      } else {
        renderAll();
        await showAlert(`Unable to take over call on ${row.name}: ${error.message}`);
        return;
      }
    }
    const live = targetRows().find((r) => r.id === row.id) || row;
    await claim(live);
  }

  async function release(row, call, reason = "manual") {
    const isOwnCall = state.player && String(call.calledById) === String(state.player.id);
    if (reason === "manual" && !isOwnCall) return;
    busy(row.id, true);
    try {
      await authRequest("DELETE", `/calls/${encodeURIComponent(row.id)}`);
      state.calls.delete(row.id);
    } catch (error) {
      if (error.status === 404) state.calls.delete(row.id);
      else if (reason === "manual") await showAlert(`Unable to release ${row.name}: ${error.message}`);
    } finally {
      busy(row.id, false);
      renderAll();
    }
  }

  async function patch(row, changes) {
    busy(row.id, true);
    try {
      const { data } = await authRequest("PATCH", `/calls/${encodeURIComponent(row.id)}`, changes);
      state.calls.set(row.id, data.call);
    } catch (error) {
      if (error.status === 404) state.calls.delete(row.id);
      else await showAlert(`Unable to update ${row.name}: ${error.message}`);
    } finally {
      busy(row.id, false);
      renderAll();
    }
  }

  function ensureControl(row) {
    if (!row.member) return null;
    let control = row.li.querySelector(`.twi-call-control[data-twi-target-id="${CSS.escape(row.id)}"]`);
    if (control) return control;
    control = document.createElement("div");
    control.className = "twi-call-control";
    control.dataset.twiTargetId = row.id;
    control.innerHTML = `
      <button type="button" class="twi-call-main">
        <span class="twi-state-dot" aria-hidden="true"></span>
        <span class="twi-call-label">CALL</span>
      </button>
      <div class="twi-call-meta"></div>
      <div class="twi-call-actions" hidden>
        <button type="button" class="twi-flag twi-priority" aria-label="Toggle priority">
          <svg class="twi-flag-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.4l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.5z"/>
          </svg>
        </button>
        <button type="button" class="twi-flag twi-assist" aria-label="Toggle assist request">
          <svg class="twi-flag-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10v4h3l5 4V6L6 10H3zm10-2.5v9a5 5 0 0 0 0-9zm0-4v2.06a7 7 0 0 1 0 12.88v2.06a9 9 0 0 0 0-17z"/>
          </svg>
        </button>
      </div>`;
    control.querySelector(".twi-call-main").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const live = targetRows().find((r) => r.id === row.id) || row;
      const call = state.calls.get(row.id);
      if (!call) { claim(live); return; }
      const isOwn = state.player && String(call.calledById) === String(state.player.id);
      // Any non-owner can take over an admin-placed call (including other admins)
      if (isAdminCall(call) && !isOwn) { takeover(live); return; }
      if (isOwn) release(live, call);
    });
    control.querySelector(".twi-priority").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const live = targetRows().find((r) => r.id === row.id) || row;
      const call = state.calls.get(row.id);
      // Admin with no existing call: claim immediately with priority set
      if (!call && isAdmin()) { claim(live, { priority: true }); return; }
      if (call) patch(row, { priority: !call.priority });
    });
    control.querySelector(".twi-assist").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const live = targetRows().find((r) => r.id === row.id) || row;
      const call = state.calls.get(row.id);
      // Admin with no existing call: claim immediately with assist set
      if (!call && isAdmin()) { claim(live, { assistRequested: true }); return; }
      if (call) patch(row, { assistRequested: !call.assistRequested });
    });
    row.member.appendChild(control);
    return control;
  }

  function removeAllControls() {
    document.querySelectorAll(".twi-call-control").forEach((el) => el.remove());
    document.querySelectorAll(".members-list li.enemy")
      .forEach((li) => li.classList.remove("twi-priority-row", "twi-assist-row"));
  }

  function renderRow(row) {
    if (!state.enabled) return;
    const control = ensureControl(row);
    if (!control) return;
    const main = control.querySelector(".twi-call-main");
    const label = control.querySelector(".twi-call-label");
    const meta = control.querySelector(".twi-call-meta");
    const actions = control.querySelector(".twi-call-actions");
    const priority = control.querySelector(".twi-priority");
    const assist = control.querySelector(".twi-assist");
    const call = state.calls.get(row.id);

    row.li.classList.toggle("twi-priority-row", Boolean(call?.priority));
    row.li.classList.toggle("twi-assist-row", Boolean(call?.assistRequested));
    // Hospital indicator is independent of call state — show whenever status says so
    const inHosp = hospitalised(row.status);
    row.li.classList.toggle("twi-hosp-row", inHosp);

    if (!call) {
      main.className = `twi-call-main twi-call-free${inHosp ? " twi-call-hosp" : ""}`;
      label.textContent = inHosp ? "H·CALL" : "CALL";
      main.disabled = false;
      main.removeAttribute("title");
      meta.textContent = "";
      // Admins see flag buttons even on unclaimed targets
      actions.hidden = !isAdmin();
      priority.classList.remove("active");
      assist.classList.remove("active");
      return;
    }

    const seconds = remaining(call);
    const isOwnCall = state.player && String(call.calledById) === String(state.player.id);
    const adminPlaced = isAdminCall(call);
    // Blood red for admin-placed calls; takeover button for non-admins
    main.className = `twi-call-main twi-call-called${isOwnCall ? "" : " twi-call-readonly"}${adminPlaced ? " twi-call-admin" : ""}`;
    main.disabled = isOwnCall ? false : !adminPlaced; // non-admin can click admin calls to take over
    label.textContent = adminPlaced && !isOwnCall ? "TAKE" : format(seconds);
    main.removeAttribute("title");
    const displayName = DISPLAY_NAMES.get(String(call.calledById)) || call.calledByName;
    meta.textContent = displayName;
    meta.title = `${call.calledByName} [${call.calledById}]`;
    actions.hidden = false;
    priority.classList.toggle("active", Boolean(call.priority));
    assist.classList.toggle("active", Boolean(call.assistRequested));

    if (seconds <= 0) state.calls.delete(row.id);
  }

  // ── Settings page injection ────────────────────────────────────────────────

  function isSettingsPage() { return location.pathname.includes("/preferences.php"); }

  // Build the settings panel HTML (shared between inline and desktop injection)
  function buildSettingsPanelHTML() {
    return `
      <div class="twi-prefs-card">
        <button type="button" class="twi-prefs-header" aria-expanded="false">
          <span class="twi-prefs-arrow" aria-hidden="true">&#9658;</span>
          <span class="twi-prefs-title-text">TWI Faction Calls Settings</span>
          <span class="twi-prefs-status-badge" id="twi-fc-badge"></span>
        </button>
        <div class="twi-prefs-body" hidden>

          <div class="twi-settings-row">
            <label for="twi-settings-apikey"><strong>Torn API Key</strong></label>
            <input type="text" id="twi-settings-apikey" class="twi-settings-input"
              maxlength="16" placeholder="Paste 16-char API key here..."
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
            <p class="twi-settings-hint">
              Provide your 16-character public API key named <em>Target Caller</em>.
              Used only to confirm membership of Twilight&nbsp;&ndash;&nbsp;Reborn [56966].
            </p>
          </div>

          <div class="twi-settings-row twi-settings-row-inline">
            <input type="checkbox" id="twi-settings-enabled" />
            <label for="twi-settings-enabled">Enable TWI Faction Calls on the War Page</label>
          </div>

          <div class="twi-settings-status" id="twi-settings-status-line"></div>

          <div class="twi-settings-actions">
            <button type="button" id="twi-settings-save" class="torn-btn twi-btn-save">Save &amp; Connect</button>
            <button type="button" id="twi-settings-forget" class="torn-btn twi-btn-secondary">Forget API Key</button>
            <span id="twi-settings-saved-msg" style="display:none;color:#4CAF50;font-weight:bold;margin-left:10px;">&#10003; Saved!</span>
          </div>

        </div>
      </div>`;
  }

  // Wire accordion + save/forget events onto a panel container element
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

    panel.querySelector("#twi-settings-save").addEventListener("click", async () => {
      const keyInput    = panel.querySelector("#twi-settings-apikey");
      const enabledInput = panel.querySelector("#twi-settings-enabled");
      const savedMsg    = panel.querySelector("#twi-settings-saved-msg");
      const newKey = keyInput.value.trim();
      if (newKey && newKey !== state.apiKey) { setApiKey(newKey); clearSession(); }
      const wasEnabled = state.enabled;
      setEnabled(enabledInput.checked);
      // Always attempt auth/reconnect on Save so status updates immediately
      const ok = await authenticate();
      if (!ok) {
        setEnabled(false);
        updateSettingsPanel();
        return;
      }
      if (state.enabled && !wasEnabled) {
        // Just enabled — nothing to refresh yet (no war page open)
      } else if (!state.enabled && wasEnabled) {
        state.connected = false;
        state.calls.clear();
        removeAllControls();
      }
      updateSettingsPanel();
      savedMsg.style.display = "inline";
      setTimeout(() => { savedMsg.style.display = "none"; }, 2500);
    });

    panel.querySelector("#twi-settings-forget").addEventListener("click", async () => {
      if (!(await showConfirm("Forget the saved API key and disconnect?"))) return;
      setApiKey("");
      setEnabled(false);
      state.connected = false;
      state.calls.clear();
      removeAllControls();
      updateSettingsPanel();
    });
  }

  // ── Settings page injection (preferences.php) ──────────────────────────────
  // All platforms: inject accordion panel into the page.
  // Desktop/Android: React root exists — insert after it.
  // iPhone TornPDA: no React root — append to document.body (lands in empty
  //   black space below the "General settings" card, confirmed from screenshot).

  function injectSettingsPage() {
    if (document.getElementById("twi-settings-details")) return;

    const panel = document.createElement("div");
    panel.id = "twi-settings-details";
    panel.innerHTML = buildSettingsPanelHTML();

    const reactRoot = document.getElementById("react-root") ||
                      document.getElementById("root") ||
                      document.getElementById("app");
    if (reactRoot) {
      reactRoot.insertAdjacentElement("afterend", panel);
    } else {
      document.body.appendChild(panel);
    }
    wireSettingsPanel(panel);
    updateSettingsPanel();
  }

  function updateToggleChecked() {
    const cb = document.getElementById("twi-settings-enabled");
    if (cb) cb.checked = state.enabled;
  }

  function updateSettingsPanel() {
    const panel = document.getElementById("twi-settings-details");
    if (!panel) return;
    const keyInput    = panel.querySelector("#twi-settings-apikey");
    const enabledInput = panel.querySelector("#twi-settings-enabled");
    const statusLine  = panel.querySelector("#twi-settings-status-line");
    const badge       = document.getElementById("twi-fc-badge");
    if (keyInput && !keyInput.matches(":focus")) {
      keyInput.value = "";
      keyInput.placeholder = state.apiKey
        ? `API key saved (${state.apiKey.slice(0, 4)}${"*".repeat(12)})`
        : "Paste 16-char API key here...";
    }
    if (enabledInput) enabledInput.checked = state.enabled;
    if (statusLine) {
      if (state.connected) {
        const adminBadge = isAdmin() ? " · ⭐ Admin" : "";
        statusLine.textContent = `✓ Connected as ${state.player?.name || "unknown"} [${state.player?.id || "?"}]${adminBadge}`;
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

  function renderAll() {
    if (!isWarPage()) return;
    if (state.enabled) targetRows().forEach(renderRow);
    updateToggleChecked();
    updateSettingsPanel();
  }

  // ── Tampermonkey menu ─────────────────────────────────────────────────────

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("TWI Calls: Open Settings (Torn Preferences)", () => {
      location.href = "https://www.torn.com/preferences.php";
    });
    GM_registerMenuCommand("TWI Calls: Forget API Key", async () => {
      if (!(await showConfirm("Forget the saved Target Caller API key and session?"))) return;
      setApiKey(""); clearSession(); state.connected = false; state.calls.clear();
      updateSettingsPanel(); updateToggleChecked(); removeAllControls();
    });
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  GM_addStyle(`
    /* ── Toggle checkbox ── */
    .twi-sort-toggle-container{
      position:absolute;left:10px;display:inline-flex;align-items:center
    }
    .twi-sort-toggle-label{
      display:inline-flex;align-items:center;gap:6px;cursor:pointer;
      color:#999;font-size:13px;-webkit-user-select:none;user-select:none
    }
    .twi-sort-toggle-checkbox{cursor:pointer;margin:0;width:13px;height:13px}

    /* ── Preferences page section ── */
    #twi-settings-details {
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
    .twi-prefs-body {
      padding: 16px 16px 20px;
      border-top: 1px solid #3a3a3a;
    }
    .twi-prefs-body[hidden] { display: none; }
    .twi-settings-row{margin-bottom:14px}
    .twi-settings-row label{font-size:13px;color:#ccc;display:block;margin-bottom:6px}
    .twi-settings-row-inline{display:flex;align-items:center;gap:8px;margin-bottom:14px}
    .twi-settings-row-inline input[type=checkbox]{width:16px;height:16px;cursor:pointer;flex-shrink:0}
    .twi-settings-row-inline label{cursor:pointer;font-size:13px;color:#ccc;margin-bottom:0}
    .twi-settings-input{
      display:block;width:100%;max-width:100%;
      padding:10px 12px;border:1px solid #555;border-radius:6px;
      background:#1a1a1a;color:#fff;font-size:16px;font-family:monospace;
      box-sizing:border-box
    }
    .twi-settings-input:focus{outline:none;border-color:#4a9eff}
    .twi-settings-hint{margin:6px 0 0;font-size:12px;color:#888;line-height:1.5}
    .twi-settings-status{margin:10px 0 14px;font-size:13px;min-height:18px;font-weight:500}
    .twi-settings-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:4px}
    .twi-btn-save{background:#2f9e44!important;color:#fff!important}
    .twi-btn-save:hover{background:#37b24d!important}
    .twi-btn-secondary{background:#555!important;color:#ddd!important}
    .twi-btn-secondary:hover{background:#666!important}

    /* ── Call buttons ── */
    .twi-call-main,.twi-flag{
      border:1px solid rgba(0,0,0,.25);border-radius:4px;font-weight:700;
      cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none
    }
    .twi-call-main{
      display:inline-flex;align-items:center;justify-content:center;gap:3px;
      padding:1px 5px;background:rgba(20,20,20,.82);color:#fff;
      white-space:nowrap;font-size:10px
    }
    .twi-state-dot{
      display:inline-block;width:7px;height:7px;min-width:7px;
      border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,.65)
    }
    .twi-call-free .twi-state-dot{background:#32c94b}
    .twi-call-called .twi-state-dot{background:#ef3f3f}
    .twi-call-label{font-weight:800;line-height:1}
    .twi-call-main:disabled{opacity:1!important}
    .twi-call-readonly{cursor:default!important;filter:none!important}
    .twi-call-meta{
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      font-weight:700;color:var(--default-color,#ddd);font-size:9px;max-width:70px
    }
    .twi-call-actions{display:inline-flex;align-items:center;gap:2px}
    .twi-call-actions[hidden]{display:none!important}
    .twi-flag{
      display:inline-flex;align-items:center;justify-content:center;
      width:18px;min-width:18px;height:18px;padding:0;
      background:rgba(18,18,18,.82);color:#d7d7d7;
      border-color:rgba(255,255,255,.18)
    }
    .twi-flag-icon{display:block;width:11px;height:11px;fill:currentColor;pointer-events:none}
    .twi-priority.active{background:#f6c344;color:#3d2f00;border-color:#ffe28a}
    .twi-assist.active{background:#f08c00;color:#fff;border-color:#ffc168}
    .twi-call-control.twi-busy{opacity:.55;pointer-events:none}
    .members-list li.twi-priority-row{box-shadow:inset 4px 0 0 #f6c344!important}
    .members-list li.twi-assist-row{outline:2px solid rgba(240,140,0,.75);outline-offset:-2px}
    .members-list li.twi-hosp-row .twi-call-hosp{background:rgba(52,100,185,.82)!important;border-color:rgba(100,160,255,.4)!important}
    .members-list li.twi-hosp-row .twi-call-hosp .twi-state-dot{background:#69a0ff}
    .twi-call-admin{background:#8b0000!important;border-color:rgba(255,80,80,.35)!important;color:#fff!important;cursor:pointer!important}
    .twi-call-admin .twi-state-dot{background:#ff4444!important}
    .twi-call-admin.twi-call-readonly{cursor:pointer!important}

    /* ── Alert / Confirm modals ── */
    .twi-modal-overlay{
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.75);z-index:99999;
      display:flex;align-items:center;justify-content:center;
      padding:20px;box-sizing:border-box;
      animation:twiModalFadeIn 0.2s ease-out
    }
    .twi-modal-container{
      background:#2b2b2b;border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      max-width:500px;width:100%;max-height:90vh;overflow:auto;
      animation:twiModalSlideIn 0.3s ease-out
    }
    .twi-modal-header{
      background:#1a1a1a;color:#fff;padding:16px 20px;
      font-size:16px;font-weight:700;border-radius:12px 12px 0 0;
      border-bottom:1px solid #444
    }
    .twi-modal-body{padding:20px;color:#ddd}
    .twi-modal-message{margin:0 0 16px;font-size:14px;line-height:1.5;white-space:pre-wrap}
    .twi-modal-footer{
      display:flex;gap:10px;padding:16px 20px;
      border-top:1px solid #444;background:#222;border-radius:0 0 12px 12px
    }
    .twi-modal-btn{
      flex:1;padding:14px 20px;font-size:15px;font-weight:700;
      border:none;border-radius:8px;cursor:pointer;
      touch-action:manipulation;min-height:48px
    }
    .twi-modal-btn-cancel{background:#444;color:#ddd}
    .twi-modal-btn-primary{background:#2f9e44;color:#fff}
    @keyframes twiModalFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes twiModalSlideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}

    /* ── API key prompt modal ── */
    #twi-api-key-modal{
      position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      padding:16px;background:rgba(0,0,0,.72);box-sizing:border-box
    }
    .twi-key-dialog{
      width:min(420px,100%);padding:18px;
      border:1px solid rgba(255,255,255,.2);border-radius:10px;
      background:#292929;color:#eee;
      box-shadow:0 10px 35px rgba(0,0,0,.65);
      font-family:inherit;box-sizing:border-box
    }
    .twi-key-title{margin-bottom:10px;font-size:18px;font-weight:800;color:#9bd45a}
    .twi-key-copy{margin-bottom:12px;font-size:13px;line-height:1.45}
    .twi-key-input{
      display:block;width:100%;height:44px;padding:8px 10px;
      border:1px solid #777;border-radius:6px;
      background:#151515;color:#fff;
      font-family:monospace;font-size:16px;box-sizing:border-box
    }
    .twi-key-input:focus{border-color:#69d47d;outline:none;box-shadow:0 0 0 2px rgba(105,212,125,.25)}
    .twi-key-error{min-height:18px;margin-top:6px;color:#ff7777;font-size:12px}
    .twi-key-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
    .twi-key-buttons button{
      min-height:42px;padding:8px 18px;
      border:1px solid rgba(255,255,255,.2);border-radius:6px;
      color:#fff;font-size:14px;font-weight:700;
      touch-action:manipulation;cursor:pointer
    }
    .twi-key-cancel{background:#555}
    .twi-key-save{background:#2f9e44}

    /* ── Mobile (≤900px): same absolute-below-name approach as desktop ── */
    /* padding-bottom on li reserves space; button sits below .member     */
    @media(max-width:900px){
      .members-list li.enemy{
        position:relative!important;
        padding-bottom:18px!important;
        box-sizing:border-box!important;
        overflow:visible!important
      }
      .members-list li .member{position:relative!important;overflow:visible!important}
      .twi-call-control{
        position:absolute!important;
        top:100%!important;left:0!important;
        margin-top:1px!important;
        display:inline-flex!important;flex-wrap:nowrap!important;
        align-items:center!important;gap:3px!important;
        z-index:9!important;padding:0!important
      }
      .twi-call-main{
        height:16px!important;min-height:16px!important;min-width:42px!important;
        padding:1px 5px!important;gap:3px!important;
        font-size:9px!important;border-radius:3px!important
      }
      .twi-state-dot{width:6px!important;height:6px!important;min-width:6px!important}
      .twi-call-meta{max-width:52px!important;font-size:8px!important}
      .twi-call-actions{display:inline-flex!important;flex:0 0 auto!important;gap:2px!important}
      .twi-call-actions[hidden]{display:none!important}
      .twi-flag{
        width:16px!important;min-width:16px!important;
        height:16px!important;padding:0!important;border-radius:3px!important
      }
      .twi-flag-icon{width:10px!important;height:10px!important}
      .twi-sort-toggle-checkbox{width:20px!important;height:20px!important}
      .twi-sort-toggle-label{font-size:15px!important;gap:8px!important}
      .twi-settings-input{font-size:16px!important}
    }

    /* ── Tablet + Desktop (≥901px): button absolutely below name banner ── */
    @media(min-width:901px){
      .members-list li.enemy{
        position:relative!important;
        padding-bottom:22px!important;
        box-sizing:border-box!important;
        overflow:visible!important
      }
      .members-list li .member{position:relative!important;overflow:visible!important}
      .twi-call-control{
        position:absolute!important;top:100%!important;left:0!important;
        margin-top:1px!important;display:inline-flex!important;
        align-items:center!important;gap:3px!important;
        padding:0!important;min-width:0!important;z-index:9!important
      }
      .twi-call-main{
        height:18px!important;min-height:18px!important;min-width:50px!important;
        padding:1px 5px!important;gap:3px!important;
        font-size:10px!important;border-radius:3px!important
      }
      .twi-state-dot{width:7px!important;height:7px!important;min-width:7px!important}
      .twi-call-meta{max-width:72px!important;font-size:9px!important}
      .twi-call-actions{gap:2px!important}
      .twi-flag{width:18px!important;min-width:18px!important;height:18px!important;border-radius:3px!important}
      .twi-flag-icon{width:11px!important;height:11px!important}
    }

  `);

  // ── Observers & polling ────────────────────────────────────────────────────

  let renderTimer = null;
  let lastWarContainer = null;
  let warObserver = null;

  function scheduleRender(delay = 80) {
    if (!isWarPage()) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { renderTimer = null; renderAll(); }, delay);
  }

  function mutationNeedsRender(mutations) {
    for (const mutation of mutations) {
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (node.id === "twi-calls-toggle-container" ||
                node.id === "twi-settings-details" ||
                node.classList?.contains("twi-call-control") ||
                node.classList?.contains("twi-modal-overlay") ||
                node.closest?.(".twi-call-control, .twi-modal-overlay")) continue;
        if (node.matches?.("li.enemy, ul.members-list, .faction-war") ||
            node.querySelector?.("li.enemy, ul.members-list, .faction-war")) return true;
      }
    }
    return false;
  }

  function attachWarObserver() {
    const container = document.querySelector("#faction_war_list_id") ||
      document.querySelector(".faction-war")?.parentElement || null;
    if (container === lastWarContainer) return;
    warObserver?.disconnect();
    warObserver = null;
    lastWarContainer = container;
    if (!container) return;
    warObserver = new MutationObserver((mutations) => {
      if (mutationNeedsRender(mutations)) scheduleRender();
    });
    warObserver.observe(container, { childList: true, subtree: true });
  }

  // Clean up CALL controls whenever the war tab is no longer active.
  function ensureUI() {
    if (isSettingsPage()) { injectSettingsPage(); return; }
    if (!isWarPage()) removeAllControls();
  }

  const pageObserver = new MutationObserver((mutations) => {
    ensureUI();
    if (!isWarPage()) return;
    if (!lastWarContainer || !lastWarContainer.isConnected) {
      attachWarObserver();
      scheduleRender();
      return;
    }
    if (mutationNeedsRender(mutations)) scheduleRender();
  });
  pageObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Countdown ticker
  setInterval(() => {
    if (!isWarPage() || !state.enabled) return;
    for (const row of targetRows()) {
      const call = state.calls.get(row.id);
      if (!call) continue;
      const main = row.li.querySelector(`.twi-call-control[data-twi-target-id="${CSS.escape(row.id)}"] .twi-call-main`);
      const lbl = main?.querySelector(".twi-call-label");
      if (lbl) lbl.textContent = format(remaining(call));
    }
  }, COUNTDOWN_MS);

  // Shared rate-limit gate — all refresh triggers check this so no combination
  // of interval + visibilitychange + hashchange can exceed 1 call per POLL_MS.
  let lastPollTime = 0;

  function pollDue() {
    return Date.now() - lastPollTime >= POLL_MS;
  }

  async function throttledRefresh() {
    if (!isWarPage() || !state.enabled) return;
    if (state.authenticating || state.polling) return;
    if (document.visibilityState === "hidden") return;
    if (!pollDue()) return;
    lastPollTime = Date.now();
    await refreshCalls();
    scheduleRender();
  }

  // Interval — drives steady-state polling at POLL_MS cadence.
  setInterval(throttledRefresh, POLL_MS);

  // On resume from background — fire immediately instead of waiting for next tick.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") throttledRefresh();
  });

  window.addEventListener("hashchange", async () => {
    ensureUI();
    if (isWarPage()) {
      attachWarObserver();
      if (state.enabled) { await authenticate(); }
      throttledRefresh();
      scheduleRender(0);
    }
  });

  // Reflect connected state immediately if a valid session is already stored —
  // so the settings panel shows the correct status without waiting for a fresh auth.
  if (validSession()) state.connected = true;

  (async () => {
    ensureUI();
    if (isWarPage()) {
      attachWarObserver();
      if (state.enabled) { await authenticate(); await refreshCalls(); }
      scheduleRender(0);
    }
  })();

})();
