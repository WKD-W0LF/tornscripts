// ==UserScript==
// @name         TWI Faction_Calls (Universal)
// @namespace    twilight-reborn
// @version      1.0.8
// @author       Leandria & Wolf (Universal: Bob)
// @description  Shared target calls, priorities and assist requests for Twilight - Reborn [56966]. Optimized for all devices: mobile, tablet, and desktop.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @connect      torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const APP_NAME = "TWI Faction Calls";
  const API_BASE = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const ALLOWED_FACTION_ID = 56966;
  const POLL_MS = 2000;
  const COUNTDOWN_MS = 1000;
  const PREFIX = "twi-faction-calls-";

  const state = {
    apiKey: localStorage.getItem(`${PREFIX}api-key`) || "",
    token: localStorage.getItem(`${PREFIX}session-token`) || "",
    expiresAt: localStorage.getItem(`${PREFIX}session-expires`) || "",
    player: readJson(`${PREFIX}player`),
    calls: new Map(),
    authenticating: null,
    polling: false,
    connected: false,
    lastError: "",
    autoClearing: new Set()
  };

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function setApiKey(value) {
    state.apiKey = String(value || "").trim();
    state.apiKey ? localStorage.setItem(`${PREFIX}api-key`, state.apiKey) : localStorage.removeItem(`${PREFIX}api-key`);
    clearSession();
  }

  function saveSession(data) {
    state.token = data.sessionToken;
    state.expiresAt = data.expiresAt;
    state.player = data.player;
    localStorage.setItem(`${PREFIX}session-token`, state.token);
    localStorage.setItem(`${PREFIX}session-expires`, state.expiresAt);
    localStorage.setItem(`${PREFIX}player`, JSON.stringify(state.player));
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
    return Boolean(
      state.token && state.player && Number(state.player.factionId) === ALLOWED_FACTION_ID &&
      Date.parse(state.expiresAt) - Date.now() > 60000
    );
  }

  function request(method, path, body, authenticated = true) {
    return new Promise((resolve, reject) => {
      const headers = { "Content-Type": "application/json" };
      if (authenticated && state.token) headers.Authorization = `Bearer ${state.token}`;
      GM_xmlhttpRequest({
        method,
        url: `${API_BASE}${path}`,
        headers,
        data: body === undefined ? undefined : JSON.stringify(body),
        timeout: 12000,
        onload(response) {
          let data;
          try { data = JSON.parse(response.responseText || "{}"); }
          catch { reject(new Error(`Invalid server response (${response.status})`)); return; }
          if (response.status >= 200 && response.status < 300) resolve({ status: response.status, data });
          else {
            const error = new Error(data.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            reject(error);
          }
        },
        ontimeout: () => reject(new Error("Server request timed out")),
        onerror: () => reject(new Error("Unable to reach TWI Faction Calls server"))
      });
    });
  }

  // ========== UNIVERSAL DIALOG SYSTEM ==========
  
  function createModal() {
    const modal = document.createElement("div");
    modal.className = "twi-modal-overlay";
    modal.innerHTML = `
      <div class="twi-modal-container">
        <div class="twi-modal-content"></div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function showPrompt(message, defaultValue = "") {
    return new Promise((resolve) => {
      const modal = createModal();
      const content = modal.querySelector(".twi-modal-content");
      content.innerHTML = `
        <div class="twi-modal-header">${APP_NAME}</div>
        <div class="twi-modal-body">
          <p class="twi-modal-message">${message.replace(/\n/g, '<br>')}</p>
          <input type="text" class="twi-modal-input" value="${defaultValue}" placeholder="Enter API key">
        </div>
        <div class="twi-modal-footer">
          <button type="button" class="twi-modal-btn twi-modal-btn-cancel">Cancel</button>
          <button type="button" class="twi-modal-btn twi-modal-btn-primary">OK</button>
        </div>`;
      
      const input = content.querySelector(".twi-modal-input");
      const cancelBtn = content.querySelector(".twi-modal-btn-cancel");
      const okBtn = content.querySelector(".twi-modal-btn-primary");
      
      input.focus();
      input.select();
      
      const cleanup = (value) => {
        modal.remove();
        resolve(value);
      };
      
      cancelBtn.addEventListener("click", () => cleanup(null));
      okBtn.addEventListener("click", () => cleanup(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") cleanup(input.value);
        if (e.key === "Escape") cleanup(null);
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) cleanup(null);
      });
    });
  }

  function showAlert(message) {
    return new Promise((resolve) => {
      const modal = createModal();
      const content = modal.querySelector(".twi-modal-content");
      content.innerHTML = `
        <div class="twi-modal-header">${APP_NAME}</div>
        <div class="twi-modal-body">
          <p class="twi-modal-message">${message.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="twi-modal-footer">
          <button type="button" class="twi-modal-btn twi-modal-btn-primary">OK</button>
        </div>`;
      
      const okBtn = content.querySelector(".twi-modal-btn-primary");
      
      const cleanup = () => {
        modal.remove();
        resolve();
      };
      
      okBtn.addEventListener("click", cleanup);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) cleanup();
      });
    });
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      const modal = createModal();
      const content = modal.querySelector(".twi-modal-content");
      content.innerHTML = `
        <div class="twi-modal-header">${APP_NAME}</div>
        <div class="twi-modal-body">
          <p class="twi-modal-message">${message.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="twi-modal-footer">
          <button type="button" class="twi-modal-btn twi-modal-btn-cancel">Cancel</button>
          <button type="button" class="twi-modal-btn twi-modal-btn-primary">OK</button>
        </div>`;
      
      const cancelBtn = content.querySelector(".twi-modal-btn-cancel");
      const okBtn = content.querySelector(".twi-modal-btn-primary");
      
      const cleanup = (value) => {
        modal.remove();
        resolve(value);
      };
      
      cancelBtn.addEventListener("click", () => cleanup(false));
      okBtn.addEventListener("click", () => cleanup(true));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) cleanup(false);
      });
    });
  }

  // ========== END DIALOG SYSTEM ==========

  async function authenticate(force = false) {
    if (!force && validSession()) return true;
    if (state.authenticating) return state.authenticating;

    state.authenticating = (async () => {
      if (!state.apiKey) {
        const entered = await showPrompt(
          "Enter your 16-character Torn Public API key named Target Caller.\n\n" +
          "It is used only to confirm membership of Twilight - Reborn [56966]."
        );
        if (entered === null) return false;
        setApiKey(entered);
      }
      if (state.apiKey.length !== 16) {
        await showAlert(`The Target Caller API key must be exactly 16 characters.`);
        return false;
      }
      try {
        const { data } = await request("POST", "/auth", { apiKey: state.apiKey }, false);
        saveSession(data);
        state.connected = true;
        state.lastError = "";
        return true;
      } catch (error) {
        clearSession();
        state.connected = false;
        if (error.data?.error === "wrong_faction") state.lastError = "This API key is not a member of Twilight - Reborn [56966].";
        else if (error.data?.error === "torn_api_error") state.lastError = `Torn rejected the key: ${error.data.tornMessage || "Unknown error"}`;
        else state.lastError = error.message;
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
      state.calls = new Map((data.calls || []).map((call) => [String(call.targetId), call]));
      state.connected = true;
      state.lastError = "";
    } catch (error) {
      state.connected = false;
      state.lastError = error.message;
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
    } catch (error) {
      if (error.status === 409 && error.data?.call) state.calls.set(row.id, error.data.call);
      else await showAlert(`Unable to call ${row.name}: ${error.message}`);
    } finally {
      busy(row.id, false);
      renderAll();
    }
  }

  async function release(row, call, reason = "manual") {
    const isOwnCall = state.player &&
      String(call.calledById) === String(state.player.id);

    // Other faction members can see who made the call, but cannot release it.
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
            <path d="M12 2.5l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.4l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.5z"></path>
          </svg>
        </button>
        <button type="button" class="twi-flag twi-assist" aria-label="Toggle assist request">
          <svg class="twi-flag-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10v4h3l5 4V6L6 10H3zm10-2.5v9a5 5 0 0 0 0-9zm0-4v2.06a7 7 0 0 1 0 12.88v2.06a9 9 0 0 0 0-17z"></path>
          </svg>
        </button>
      </div>`;
    control.querySelector(".twi-call-main").addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const live = targetRows().find((item) => item.id === row.id) || row;
      const call = state.calls.get(row.id);

      if (!call) {
        claim(live);
        return;
      }

      const isOwnCall = state.player &&
        String(call.calledById) === String(state.player.id);

      if (isOwnCall) release(live, call);
    });
    control.querySelector(".twi-priority").addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const call = state.calls.get(row.id);
      if (call) patch(row, { priority: !call.priority });
    });
    control.querySelector(".twi-assist").addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      const call = state.calls.get(row.id);
      if (call) patch(row, { assistRequested: !call.assistRequested });
    });
    row.member.appendChild(control);
    return control;
  }

  function renderRow(row) {
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

    if (!call) {
      main.className = "twi-call-main twi-call-free";
      label.textContent = "CALL";
      main.disabled = false;
      main.removeAttribute("title");
      meta.textContent = "";
      actions.hidden = true;
      return;
    }

    const seconds = remaining(call);
    const isOwnCall = state.player &&
      String(call.calledById) === String(state.player.id);

    main.className = `twi-call-main twi-call-called${isOwnCall ? "" : " twi-call-readonly"}`;
    label.textContent = format(seconds);
    main.disabled = !isOwnCall;
    main.removeAttribute("title");
    meta.textContent = call.calledByName;
    meta.title = `${call.calledByName} [${call.calledById}]`;
    actions.hidden = false;
    priority.classList.toggle("active", Boolean(call.priority));
    assist.classList.toggle("active", Boolean(call.assistRequested));

    if (seconds <= 0) state.calls.delete(row.id);
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
    chip.addEventListener("click", showStatus);
    document.body.appendChild(chip);
    return chip;
  }

  function updateChip() {
    const chip = statusChip();
    chip.hidden = !isWarPage();
    if (chip.hidden) return;
    chip.classList.toggle("connected", state.connected);
    chip.classList.toggle("disconnected", !state.connected);
    chip.textContent = state.connected ? "TWI Calls ✓" : "TWI Calls !";
    chip.title = state.connected ? `${state.player?.name || "Member"} — connected` : state.lastError || "Disconnected";
  }

  function renderAll() {
    if (!isWarPage()) { updateChip(); return; }
    targetRows().forEach(renderRow);
    updateChip();
  }

  async function showStatus() {
    await showAlert(`Server: ${state.connected ? "Connected" : "Disconnected"}\n` +
      `Player: ${state.player?.name || "Unknown"}${state.player?.id ? ` [${state.player.id}]` : ""}\n` +
      `Faction: Twilight - Reborn [${ALLOWED_FACTION_ID}]\n` +
      `Session expires: ${state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "Not authenticated"}` +
      (state.lastError ? `\n\nLast error: ${state.lastError}` : ""));
  }

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("TWI Calls: Set Target Caller API Key", async () => {
      const entered = await showPrompt("Enter your 16-character Torn Public API key named Target Caller:", state.apiKey);
      if (entered === null) return;
      setApiKey(entered);
      await authenticate(true);
      await refreshCalls();
      renderAll();
    });
    GM_registerMenuCommand("TWI Calls: Connection Status", showStatus);
    GM_registerMenuCommand("TWI Calls: Forget API Key", async () => {
      if (!(await showConfirm("Forget the saved Target Caller API key and session?"))) return;
      setApiKey(""); state.connected = false; state.calls.clear(); renderAll();
    });
  }

  GM_addStyle(`
    .members-list li .member{min-width:0}
    .twi-call-control{display:inline-flex;align-items:center;gap:4px;margin-left:auto;padding-left:5px;padding-right:24px;min-width:92px;box-sizing:border-box;font-family:Arial,sans-serif;font-size:10px;line-height:1.1;z-index:8}
    .twi-call-main,.twi-flag{border:1px solid rgba(0,0,0,.25);border-radius:5px;font-weight:700;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-user-select:none}
    .twi-call-main{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:64px;min-height:26px;padding:3px 6px;background:rgba(20,20,20,.72);color:#fff;white-space:nowrap}
    .twi-state-dot{display:inline-block;width:9px;height:9px;min-width:9px;border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,.65)}
    .twi-call-free .twi-state-dot{background:#32c94b}
    .twi-call-called .twi-state-dot{background:#ef3f3f}
    .twi-call-label{font-weight:800;line-height:1}
    .twi-call-main:disabled{opacity:1!important}.twi-call-readonly{cursor:default!important;filter:none!important}
    .twi-call-meta{max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:var(--default-color,#ddd)}
    .twi-call-actions{display:inline-flex;align-items:center;gap:3px}.twi-call-actions[hidden]{display:none!important}
    .twi-flag{display:inline-flex;align-items:center;justify-content:center;width:26px;min-width:26px;height:26px;padding:0;background:rgba(18,18,18,.82);color:#d7d7d7;border-color:rgba(255,255,255,.18)}
    .twi-flag-icon{display:block;width:15px;height:15px;fill:currentColor;pointer-events:none}
    .twi-priority.active{background:#f6c344;color:#3d2f00;border-color:#ffe28a}
    .twi-assist.active{background:#f08c00;color:#fff;border-color:#ffc168}
    .twi-call-control.twi-busy{opacity:.55;pointer-events:none}.members-list li.twi-priority-row{box-shadow:inset 4px 0 0 #f6c344!important}.members-list li.twi-assist-row{outline:2px solid rgba(240,140,0,.75);outline-offset:-2px}
    #twi-faction-calls-status{position:fixed;right:12px;bottom:62px;z-index:10000;border:1px solid rgba(0,0,0,.3);border-radius:14px;padding:8px 12px;color:#fff;font-size:12px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;touch-action:manipulation;min-width:44px;min-height:44px}
    #twi-faction-calls-status.connected{background:#2f9e44}#twi-faction-calls-status.disconnected{background:#c92a2a}
    
    /* Universal modal dialogs - works on all devices */
    .twi-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;animation:twiModalFadeIn 0.2s ease-out}
    .twi-modal-container{background:#2b2b2b;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);max-width:500px;width:100%;max-height:90vh;overflow:auto;animation:twiModalSlideIn 0.3s ease-out}
    .twi-modal-header{background:#1a1a1a;color:#fff;padding:16px 20px;font-size:16px;font-weight:700;border-radius:12px 12px 0 0;border-bottom:1px solid #444}
    .twi-modal-body{padding:20px;color:#ddd}
    .twi-modal-message{margin:0 0 16px;font-size:14px;line-height:1.5;white-space:pre-wrap}
    .twi-modal-input{width:100%;padding:12px;font-size:16px;border:2px solid #555;border-radius:8px;background:#1a1a1a;color:#fff;box-sizing:border-box;font-family:monospace}
    .twi-modal-input:focus{outline:none;border-color:#4a9eff}
    .twi-modal-footer{display:flex;gap:10px;padding:16px 20px;border-top:1px solid #444;background:#222;border-radius:0 0 12px 12px}
    .twi-modal-btn{flex:1;padding:14px 20px;font-size:15px;font-weight:700;border:none;border-radius:8px;cursor:pointer;touch-action:manipulation;min-height:48px;transition:all 0.2s}
    .twi-modal-btn-cancel{background:#444;color:#ddd}
    .twi-modal-btn-cancel:active{background:#555}
    .twi-modal-btn-primary{background:#2f9e44;color:#fff}
    .twi-modal-btn-primary:active{background:#37b24d}
    @keyframes twiModalFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes twiModalSlideIn{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
    
    /* Mobile styles (phones) - up to 900px */
    @media(max-width:900px){
      .members-list li .member{
        display:flex!important;
        flex-direction:column!important;
        align-items:stretch!important;
        justify-content:center!important;
        min-height:60px!important;
        padding-top:4px!important;
        padding-bottom:4px!important;
        box-sizing:border-box!important
      }
      .members-list li .member>a{
        width:100%!important;
        min-width:0!important
      }
      .twi-call-control{
        position:static!important;
        display:flex!important;
        flex-wrap:nowrap!important;
        align-items:center!important;
        justify-content:flex-start!important;
        width:100%!important;
        min-width:0!important;
        max-width:100%!important;
        margin:4px 0 0!important;
        padding:0 2px!important;
        gap:4px!important;
        box-sizing:border-box!important
      }
      .twi-call-main{
        min-width:68px!important;
        width:auto!important;
        height:44px!important;
        min-height:44px!important;
        padding:4px 8px!important;
        gap:4px!important;
        font-size:11px!important;
        line-height:18px!important;
        border-radius:6px!important
      }
      .twi-state-dot{
        width:10px!important;
        height:10px!important;
        min-width:10px!important
      }
      .twi-call-meta{
        display:block!important;
        flex:1 1 auto!important;
        min-width:0!important;
        max-width:60px!important;
        font-size:9px!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important
      }
      .twi-call-actions{
        display:inline-flex!important;
        flex:0 0 auto!important;
        gap:4px!important
      }
      .twi-call-actions[hidden]{
        display:none!important
      }
      .twi-flag{
        width:44px!important;
        min-width:44px!important;
        height:44px!important;
        padding:0!important;
        border-radius:6px!important
      }
      .twi-flag-icon{
        width:18px!important;
        height:18px!important
      }
      #twi-faction-calls-status{
        right:10px!important;
        bottom:70px!important;
        padding:10px 14px!important;
        font-size:13px!important;
        min-width:48px!important;
        min-height:48px!important
      }
    }
    
    /* Tablet styles (iPad, etc) - 901px to 1400px */
    @media(min-width:901px) and (max-width:1400px){
      .members-list li .member{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        justify-content:center!important;
        min-height:50px!important;
        padding-top:3px!important;
        padding-bottom:3px!important;
        box-sizing:border-box!important
      }
      .members-list li .member>a{
        width:100%!important;
        min-width:0!important
      }
      .twi-call-control{
        gap:6px!important;
        padding-right:20px!important;
        min-width:110px!important;
        margin:3px 0 0!important;
        padding-left:0!important
      }
      .twi-call-main{
        min-width:72px!important;
        min-height:32px!important;
        padding:4px 8px!important;
        gap:5px!important;
        font-size:11px!important;
        border-radius:6px!important
      }
      .twi-state-dot{
        width:10px!important;
        height:10px!important;
        min-width:10px!important
      }
      .twi-call-meta{
        max-width:85px!important;
        font-size:10px!important
      }
      .twi-call-actions{
        gap:4px!important
      }
      .twi-flag{
        width:32px!important;
        min-width:32px!important;
        height:32px!important;
        border-radius:6px!important
      }
      .twi-flag-icon{
        width:17px!important;
        height:17px!important
      }
      #twi-faction-calls-status{
        padding:10px 16px!important;
        font-size:13px!important;
        min-width:48px!important;
        min-height:48px!important;
        border-radius:16px!important
      }
    }
    
    /* Desktop styles (large screens) - 1401px and up */
    @media(min-width:1401px){
      .members-list li .member{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        justify-content:center!important;
        min-height:50px!important;
        padding-top:3px!important;
        padding-bottom:3px!important;
        box-sizing:border-box!important
      }
      .members-list li .member>a{
        width:100%!important;
        min-width:0!important
      }
      .twi-call-control{
        gap:6px!important;
        padding-right:28px!important;
        min-width:120px!important;
        margin:3px 0 0!important;
        padding-left:0!important
      }
      .twi-call-main{
        min-width:76px!important;
        min-height:30px!important;
        padding:4px 8px!important;
        gap:5px!important;
        font-size:11px!important
      }
      .twi-state-dot{
        width:10px!important;
        height:10px!important;
        min-width:10px!important
      }
      .twi-call-meta{
        max-width:95px!important;
        font-size:10px!important
      }
      .twi-call-actions{
        gap:5px!important
      }
      .twi-flag{
        width:30px!important;
        min-width:30px!important;
        height:30px!important
      }
      .twi-flag-icon{
        width:16px!important;
        height:16px!important
      }
      #twi-faction-calls-status{
        padding:10px 16px!important;
        font-size:13px!important
      }
    }
  `);

  let renderTimer = null;
  let lastWarContainer = null;
  let warObserver = null;

  function scheduleRender(delay = 80) {
    if (!isWarPage()) return;
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderAll();
    }, delay);
  }

  function mutationNeedsRender(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.classList.contains("twi-call-control") ||
            node.classList.contains("twi-modal-overlay") ||
            node.id === "twi-faction-calls-status" ||
            node.closest?.(".twi-call-control, .twi-modal-overlay")) {
          continue;
        }
        if (node.matches?.("li.enemy, ul.members-list, .faction-war") ||
            node.querySelector?.("li.enemy, ul.members-list, .faction-war")) {
          return true;
        }
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.("li.enemy, ul.members-list, .faction-war") ||
            node.querySelector?.("li.enemy, ul.members-list, .faction-war")) {
          return true;
        }
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
      attachWarObserver();
      scheduleRender();
      return;
    }
    if (mutationNeedsRender(mutations)) scheduleRender();
  });
  pageObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  setInterval(() => {
    if (!isWarPage()) return;
    // Only update visible countdown text. Do not rescan or rewrite the full DOM.
    for (const row of targetRows()) {
      const call = state.calls.get(row.id);
      if (!call) continue;
      const main = row.li.querySelector(`.twi-call-control[data-twi-target-id="${CSS.escape(row.id)}"] .twi-call-main`);
      const label = main?.querySelector(".twi-call-label");
      if (label) label.textContent = format(remaining(call));
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

// Made with Bob
