// ==UserScript==
// @name         TWI Faction Calls Android Debug
// @namespace    twilight-reborn
// @version      1.0.12
// @author       Leandria & Wolf
// @description  Android debug build: always prompts for the Target Caller API key on every Torn war-page load.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @connect      torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Faction_Calls_Android_Debug_v1.0.12.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Faction_Calls_Android_Debug_v1.0.12.user.js
// ==/UserScript==

// v1.0.12 — Restored GM_xmlhttpRequest (no timeout/ontimeout fields) to fix
// CORS block that prevented fetch() from reaching the API server in TornPDA.
// Kept <style> element injection (no GM_addStyle needed).

(function () {
  "use strict";

  const APP_NAME    = "TWI Faction Calls";
  const API_BASE    = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const ALLOWED_FACTION_ID = 56966;
  const POLL_MS     = 2000;
  const COUNTDOWN_MS = 1000;
  const PREFIX      = "twi-faction-calls-";
  const DEBUG_ALWAYS_PROMPT = true;

  const state = {
    apiKey: "",
    token: "",
    expiresAt: "",
    player: null,
    calls: new Map(),
    authenticating: null,
    polling: false,
    connected: false,
    lastError: "",
    autoClearing: new Set(),
    promptedThisLoad: false
  };

  function setApiKey(value) {
    state.apiKey = String(value || "").trim();
    state.apiKey
      ? localStorage.setItem(`${PREFIX}api-key`, state.apiKey)
      : localStorage.removeItem(`${PREFIX}api-key`);
    clearSession();
  }

  function saveSession(data) {
    state.token    = data.sessionToken;
    state.expiresAt = data.expiresAt;
    state.player   = data.player;
    // In debug mode we deliberately don't persist the session so every load re-prompts
  }

  function clearSession() {
    state.token = "";
    state.expiresAt = "";
    state.player = null;
    localStorage.removeItem(`${PREFIX}session-token`);
    localStorage.removeItem(`${PREFIX}session-expires`);
    localStorage.removeItem(`${PREFIX}player`);
  }

  function isWarPage() {
    return location.pathname.endsWith("/factions.php") && (location.hash || "").startsWith("#/war/");
  }

  function validSession() {
    if (DEBUG_ALWAYS_PROMPT && !state.promptedThisLoad) return false;
    return Boolean(
      state.token && state.player &&
      Number(state.player.factionId) === ALLOWED_FACTION_ID &&
      Date.parse(state.expiresAt) - Date.now() > 60000
    );
  }

  // ── HTTP — GM_xmlhttpRequest (CORS-bypass, no timeout/ontimeout fields) ──
  // fetch() is blocked by CORS in TornPDA's WebView. GM_xmlhttpRequest bypasses
  // CORS just like Tampermonkey does. timeout/ontimeout are omitted because
  // TornPDA's GM implementation silently drops requests that include them.
  // A manual setTimeout provides the 12s timeout instead.

  function request(method, path, body, authenticated = true) {
    return new Promise((resolve, reject) => {
      const headers = { "Content-Type": "application/json" };
      if (authenticated && state.token) headers.Authorization = `Bearer ${state.token}`;

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
            error.data   = data;
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

  // ── Custom modals (alert/confirm replacements) ────────────────────────────

  function createBaseModal(html) {
    document.getElementById("twi-modal-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "twi-modal-overlay";
    overlay.innerHTML = html;
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  function showAlert(message) {
    return new Promise((resolve) => {
      const overlay = createBaseModal(`
        <div class="twi-dialog" role="alertdialog" aria-modal="true">
          <div class="twi-dlg-title">${APP_NAME}</div>
          <div class="twi-dlg-body">${String(message).replace(/\n/g, "<br>")}</div>
          <div class="twi-dlg-buttons">
            <button type="button" class="twi-dlg-ok">OK</button>
          </div>
        </div>`);
      const finish = () => { overlay.remove(); resolve(); };
      overlay.querySelector(".twi-dlg-ok").addEventListener("click", finish);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(); });
    });
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      const overlay = createBaseModal(`
        <div class="twi-dialog" role="dialog" aria-modal="true">
          <div class="twi-dlg-title">${APP_NAME}</div>
          <div class="twi-dlg-body">${String(message).replace(/\n/g, "<br>")}</div>
          <div class="twi-dlg-buttons">
            <button type="button" class="twi-dlg-cancel">Cancel</button>
            <button type="button" class="twi-dlg-ok">OK</button>
          </div>
        </div>`);
      const finish = (v) => { overlay.remove(); resolve(v); };
      overlay.querySelector(".twi-dlg-ok").addEventListener("click", () => finish(true));
      overlay.querySelector(".twi-dlg-cancel").addEventListener("click", () => finish(false));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(false); });
    });
  }

  // ── API key prompt modal ──────────────────────────────────────────────────

  function requestApiKey(initialValue = "") {
    return new Promise((resolve) => {
      document.getElementById("twi-api-key-modal")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "twi-api-key-modal";
      overlay.innerHTML = `
        <div class="twi-key-dialog" role="dialog" aria-modal="true">
          <div class="twi-key-title">TWI Faction Calls</div>
          <div class="twi-key-copy">
            Enter your 16-character Torn Public API key named <strong>Target Caller</strong>.
            Used only to confirm membership of Twilight&nbsp;-&nbsp;Reborn [56966].
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
      // Synchronous focus — setTimeout blocked by User Activation API on Android 16
      input.focus();
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function authenticate(force = false) {
    if (!force && validSession()) return true;
    if (state.authenticating) return state.authenticating;

    state.authenticating = (async () => {
      if (DEBUG_ALWAYS_PROMPT && !state.promptedThisLoad) {
        const entered = await requestApiKey("");
        if (entered === null) return false;
        state.apiKey = entered;
        state.promptedThisLoad = true;
        clearSession();
      } else if (!state.apiKey) {
        const entered = await requestApiKey("");
        if (entered === null) return false;
        setApiKey(entered);
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
        return true;
      } catch (err) {
        clearSession();
        state.connected = false;
        if (err.data?.error === "wrong_faction")
          state.lastError = "This API key is not a member of Twilight - Reborn [56966].";
        else if (err.data?.error === "torn_api_error")
          state.lastError = `Torn rejected the key: ${err.data.tornMessage || "Unknown error"}`;
        else
          state.lastError = err.message;
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
    catch (err) {
      if (err.status === 401) {
        clearSession();
        if (await authenticate(true)) return request(method, path, body, true);
      }
      throw err;
    }
  }

  // ── War page helpers ──────────────────────────────────────────────────────

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
    return status.classList.contains("hospital") || status.classList.contains("jail") ||
      /hospital|jail/i.test(status.getAttribute("class") || "");
  }

  function remaining(call) {
    return Math.max(0, Math.ceil((Date.parse(call.expiresAt) - Date.now()) / 1000));
  }

  function format(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  async function refreshCalls() {
    if (state.polling || !isWarPage()) return;
    state.polling = true;
    try {
      const { data } = await authRequest("GET", "/calls");
      state.calls = new Map((data.calls || []).map((c) => [String(c.targetId), c]));
      state.connected = true;
      state.lastError = "";
    } catch (err) {
      state.connected = false;
      state.lastError = err.message;
    } finally {
      state.polling = false;
    }
  }

  function busy(id, value) {
    document.querySelectorAll(`[data-twi-target-id="${CSS.escape(String(id))}"]`)
      .forEach((el) => el.classList.toggle("twi-busy", value));
  }

  async function claim(row) {
    busy(row.id, true);
    try {
      const { data } = await authRequest("POST", "/calls", { targetId: row.id, targetName: row.name });
      state.calls.set(row.id, data.call);
    } catch (err) {
      if (err.status === 409 && err.data?.call) state.calls.set(row.id, err.data.call);
      else await showAlert(`Unable to call ${row.name}: ${err.message}`);
    } finally { busy(row.id, false); renderAll(); }
  }

  async function release(row, call, reason = "manual") {
    const isOwnCall = state.player && String(call.calledById) === String(state.player.id);
    if (reason === "manual" && !isOwnCall) return;
    busy(row.id, true);
    try {
      await authRequest("DELETE", `/calls/${encodeURIComponent(row.id)}`);
      state.calls.delete(row.id);
    } catch (err) {
      if (err.status === 404) state.calls.delete(row.id);
      else if (reason === "manual") await showAlert(`Unable to release ${row.name}: ${err.message}`);
    } finally { busy(row.id, false); renderAll(); }
  }

  async function patch(row, changes) {
    busy(row.id, true);
    try {
      const { data } = await authRequest("PATCH", `/calls/${encodeURIComponent(row.id)}`, changes);
      state.calls.set(row.id, data.call);
    } catch (err) {
      if (err.status === 404) state.calls.delete(row.id);
      else await showAlert(`Unable to update ${row.name}: ${err.message}`);
    } finally { busy(row.id, false); renderAll(); }
  }

  function ensureControl(row) {
    if (!row.member) return null;
    let ctrl = row.li.querySelector(`.twi-call-control[data-twi-target-id="${CSS.escape(row.id)}"]`);
    if (ctrl) return ctrl;
    ctrl = document.createElement("div");
    ctrl.className = "twi-call-control";
    ctrl.dataset.twiTargetId = row.id;
    ctrl.innerHTML = `
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
    ctrl.querySelector(".twi-call-main").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const live = targetRows().find((r) => r.id === row.id) || row;
      const call = state.calls.get(row.id);
      if (!call) { claim(live); return; }
      if (state.player && String(call.calledById) === String(state.player.id)) release(live, call);
    });
    ctrl.querySelector(".twi-priority").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const call = state.calls.get(row.id);
      if (call) patch(row, { priority: !call.priority });
    });
    ctrl.querySelector(".twi-assist").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const call = state.calls.get(row.id);
      if (call) patch(row, { assistRequested: !call.assistRequested });
    });
    row.member.appendChild(ctrl);
    return ctrl;
  }

  function renderRow(row) {
    const ctrl   = ensureControl(row);
    if (!ctrl) return;
    const main   = ctrl.querySelector(".twi-call-main");
    const label  = ctrl.querySelector(".twi-call-label");
    const meta   = ctrl.querySelector(".twi-call-meta");
    const actions = ctrl.querySelector(".twi-call-actions");
    const priority = ctrl.querySelector(".twi-priority");
    const assist = ctrl.querySelector(".twi-assist");
    const call   = state.calls.get(row.id);

    row.li.classList.toggle("twi-priority-row", Boolean(call?.priority));
    row.li.classList.toggle("twi-assist-row",   Boolean(call?.assistRequested));

    if (!call) {
      main.className = "twi-call-main twi-call-free";
      label.textContent = "CALL";
      main.disabled = false;
      meta.textContent = "";
      actions.hidden = true;
      return;
    }

    const secs = remaining(call);
    const isOwn = state.player && String(call.calledById) === String(state.player.id);
    main.className = `twi-call-main twi-call-called${isOwn ? "" : " twi-call-readonly"}`;
    label.textContent = format(secs);
    main.disabled = !isOwn;
    meta.textContent = call.calledByName;
    meta.title = `${call.calledByName} [${call.calledById}]`;
    actions.hidden = false;
    priority.classList.toggle("active", Boolean(call.priority));
    assist.classList.toggle("active", Boolean(call.assistRequested));

    if (secs <= 0) state.calls.delete(row.id);
    if (hospitalised(row.status) && !state.autoClearing.has(row.id)) {
      state.autoClearing.add(row.id);
      release(row, call, "hospital").finally(() => setTimeout(() => state.autoClearing.delete(row.id), 3000));
    }
  }

  function statusChip() {
    let chip = document.getElementById("twi-faction-calls-status");
    if (chip) return chip;
    chip = document.createElement("button");
    chip.id = "twi-faction-calls-status";
    chip.type = "button";
    chip.addEventListener("click", () => {
      const msg =
        `Server: ${state.connected ? "Connected" : "Disconnected"}\n` +
        `Player: ${state.player?.name || "Unknown"}${state.player?.id ? ` [${state.player.id}]` : ""}\n` +
        `Faction: Twilight - Reborn [${ALLOWED_FACTION_ID}]\n` +
        `Session: ${state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "Not authenticated"}` +
        (state.lastError ? `\n\nLast error: ${state.lastError}` : "");
      showAlert(msg);
    });
    (document.body || document.documentElement).appendChild(chip);
    return chip;
  }

  function updateChip() {
    const chip = statusChip();
    chip.hidden = !isWarPage();
    if (chip.hidden) return;
    chip.classList.toggle("connected",    state.connected);
    chip.classList.toggle("disconnected", !state.connected);
    chip.textContent = state.connected ? "TWI Debug ✓" : "TWI Debug !";
    chip.title = state.connected
      ? `${state.player?.name || "Member"} — tap for status`
      : state.lastError || "Disconnected";
  }

  function renderAll() {
    if (!isWarPage()) { updateChip(); return; }
    targetRows().forEach(renderRow);
    updateChip();
  }

  // ── Debug banner — injected immediately so we know the script ran ─────────
  const debugBanner = document.createElement("div");
  debugBanner.id = "twi-android-debug-banner";
  debugBanner.textContent = "TWI Debug v1.0.11 \u2713";
  (document.body || document.documentElement).appendChild(debugBanner);

  // ── Styles — inline <style> element, no GM_addStyle needed ───────────────
  const _style = document.createElement("style");
  _style.textContent = `
    #twi-android-debug-banner{
      position:fixed;top:8px;left:50%;transform:translateX(-50%);
      z-index:2147483646;padding:6px 12px;border-radius:6px;
      background:#8b2fc9;color:#fff;font-size:11px;font-weight:800;
      box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none
    }
    .members-list li .member{min-width:0}
    .twi-call-control{
      display:inline-flex;align-items:center;gap:4px;margin-left:auto;
      padding-left:5px;padding-right:24px;min-width:92px;box-sizing:border-box;
      font-family:Arial,sans-serif;font-size:10px;line-height:1.1;z-index:8
    }
    .twi-call-main,.twi-flag{
      border:1px solid rgba(0,0,0,.25);border-radius:5px;font-weight:700;
      cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none
    }
    .twi-call-main{
      display:inline-flex;align-items:center;justify-content:center;gap:4px;
      min-width:64px;min-height:26px;padding:3px 6px;
      background:rgba(20,20,20,.72);color:#fff;white-space:nowrap
    }
    .twi-state-dot{
      display:inline-block;width:9px;height:9px;min-width:9px;
      border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,.65)
    }
    .twi-call-free .twi-state-dot{background:#32c94b}
    .twi-call-called .twi-state-dot{background:#ef3f3f}
    .twi-call-label{font-weight:800;line-height:1}
    .twi-call-main:disabled{opacity:1!important}
    .twi-call-readonly{cursor:default!important;filter:none!important}
    .twi-call-meta{
      max-width:72px;overflow:hidden;text-overflow:ellipsis;
      white-space:nowrap;font-weight:700;color:var(--default-color,#ddd)
    }
    .twi-call-actions{display:inline-flex;align-items:center;gap:3px}
    .twi-call-actions[hidden]{display:none!important}
    .twi-flag{
      display:inline-flex;align-items:center;justify-content:center;
      width:26px;min-width:26px;height:26px;padding:0;
      background:rgba(18,18,18,.82);color:#d7d7d7;border-color:rgba(255,255,255,.18)
    }
    .twi-flag-icon{display:block;width:15px;height:15px;fill:currentColor;pointer-events:none}
    .twi-priority.active{background:#f6c344;color:#3d2f00;border-color:#ffe28a}
    .twi-assist.active{background:#f08c00;color:#fff;border-color:#ffc168}
    .twi-call-control.twi-busy{opacity:.55;pointer-events:none}
    .members-list li.twi-priority-row{box-shadow:inset 4px 0 0 #f6c344!important}
    .members-list li.twi-assist-row{outline:2px solid rgba(240,140,0,.75);outline-offset:-2px}
    #twi-modal-overlay,#twi-api-key-modal{
      position:fixed;inset:0;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      padding:16px;background:rgba(0,0,0,.72);box-sizing:border-box
    }
    .twi-dialog,.twi-key-dialog{
      width:min(420px,100%);padding:18px;
      border:1px solid rgba(255,255,255,.2);border-radius:10px;
      background:#292929;color:#eee;
      box-shadow:0 10px 35px rgba(0,0,0,.65);
      font-family:Arial,sans-serif;box-sizing:border-box
    }
    .twi-dlg-title,.twi-key-title{margin-bottom:10px;font-size:18px;font-weight:800;color:#9bd45a}
    .twi-dlg-body,.twi-key-copy{margin-bottom:12px;font-size:13px;line-height:1.45}
    .twi-dlg-buttons,.twi-key-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
    .twi-dlg-buttons button,.twi-key-buttons button{
      min-height:42px;padding:8px 16px;
      border:1px solid rgba(255,255,255,.2);border-radius:6px;
      color:#fff;font-size:14px;font-weight:700;touch-action:manipulation;cursor:pointer
    }
    .twi-dlg-cancel,.twi-key-cancel{background:#555}
    .twi-dlg-ok,.twi-key-save{background:#2f9e44}
    .twi-key-input{
      display:block;width:100%;height:48px;padding:8px 10px;
      border:1px solid #777;border-radius:6px;
      background:#151515;color:#fff;
      font-family:monospace;font-size:16px;box-sizing:border-box
    }
    .twi-key-input:focus{border-color:#69d47d;outline:none;box-shadow:0 0 0 2px rgba(105,212,125,.25)}
    .twi-key-error{min-height:18px;margin-top:6px;color:#ff7777;font-size:12px}
    #twi-faction-calls-status{
      position:fixed;right:12px;bottom:62px;z-index:10000;
      border:1px solid rgba(0,0,0,.3);border-radius:14px;
      padding:8px 12px;color:#fff;font-size:11px;font-weight:700;
      box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;touch-action:manipulation
    }
    #twi-faction-calls-status.connected{background:#2f9e44}
    #twi-faction-calls-status.disconnected{background:#c92a2a}
    @media(max-width:900px){
      .members-list li .member{
        display:flex!important;flex-direction:column!important;
        align-items:stretch!important;justify-content:center!important;
        min-height:54px!important;padding-top:2px!important;
        padding-bottom:2px!important;box-sizing:border-box!important
      }
      .members-list li .member>a{width:100%!important;min-width:0!important}
      .twi-call-control{
        position:static!important;display:flex!important;flex-wrap:nowrap!important;
        align-items:center!important;justify-content:flex-start!important;
        width:100%!important;min-width:0!important;max-width:100%!important;
        margin:2px 0 0!important;padding:0 2px!important;gap:3px!important;
        box-sizing:border-box!important
      }
      .twi-call-main{
        min-width:58px!important;height:28px!important;min-height:28px!important;
        padding:2px 5px!important;font-size:9px!important;border-radius:4px!important
      }
      .twi-state-dot{width:8px!important;height:8px!important;min-width:8px!important}
      .twi-call-meta{
        display:block!important;flex:1 1 auto!important;min-width:0!important;
        max-width:54px!important;font-size:8px!important;
        overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important
      }
      .twi-call-actions{display:inline-flex!important;flex:0 0 auto!important;gap:2px!important}
      .twi-call-actions[hidden]{display:none!important}
      .twi-flag{width:28px!important;min-width:28px!important;height:28px!important;padding:0!important}
      .twi-flag-icon{width:15px!important;height:15px!important}
    }
  `;
  (document.head || document.documentElement).appendChild(_style);

  // ── Observers & polling ───────────────────────────────────────────────────

  let renderTimer = null;
  let lastWarContainer = null;
  let warObserver = null;

  function scheduleRender(delay = 80) {
    if (!isWarPage()) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { renderTimer = null; renderAll(); }, delay);
  }

  function mutationNeedsRender(mutations) {
    for (const m of mutations) {
      for (const node of [...m.addedNodes, ...m.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (node.classList.contains("twi-call-control") ||
            node.id === "twi-faction-calls-status" ||
            node.closest(".twi-call-control")) continue;
        if (node.matches("li.enemy, ul.members-list, .faction-war") ||
            node.querySelector("li.enemy, ul.members-list, .faction-war")) return true;
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

  const pageObserver = new MutationObserver((mutations) => {
    if (!isWarPage()) return;
    if (!lastWarContainer || !lastWarContainer.isConnected) {
      attachWarObserver(); scheduleRender(); return;
    }
    if (mutationNeedsRender(mutations)) scheduleRender();
  });
  pageObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (!isWarPage()) return;
    for (const row of targetRows()) {
      const call = state.calls.get(row.id);
      if (!call) continue;
      const main = row.li.querySelector(`.twi-call-control[data-twi-target-id="${CSS.escape(row.id)}"] .twi-call-main`);
      const lbl = main?.querySelector(".twi-call-label");
      if (lbl) lbl.textContent = format(remaining(call));
    }
  }, COUNTDOWN_MS);

  setInterval(() => { if (isWarPage()) refreshCalls().then(scheduleRender); }, POLL_MS);

  window.addEventListener("hashchange", async () => {
    if (isWarPage()) { attachWarObserver(); await authenticate(); await refreshCalls(); scheduleRender(0); }
    else updateChip();
  });

  (async () => {
    if (isWarPage()) { attachWarObserver(); await authenticate(); await refreshCalls(); scheduleRender(0); }
  })();

})();
