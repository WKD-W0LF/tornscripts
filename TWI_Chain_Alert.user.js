// ==UserScript==
// @name         TWI Chain Alert
// @namespace    twilight-reborn
// @version      1.0.7
// @author       WKD-W0LF
// @description  Chain bonus countdown alerts for Twilight-Reborn [56966]. Shows an in-page banner when the chain is 2 or 1 hit away from a bonus number.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @connect      api.torn.com
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// ==/UserScript==

(function () {
  "use strict";

  const APP_NAME        = "TWI - Chain Calling";
  const API_BASE        = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const TORN_API_BASE   = "https://api.torn.com";
  const ALLOWED_FACTION_ID = 56966;
  const ADMIN_IDS       = new Set(["3647423","3917106","3658650","3855001","3926412","4152155","4157019"]);
  const BONUS_NUMBERS   = [10, 25, 50, 100, 250, 500, 1000];
  const POLL_MS         = 4000;
  const PREFIX          = "twi-chain-alert-";

  // ── State ──────────────────────────────────────────────────────────────────

  const state = {
    apiKey:     localStorage.getItem(`${PREFIX}api-key`) || "",
    enabled:    localStorage.getItem(`${PREFIX}enabled`) !== "false",
    polling:    false,
    chainCount: null,
    alertedFor: null,   // bonus number currently shown in the banner, or null
    lastError:  ""
  };

  // ── localStorage helpers ───────────────────────────────────────────────────

  function setApiKey(value) {
    state.apiKey = String(value || "").trim();
    state.apiKey
      ? localStorage.setItem(`${PREFIX}api-key`, state.apiKey)
      : localStorage.removeItem(`${PREFIX}api-key`);
  }

  function setEnabled(value) {
    state.enabled = value;
    localStorage.setItem(`${PREFIX}enabled`, value ? "true" : "false");
  }

  // ── Page detection ─────────────────────────────────────────────────────────

  function isChainPage() {
    if (!location.pathname.endsWith("/factions.php")) return false;
    // chain-box is present on both the main faction tab and the war tab —
    // show the alert wherever the chain widget is visible
    return Boolean(document.querySelector("div.chain-box"));
  }

  // ── Banner element management ──────────────────────────────────────────────

  function findChainContainer() {
    // Confirmed live selector from factions.php DOM inspection
    return document.querySelector("div.chain-box");
  }

  function ensureBannerEl() {
    if (!isChainPage()) {
      removeBannerEl();
      return;
    }
    if (document.getElementById("twi-alert-banner")) return;
    const container = findChainContainer();
    if (!container) return;
    const banner = document.createElement("div");
    banner.id = "twi-alert-banner";
    // Insert after the chain container
    container.parentNode.insertBefore(banner, container.nextSibling);
  }

  function removeBannerEl() {
    document.getElementById("twi-alert-banner")?.remove();
    state.alertedFor = null;
  }

  // ── Banner render ──────────────────────────────────────────────────────────

  function showBanner(bonusNumber, level) {
    ensureBannerEl();
    const banner = document.getElementById("twi-alert-banner");
    if (!banner) return;
    state.alertedFor = bonusNumber;
    banner.className = level === "urgent" ? "twi-alert-urgent" : "twi-alert-warn";
    banner.style.display = "";
    if (level === "urgent") {
      banner.textContent = `\uD83D\uDEA8 Internal hits required \u2014 bonus at ${bonusNumber} NEXT HIT!`;
    } else {
      banner.textContent = `\u26A0\uFE0F Internal hits required \u2014 bonus at ${bonusNumber} in 2 hits!`;
    }
  }

  function hideBanner() {
    const banner = document.getElementById("twi-alert-banner");
    if (banner) {
      banner.style.display = "none";
      banner.className = "";
      banner.textContent = "";
    }
    state.alertedFor = null;
  }

  // ── Alert logic ────────────────────────────────────────────────────────────

  function checkAlerts() {
    const count = state.chainCount;
    if (count === null || count === 0) { hideBanner(); return; }

    const nextBonus = BONUS_NUMBERS.find(n => n > count);
    if (!nextBonus) { hideBanner(); return; }   // past all bonus numbers

    const diff = nextBonus - count;
    if (diff === 1) {
      showBanner(nextBonus, "urgent");
    } else if (diff === 2) {
      showBanner(nextBonus, "warn");
    } else {
      hideBanner();
    }
  }

  // ── Torn API polling ───────────────────────────────────────────────────────

  let lastPollTime = 0;

  function pollDue() {
    return Date.now() - lastPollTime >= POLL_MS;
  }

  function fetchChainCount() {
    if (state.polling) return;
    if (!state.apiKey) return;
    state.polling = true;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      state.polling = false;
      state.lastError = "Request timed out";
      updateSettingsPanel();
    }, 12000);

    GM_xmlhttpRequest({
      method: "GET",
      url: `${TORN_API_BASE}/v2/faction/chain?key=${state.apiKey}`,
      headers: { "Content-Type": "application/json" },
      onload(response) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.polling = false;
        let data;
        try { data = JSON.parse(response.responseText || "{}"); }
        catch {
          state.lastError = `Invalid API response (${response.status})`;
          updateSettingsPanel();
          return;
        }
        if (response.status >= 200 && response.status < 300) {
          const current = data?.chain?.current ?? null;
          state.chainCount = current;
          state.lastError = "";
          checkAlerts();
          updateSettingsPanel();
        } else {
          const msg = data?.error?.error || data?.error || `HTTP ${response.status}`;
          state.lastError = String(msg);
          updateSettingsPanel();
        }
      },
      onerror() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.polling = false;
        state.lastError = "Unable to reach Torn API";
        updateSettingsPanel();
      }
    });
  }

  function throttledPoll() {
    if (!isChainPage()) return;
    if (!state.enabled) return;
    if (!state.apiKey) return;
    if (state.polling) return;
    if (document.visibilityState === "hidden") return;
    if (!pollDue()) return;
    lastPollTime = Date.now();
    fetchChainCount();
  }

  setInterval(throttledPoll, POLL_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") throttledPoll();
  });

  // ── Settings panel ─────────────────────────────────────────────────────────

  let settingsPanelInjected = false;

  function mountSettingsPanel(panel) {
    if (!isChainPage()) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "";
    if (!panel.isConnected) document.body.appendChild(panel);
  }

  function injectSettingsPanel() {
    if (settingsPanelInjected) {
      const panel = document.getElementById("twi-alert-settings");
      if (panel) mountSettingsPanel(panel);
      return;
    }
    if (!document.querySelector("div.chain-box")) return;

    // Use a plain <div> — NOT a <details> — so it is never affected by any
    // parent <details> toggle. Rendered as a fixed floating panel on the page.
    const panel = document.createElement("div");
    panel.id = "twi-alert-settings";

    // Collapsed state tracked manually via data attribute
    panel.dataset.open = "false";
    panel.innerHTML = `
      <div id="twi-alert-settings-header">
        <span id="twi-alert-settings-arrow">\u25BA</span>
        <strong>TWI Chain Alert Settings</strong>
      </div>
      <div id="twi-alert-settings-body" style="display:none">

        <div class="twi-settings-row">
          <label for="twi-alert-apikey"><strong>Torn API Key:</strong></label>
          <input
            type="text"
            id="twi-alert-apikey"
            class="twi-settings-input"
            maxlength="16"
            placeholder="Paste 16-char API key here..."
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <p class="twi-settings-hint">
            <strong>Info:</strong> Provide your 16-character Torn API key with
            <em>Faction</em> read access. It is only used to read the current chain count.
          </p>
        </div>

        <div class="twi-settings-row twi-settings-row-inline">
          <input type="checkbox" id="twi-alert-enabled" />
          <label for="twi-alert-enabled">Enable TWI Chain Alert</label>
        </div>

        <div class="twi-settings-status" id="twi-alert-status-line"></div>

        <div class="twi-settings-actions">
          <button type="button" id="twi-alert-save" class="torn-btn twi-btn-save">Save Settings</button>
          <button type="button" id="twi-alert-forget" class="torn-btn twi-btn-secondary">Forget API Key</button>
          <span id="twi-alert-saved-msg" style="display:none;color:#4CAF50;font-weight:bold;margin-left:10px;">\u2713 Saved!</span>
        </div>

      </div>`;

    // Toggle open/close on header click
    panel.querySelector("#twi-alert-settings-header").addEventListener("click", () => {
      const open = panel.dataset.open === "true";
      panel.dataset.open = open ? "false" : "true";
      panel.querySelector("#twi-alert-settings-body").style.display = open ? "none" : "";
      panel.querySelector("#twi-alert-settings-arrow").textContent = open ? "\u25BA" : "\u25BC";
    });

    mountSettingsPanel(panel);
    settingsPanelInjected = true;
    updateSettingsPanel();

    // Save button
    panel.querySelector("#twi-alert-save").addEventListener("click", () => {
      const keyInput   = panel.querySelector("#twi-alert-apikey");
      const enabledCb  = panel.querySelector("#twi-alert-enabled");
      const savedMsg   = panel.querySelector("#twi-alert-saved-msg");

      const newKey     = keyInput.value.trim();
      const newEnabled = enabledCb.checked;

      if (newKey && newKey !== state.apiKey) setApiKey(newKey);
      setEnabled(newEnabled);

      if (state.enabled && state.apiKey) {
        lastPollTime = 0;   // force immediate poll on next tick
        throttledPoll();
      } else if (!state.enabled) {
        hideBanner();
      }

      updateSettingsPanel();
      savedMsg.style.display = "inline";
      setTimeout(() => { savedMsg.style.display = "none"; }, 2500);
    });

    // Forget key button
    panel.querySelector("#twi-alert-forget").addEventListener("click", () => {
      setApiKey("");
      setEnabled(false);
      state.chainCount = null;
      hideBanner();
      updateSettingsPanel();
    });
  }

  function updateSettingsPanel() {
    const panel = document.getElementById("twi-alert-settings");
    if (!panel) return;

    const keyInput   = panel.querySelector("#twi-alert-apikey");
    const enabledCb  = panel.querySelector("#twi-alert-enabled");
    const statusLine = panel.querySelector("#twi-alert-status-line");

    if (keyInput && !keyInput.matches(":focus")) {
      keyInput.value = "";
      keyInput.placeholder = state.apiKey
        ? `API key saved (${state.apiKey.slice(0, 4)}${"*".repeat(12)})`
        : "Paste 16-char API key here...";
    }
    if (enabledCb) enabledCb.checked = state.enabled;
    if (statusLine) {
      if (state.chainCount !== null && !state.lastError) {
        statusLine.textContent = state.chainCount === 0
          ? "No active chain."
          : `Chain: ${state.chainCount}`;
        statusLine.style.color = "#4CAF50";
      } else if (state.lastError) {
        statusLine.textContent = `Error: ${state.lastError}`;
        statusLine.style.color = "#e74c3c";
      } else {
        statusLine.textContent = state.apiKey ? "Waiting for first poll..." : "Enter an API key to get started.";
        statusLine.style.color = "#999";
      }
    }
  }

  // ── ensureUI — called on every DOM mutation and hash change ────────────────

  function ensureUI() {
    injectSettingsPanel();
    ensureBannerEl();
    if (!isChainPage()) hideBanner();
  }

  const pageObserver = new MutationObserver((mutations) => {
    // Ignore mutations caused by our own elements
    for (const m of mutations) {
      for (const node of [...m.addedNodes, ...m.removedNodes]) {
        if (!(node instanceof Element)) continue;
        if (node.id === "twi-alert-banner" ||
            node.id === "twi-alert-settings") return;
      }
    }
    ensureUI();
  });
  pageObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

  window.addEventListener("hashchange", () => {
    ensureUI();
    if (isChainPage() && state.enabled && state.apiKey) {
      lastPollTime = 0;
      throttledPoll();
    } else {
      hideBanner();
    }
  });

  // ── CSS ────────────────────────────────────────────────────────────────────

  GM_addStyle(`
    /* ── Banner ── */
    #twi-alert-banner {
      display: none;
      margin: 8px 0;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      min-width: 260px;
      box-sizing: border-box;
    }
    #twi-alert-banner.twi-alert-warn {
      display: block;
      background: #f6c344;
      color: #3d2f00;
      border-left: 4px solid #e6a800;
    }
    #twi-alert-banner.twi-alert-urgent {
      display: block;
      background: #c92a2a;
      color: #fff;
      border-left: 4px solid #ff4444;
      animation: twi-pulse 1s ease-in-out infinite;
    }
    @keyframes twi-pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.75; }
    }

    /* ── Settings floating panel ── */
    #twi-alert-settings {
      position: fixed;
      bottom: 100px;
      left: 12px;
      z-index: 10000;
      width: 320px;
      background: #1e1e1e;
      border: 1px solid #444;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      font-size: 13px;
      color: #ddd;
      overflow: hidden;
    }
    #twi-alert-settings-header {
      padding: 10px 14px;
      background: #2a2a2a;
      cursor: pointer;
      user-select: none;
      font-size: 13px;
      font-weight: 700;
      border-bottom: 1px solid #444;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #twi-alert-settings-header:hover { background: #333; }
    #twi-alert-settings-arrow { font-size: 10px; color: #888; }
    #twi-alert-settings-body  { padding: 14px 16px 16px; }
    .twi-settings-body    { padding: 14px 16px 16px; }
    .twi-settings-row     { margin-bottom: 14px; }
    .twi-settings-row-inline {
      display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
    }
    .twi-settings-row-inline input[type=checkbox] {
      width: 16px; height: 16px; cursor: pointer; flex-shrink: 0;
    }
    .twi-settings-row-inline label { cursor: pointer; font-size: 13px; }
    .twi-settings-input {
      display: block; width: 100%; max-width: 340px;
      padding: 8px 10px; margin-top: 6px;
      border: 1px solid #555; border-radius: 6px;
      background: #1a1a1a; color: #fff;
      font-size: 14px; font-family: monospace;
      box-sizing: border-box;
    }
    .twi-settings-input:focus { outline: none; border-color: #4a9eff; }
    .twi-settings-hint {
      margin: 6px 0 0; font-size: 12px; color: #888; line-height: 1.5;
    }
    .twi-settings-status { margin: 8px 0 12px; font-size: 12px; min-height: 16px; }
    .twi-settings-actions {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    }
    .twi-btn-save      { background: #2f9e44 !important; color: #fff !important; }
    .twi-btn-save:hover { background: #37b24d !important; }
    .twi-btn-secondary      { background: #555 !important; color: #ddd !important; }
    .twi-btn-secondary:hover { background: #666 !important; }
  `);

  // ── Boot ───────────────────────────────────────────────────────────────────

  ensureUI();
  if (isChainPage() && state.enabled && state.apiKey) {
    throttledPoll();
  }

})();
