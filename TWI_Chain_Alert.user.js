// ==UserScript==
// @name         TWI Chain Alert
// @namespace    twilight-reborn
// @version      1.1.2
// @author       WKD-W0LF
// @description  Chain bonus countdown alerts for Twilight-Reborn [56966]. Alerts at 5 hits from bonus, personalised banner for assigned hitters.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @match        https://torn.com/factions.php*
// @connect      api.torn.com
// @connect      torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// @updateURL    https://raw.githubusercontent.com/WKD-W0LF/tornscripts/main/TWI_Chain_Alert.user.js
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE        = "https://torn-calls.apps.gpu4.fusion.isys.hpc.dc.uq.edu.au/api/v1";
  const TORN_API_BASE   = "https://api.torn.com";
  const ALLOWED_FACTION_ID = 56966;
  const ADMIN_IDS       = new Set(["3647423","3917106","3658650","3855001","3926412","4152155","4157019"]);
  const BONUS_NUMBERS   = [10, 25, 50, 100, 250, 500, 1000];
  const POLL_MS         = 4000;
  const ASSIGN_POLL_MS  = 30000;   // re-fetch assignments every 30s
  const PREFIX          = "twi-chain-alert-";

  // ── State ──────────────────────────────────────────────────────────────────

  const state = {
    apiKey:       localStorage.getItem(`${PREFIX}api-key`) || "",
    sessionToken: localStorage.getItem(`${PREFIX}session`) || "",
    enabled:      localStorage.getItem(`${PREFIX}enabled`) !== "false",
    polling:      false,
    chainCount:   null,
    alertedFor:   null,    // bonus number currently shown in the banner
    lastError:    "",
    playerId:     localStorage.getItem(`${PREFIX}player-id`) || "",
    playerName:   localStorage.getItem(`${PREFIX}player-name`) || "",
    // assignments: Map<bonusNumber, {playerId, playerName, assignedBy}>
    assignments:  new Map(),
    lastAssignFetch: 0
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

  function setSession(token, playerId, playerName) {
    state.sessionToken = token || "";
    state.playerId = String(playerId || "");
    state.playerName = String(playerName || "");
    token
      ? localStorage.setItem(`${PREFIX}session`, token)
      : localStorage.removeItem(`${PREFIX}session`);
    state.playerId
      ? localStorage.setItem(`${PREFIX}player-id`, state.playerId)
      : localStorage.removeItem(`${PREFIX}player-id`);
    state.playerName
      ? localStorage.setItem(`${PREFIX}player-name`, state.playerName)
      : localStorage.removeItem(`${PREFIX}player-name`);
  }

  function isAdmin() {
    return ADMIN_IDS.has(state.playerId);
  }

  // ── Page detection ─────────────────────────────────────────────────────────

  function isChainPage() {
    if (!location.pathname.endsWith("/factions.php")) return false;
    return Boolean(document.querySelector("div.chain-box"));
  }

  // ── Session / auth ─────────────────────────────────────────────────────────

  function authenticate(callback) {
    if (!state.apiKey) return;
    GM_xmlhttpRequest({
      method: "POST",
      url: `${API_BASE}/auth`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ apiKey: state.apiKey }),
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success && data.sessionToken) {
          setSession(data.sessionToken, data.player?.id, data.player?.name);
          updateSettingsPanel();
          renderAssignmentTable();   // re-render now that playerId is known
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
          // Session expired — re-auth silently
          setSession("", "", "");
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
    if (!state.sessionToken) return;
    GM_xmlhttpRequest({
      method: "PUT",
      url: `${API_BASE}/bonus-assignments/${bonusNumber}`,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${state.sessionToken}`
      },
      data: JSON.stringify({ playerId: String(playerId), playerName: String(playerName) }),
      onload(response) {
        let data;
        try { data = JSON.parse(response.responseText || "{}"); } catch { return; }
        if (data.success) {
          state.assignments.set(bonusNumber, { playerId: String(playerId), playerName, assignedBy: state.playerName });
          state.lastAssignFetch = 0;   // force refresh on next poll
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

  // ── Banner element management ──────────────────────────────────────────────

  function findChainContainer() {
    return document.querySelector("div.chain-box");
  }

  function ensureBannerEl() {
    if (!isChainPage()) { removeBannerEl(); return; }
    if (document.getElementById("twi-alert-banner")) return;
    const container = findChainContainer();
    if (!container) return;
    const banner = document.createElement("div");
    banner.id = "twi-alert-banner";
    container.parentNode.insertBefore(banner, container.nextSibling);
  }

  function removeBannerEl() {
    document.getElementById("twi-alert-banner")?.remove();
    state.alertedFor = null;
  }

  // ── Banner render ──────────────────────────────────────────────────────────

  function showBanner(bonusNumber, level, assignedName) {
    ensureBannerEl();
    const banner = document.getElementById("twi-alert-banner");
    if (!banner) return;
    state.alertedFor = bonusNumber;
    banner.className = level === "urgent" ? "twi-alert-urgent" : "twi-alert-warn";
    banner.style.display = "";
    const diff = bonusNumber - state.chainCount;

    let hitterLine = "";
    if (assignedName) {
      hitterLine = ` — ${assignedName}'s hit`;
    }

    if (level === "urgent") {
      banner.textContent = `\uD83D\uDEA8 Slow Hits Please \u2014 Bonus Level in 1 hit! (${bonusNumber})${hitterLine}`;
    } else {
      banner.textContent = `\u26A0\uFE0F Slow Hits Please \u2014 Bonus Level in ${diff} hits! (${bonusNumber})${hitterLine}`;
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
      banner.textContent = `\uD83C\uDFAF YOUR HIT \u2014 Bonus ${bonusNumber} is NEXT! Make it count!`;
    } else {
      banner.textContent = `\uD83C\uDFAF YOUR HIT in ${diff} \u2014 Get ready for bonus ${bonusNumber}!`;
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
    if (!nextBonus) { hideBanner(); return; }

    const diff = nextBonus - count;
    if (diff > 5) { hideBanner(); return; }

    // Check if the current user is assigned to this bonus number
    const assignment = state.assignments.get(nextBonus);
    const isMyHit = assignment && assignment.playerId === state.playerId && state.playerId;

    if (isMyHit) {
      showPersonalBanner(nextBonus, diff);
    } else {
      const assignedName = assignment ? assignment.playerName : null;
      const level = diff === 1 ? "urgent" : "warn";
      showBanner(nextBonus, level, assignedName);
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
          fetchAssignments();
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

  // ── Assignment table (admin only) ──────────────────────────────────────────

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
            <button class="torn-btn twi-btn-assign" data-bn="${bn}" data-name="${a ? escHtml(a.playerName) : ''}" data-pid="${a ? escHtml(a.playerId) : ''}">
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
        btn.addEventListener("click", () => openAssignModal(Number(btn.dataset.bn)));
      });
      container.querySelectorAll(".twi-btn-remove").forEach(btn => {
        btn.addEventListener("click", () => {
          deleteAssignment(Number(btn.dataset.bn), err => {
            if (err) alert(`Error: ${err}`);
          });
        });
      });
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // ── Faction member cache ───────────────────────────────────────────────────

  // Sorted array of {id, name} — populated once per page load on first modal open.
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

  // ── Assign modal ───────────────────────────────────────────────────────────

  function openAssignModal(bonusNumber) {
    document.getElementById("twi-assign-modal")?.remove();

    // Show a loading modal while we fetch members
    const modal = document.createElement("div");
    modal.id = "twi-assign-modal";
    modal.innerHTML = `
      <div id="twi-assign-modal-box">
        <h3>Assign Bonus ${bonusNumber}</h3>
        <div id="twi-assign-modal-inner">
          <p class="twi-assign-loading">Loading faction members…</p>
        </div>
        <div id="twi-assign-modal-error" style="color:#e74c3c;font-size:12px;min-height:16px;margin-bottom:8px;"></div>
        <div class="twi-settings-actions">
          <button type="button" id="twi-assign-confirm" class="torn-btn twi-btn-save" disabled>Save</button>
          <button type="button" id="twi-assign-cancel" class="torn-btn twi-btn-secondary">Cancel</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.querySelector("#twi-assign-cancel").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

    fetchFactionMembers(members => {
      const inner  = modal.querySelector("#twi-assign-modal-inner");
      const errEl  = modal.querySelector("#twi-assign-modal-error");
      const saveBtn = modal.querySelector("#twi-assign-confirm");

      if (!members.length) {
        inner.innerHTML = `<p style="color:#e74c3c;font-size:12px;">Could not load faction members. Check your API key has Faction access.</p>`;
        return;
      }

      const existing = state.assignments.get(bonusNumber);

      // Build searchable dropdown
      inner.innerHTML = `
        <div class="twi-settings-row">
          <label><strong>Select Member:</strong></label>
          <input
            type="text"
            id="twi-assign-search"
            class="twi-settings-input"
            placeholder="Type to filter…"
            autocomplete="off"
            spellcheck="false"
          />
          <div id="twi-assign-dropdown" class="twi-assign-dropdown"></div>
          <input type="hidden" id="twi-assign-pid" />
          <input type="hidden" id="twi-assign-pname" />
          <div id="twi-assign-selected" class="twi-assign-selected-name"></div>
        </div>`;

      const searchEl   = modal.querySelector("#twi-assign-search");
      const dropdownEl = modal.querySelector("#twi-assign-dropdown");
      const pidEl      = modal.querySelector("#twi-assign-pid");
      const pnameEl    = modal.querySelector("#twi-assign-pname");
      const selectedEl = modal.querySelector("#twi-assign-selected");

      // Pre-select existing assignment
      if (existing) {
        pidEl.value    = existing.playerId;
        pnameEl.value  = existing.playerName;
        selectedEl.textContent = `✓ ${existing.playerName}`;
        saveBtn.disabled = false;
      }

      function renderDropdown(filter) {
        const q = filter.toLowerCase();
        const hits = members.filter(m => m.name.toLowerCase().includes(q) || m.id.includes(q));
        if (!hits.length || !filter) { dropdownEl.style.display = "none"; return; }
        dropdownEl.innerHTML = hits.slice(0, 20).map(m =>
          `<div class="twi-assign-option" data-id="${m.id}" data-name="${escHtml(m.name)}">${escHtml(m.name)} <span class="twi-assign-optid">#${m.id}</span></div>`
        ).join("");
        dropdownEl.style.display = "block";
        dropdownEl.querySelectorAll(".twi-assign-option").forEach(opt => {
          opt.addEventListener("click", () => {
            pidEl.value    = opt.dataset.id;
            pnameEl.value  = opt.dataset.name;
            searchEl.value = "";
            selectedEl.textContent = `✓ ${opt.dataset.name}`;
            dropdownEl.style.display = "none";
            saveBtn.disabled = false;
            errEl.textContent = "";
          });
        });
      }

      searchEl.addEventListener("input", () => renderDropdown(searchEl.value));
      searchEl.addEventListener("focus", () => { if (searchEl.value) renderDropdown(searchEl.value); });
      document.addEventListener("click", function closeDD(e) {
        if (!modal.contains(e.target)) { dropdownEl.style.display = "none"; document.removeEventListener("click", closeDD); }
      });

      saveBtn.disabled = false;
      saveBtn.addEventListener("click", () => {
        const pid   = pidEl.value.trim();
        const pname = pnameEl.value.trim();
        if (!pid || !pname) { errEl.textContent = "Please select a member."; return; }
        errEl.textContent = "";
        saveBtn.disabled = true;
        putAssignment(bonusNumber, pid, pname, err => {
          if (err) { errEl.textContent = `Error: ${err}`; saveBtn.disabled = false; }
          else { modal.remove(); }
        });
      });
    });
  }

  // ── Settings panel ─────────────────────────────────────────────────────────

  let settingsPanelInjected = false;

  // Find the Targets row in the React-rendered sidebar.
  // DOM structure: span.linkName___YZMai > a.link___tg6eQ > div.areaRow___Eheay
  function findTargetsRow() {
    const span = Array.from(document.querySelectorAll(".linkName___YZMai"))
      .find(el => el.textContent.trim() === "Targets");
    return span ? span.closest(".areaRow___Eheay") : null;
  }

  function mountSettingsPanel(panel) {
    const anchor = findTargetsRow();
    if (!anchor) { panel.remove(); return; }
    if (panel.previousSibling !== anchor) anchor.after(panel);
  }

  function injectSettingsPanel() {
    if (settingsPanelInjected) {
      const panel = document.getElementById("twi-alert-settings");
      if (panel) mountSettingsPanel(panel);
      return;
    }
    if (!findTargetsRow()) return;

    const panel = document.createElement("div");
    panel.id = "twi-alert-settings";
    panel.className = "twi-alert-settings-details";
    panel.dataset.open = "false";

    panel.innerHTML = `
      <div id="twi-alert-settings-header">
        <span id="twi-alert-settings-arrow">&#9658;</span>
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
            <em>Faction</em> read access.
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
          <span id="twi-alert-saved-msg" style="display:none;color:#4CAF50;font-weight:bold;margin-left:10px;">&#10003; Saved!</span>
        </div>

        <div id="twi-assign-section">
          <div class="twi-assign-heading">Bonus Hit Assignments</div>
          <div id="twi-assign-table-wrap"></div>
        </div>

      </div>`;

    // Toggle open/close
    panel.querySelector("#twi-alert-settings-header").addEventListener("click", () => {
      const open = panel.dataset.open === "true";
      panel.dataset.open = open ? "false" : "true";
      panel.querySelector("#twi-alert-settings-body").style.display = open ? "none" : "";
      panel.querySelector("#twi-alert-settings-arrow").textContent = open ? "\u25BA" : "\u25BC";
    });

    mountSettingsPanel(panel);
    settingsPanelInjected = true;
    updateSettingsPanel();
    renderAssignmentTable();

    // Save button
    panel.querySelector("#twi-alert-save").addEventListener("click", () => {
      const keyInput   = panel.querySelector("#twi-alert-apikey");
      const enabledCb  = panel.querySelector("#twi-alert-enabled");
      const savedMsg   = panel.querySelector("#twi-alert-saved-msg");

      const newKey     = keyInput.value.trim();
      const newEnabled = enabledCb.checked;

      if (newKey && newKey !== state.apiKey) {
        setApiKey(newKey);
        // Re-authenticate with new key
        authenticate(() => {
          state.lastAssignFetch = 0;
          fetchAssignments();
        });
      }
      setEnabled(newEnabled);

      if (state.enabled && state.apiKey) {
        lastPollTime = 0;
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
      setSession("", "", "");
      setEnabled(false);
      state.chainCount = null;
      state.assignments.clear();
      hideBanner();
      renderAssignmentTable();
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
      let lines = [];
      if (state.playerName) lines.push(`Signed in as: ${state.playerName}${isAdmin() ? " (admin)" : ""}`);
      if (state.chainCount !== null && !state.lastError) {
        lines.push(state.chainCount === 0 ? "No active chain." : `Chain: ${state.chainCount}`);
        statusLine.style.color = "#4CAF50";
      } else if (state.lastError) {
        lines.push(`Error: ${state.lastError}`);
        statusLine.style.color = "#e74c3c";
      } else {
        lines.push(state.apiKey ? "Waiting for first poll..." : "Enter an API key to get started.");
        statusLine.style.color = "#999";
      }
      statusLine.textContent = lines.join("  |  ");
    }
  }

  // ── ensureUI ───────────────────────────────────────────────────────────────

  function ensureUI() {
    injectSettingsPanel();
    ensureBannerEl();
    if (!isChainPage()) hideBanner();
  }

  function startObserver() {
    const root = document.querySelector(".sidebar___c4dEc") || document.body || document.documentElement;
    const pageObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of [...m.addedNodes, ...m.removedNodes]) {
          if (!(node instanceof Element)) continue;
          if (node.id === "twi-alert-banner" || node.id === "twi-alert-settings") return;
        }
      }
      ensureUI();
    });
    pageObserver.observe(root, { childList: true, subtree: true });
  }
  startObserver();

  window.addEventListener("hashchange", () => {
    settingsPanelInjected = false;
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
    /* Personal hit banners */
    #twi-alert-banner.twi-alert-mine {
      display: block;
      background: #1a5fa8;
      color: #fff;
      border-left: 4px solid #4a9eff;
    }
    #twi-alert-banner.twi-alert-mine-urgent {
      display: block;
      background: #7c35ab;
      color: #fff;
      border-left: 4px solid #c084fc;
      animation: twi-pulse 0.8s ease-in-out infinite;
    }
    @keyframes twi-pulse {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.75; }
    }

    /* ── Settings sidebar panel ── */
    .twi-alert-settings-details { margin: 4px 0 0; }
    #twi-alert-settings-header {
      cursor: pointer; user-select: none;
      font-size: 13px; font-weight: 700;
      display: flex; align-items: center; gap: 6px;
      padding: 8px 10px;
      background: #2a2a2a;
      border-top: 1px solid #3a3a3a;
    }
    #twi-alert-settings-header:hover { background: #333; }
    #twi-alert-settings-arrow { font-size: 10px; color: #888; }
    #twi-alert-settings-body  { padding: 10px 12px 14px; background: #1e1e1e; border-top: 1px solid #3a3a3a; }
    .twi-settings-row     { margin-bottom: 14px; }
    .twi-settings-row-inline { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .twi-settings-row-inline input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; flex-shrink: 0; }
    .twi-settings-row-inline label { cursor: pointer; font-size: 13px; }
    .twi-settings-input {
      display: block; width: 100%; max-width: 340px;
      padding: 8px 10px; margin-top: 6px;
      border: 1px solid #555; border-radius: 6px;
      background: #1a1a1a; color: #fff;
      font-size: 14px; font-family: monospace; box-sizing: border-box;
    }
    .twi-settings-input:focus { outline: none; border-color: #4a9eff; }
    .twi-settings-hint { margin: 6px 0 0; font-size: 12px; color: #888; line-height: 1.5; }
    .twi-settings-status { margin: 8px 0 12px; font-size: 12px; min-height: 16px; }
    .twi-settings-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .twi-btn-save      { background: #2f9e44 !important; color: #fff !important; }
    .twi-btn-save:hover { background: #37b24d !important; }
    .twi-btn-secondary      { background: #555 !important; color: #ddd !important; }
    .twi-btn-secondary:hover { background: #666 !important; }

    /* ── Assignment table ── */
    #twi-assign-section { margin-top: 12px; border-top: 1px solid #333; padding-top: 10px; }
    .twi-assign-heading { font-size: 12px; font-weight: 700; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .twi-assign-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .twi-assign-table th { color: #888; font-weight: 600; padding: 4px 6px; text-align: left; border-bottom: 1px solid #333; }
    .twi-assign-table td { padding: 5px 6px; border-bottom: 1px solid #2a2a2a; color: #ddd; }
    .twi-assign-bn { font-weight: 700; color: #f6c344; width: 48px; }
    .twi-assign-empty { color: #555; font-style: italic; }
    .twi-assign-actions { width: 90px; text-align: right; }
    .twi-btn-assign { font-size: 11px !important; padding: 2px 7px !important; background: #1a5fa8 !important; color: #fff !important; }
    .twi-btn-assign:hover { background: #2372c9 !important; }
    .twi-btn-remove { font-size: 11px !important; padding: 2px 6px !important; background: #7a1e1e !important; color: #fff !important; margin-left: 4px !important; }
    .twi-btn-remove:hover { background: #a02424 !important; }

    /* ── Assign modal ── */
    #twi-assign-modal {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,0.65);
      display: flex; align-items: center; justify-content: center;
    }
    #twi-assign-modal-box {
      background: #1e1e1e; border: 1px solid #444; border-radius: 8px;
      padding: 20px 24px; width: 320px; color: #ddd;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    }
    #twi-assign-modal-box h3 { margin: 0 0 16px; font-size: 15px; color: #f6c344; }

    /* searchable dropdown */
    .twi-assign-dropdown {
      display: none;
      position: absolute;
      z-index: 100001;
      background: #2a2a2a;
      border: 1px solid #555;
      border-radius: 0 0 6px 6px;
      max-height: 200px;
      overflow-y: auto;
      width: 100%;
      box-sizing: border-box;
    }
    #twi-assign-modal .twi-settings-row { position: relative; }
    .twi-assign-option {
      padding: 7px 10px;
      cursor: pointer;
      font-size: 13px;
      color: #ddd;
      border-bottom: 1px solid #333;
    }
    .twi-assign-option:last-child { border-bottom: none; }
    .twi-assign-option:hover { background: #3a3a3a; }
    .twi-assign-optid { color: #666; font-size: 11px; margin-left: 6px; }
    .twi-assign-selected-name {
      margin-top: 6px; font-size: 12px; color: #4CAF50; font-weight: 600; min-height: 16px;
    }
    .twi-assign-loading { color: #888; font-size: 12px; font-style: italic; margin: 8px 0; }
  `);

  // ── Boot ───────────────────────────────────────────────────────────────────

  // Authenticate on load if we have an API key but no session
  if (state.apiKey && !state.sessionToken) {
    authenticate(() => {
      state.lastAssignFetch = 0;
      fetchAssignments();
    });
  } else if (state.apiKey && state.sessionToken) {
    // Already have a session — fetch assignments immediately
    state.lastAssignFetch = 0;
    fetchAssignments();
  }

  ensureUI();
  if (isChainPage() && state.enabled && state.apiKey) {
    throttledPoll();
  }

})();
