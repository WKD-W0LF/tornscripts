// ==UserScript==
// @name         Torn War Stuff Enhanced
// @namespace    namespace
// @version      2.0
// @author       xentac
// @description  Show travel status and hospital time and sort by hospital time on war page.
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @connect      twse.dev
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/529238/Torn%20War%20Stuff%20Enhanced.user.js
// @updateURL https://update.greasyfork.org/scripts/529238/Torn%20War%20Stuff%20Enhanced.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const n=new Set;const importCSS = async e=>{n.has(e)||(n.add(e),(d=>{const t=document.createElement("style");t.textContent=d,(document.head||document.documentElement).appendChild(t);})(e));};

  var LogLevel = ((LogLevel2) => {
    LogLevel2[LogLevel2["DEBUG"] = 0] = "DEBUG";
    LogLevel2[LogLevel2["INFO"] = 1] = "INFO";
    LogLevel2[LogLevel2["WARN"] = 2] = "WARN";
    LogLevel2[LogLevel2["ERROR"] = 3] = "ERROR";
    LogLevel2[LogLevel2["NONE"] = 4] = "NONE";
    return LogLevel2;
  })(LogLevel || {});
  class Logger {
constructor(prefix = "", defaultLevel = 1, state = {}) {
      this.isPDA = false;
      this.colors = {
        debug: "#7f8c8d",
        info: "#3498db",
        warn: "#f39c12",
        error: "#e74c3c"
      };
      this.prefix = prefix;
      this.defaultLevel = defaultLevel;
      this.state = state;
      this.detectPDA();
    }
detectPDA() {
      if (typeof window !== "undefined") {
        if (window.flutter_inappwebview) {
          this.isPDA = true;
        }
        window.addEventListener("flutterInAppWebViewPlatformReady", () => {
          window.flutter_inappwebview.callHandler("isTornPDA").then((response) => {
            if (response?.isTornPDA) {
              this.isPDA = true;
            }
          }).catch(() => {
          });
        });
      }
    }
setLevel(level) {
      this.state.explicitLevel = level;
    }
getLevel() {
      return this.state.explicitLevel !== void 0 ? this.state.explicitLevel : this.defaultLevel;
    }
debug(...args) {
      if (this.getLevel() <= 0) {
        if (this.isPDA) {
          console.log(`${this.formatPrefix("DEBUG")}`, ...this.formatArgs(args));
        } else {
          console.log(
            `%c${this.formatPrefix("DEBUG")}`,
            `color: ${this.colors.debug}; font-weight: bold`,
            ...args
          );
        }
      }
    }
info(...args) {
      if (this.getLevel() <= 1) {
        if (this.isPDA) {
          console.info(`${this.formatPrefix("INFO")}`, ...this.formatArgs(args));
        } else {
          console.info(
            `%c${this.formatPrefix("INFO")}`,
            `color: ${this.colors.info}; font-weight: bold`,
            ...args
          );
        }
      }
    }
warn(...args) {
      if (this.getLevel() <= 2) {
        if (this.isPDA) {
          console.warn(`${this.formatPrefix("WARN")}`, ...this.formatArgs(args));
        } else {
          console.warn(
            `%c${this.formatPrefix("WARN")}`,
            `color: ${this.colors.warn}; font-weight: bold`,
            ...args
          );
        }
      }
    }
error(...args) {
      if (this.getLevel() <= 3) {
        if (this.isPDA) {
          console.error(
            `${this.formatPrefix("ERROR")}`,
            ...this.formatArgs(args)
          );
        } else {
          console.error(
            `%c${this.formatPrefix("ERROR")}`,
            `color: ${this.colors.error}; font-weight: bold`,
            ...args
          );
        }
      }
    }
group(label, collapsed = false) {
      if (this.getLevel() < 4) {
        if (collapsed) {
          console.groupCollapsed(this.formatPrefix(""), label);
        } else {
          console.group(this.formatPrefix(""), label);
        }
      }
    }
groupEnd() {
      if (this.getLevel() < 4) {
        console.groupEnd();
      }
    }
child(subPrefix) {
      const childPrefix = this.prefix ? `${this.prefix}:${subPrefix}` : subPrefix;
      return new Logger(childPrefix, this.defaultLevel, this.state);
    }
formatPrefix(level) {
      const prefix = this.prefix ? `[${this.prefix}]` : "";
      return level ? `${prefix} - [${level}]: ` : `${prefix}: `;
    }
formatArgs(args) {
      return args.map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return arg;
      });
    }
  }
  const logger = new Logger(
    "TWSE",
    1
);
  const log$8 = logger.child("storage");
  class Storage {
constructor(prefix) {
      this.prefix = prefix;
    }
set(key, value, expireConfig) {
      try {
        const item = {
          value,
          expiration: expireConfig ? Date.now() + expireConfig.amount * (expireConfig.unit || 6e4) : null
        };
        localStorage.setItem(this.prefix + key, JSON.stringify(item));
      } catch (error) {
        log$8.error(`Error storing item '${key}':`, error);
      }
    }
get(key) {
      try {
        const itemStr = localStorage.getItem(this.prefix + key);
        if (!itemStr) {
          return null;
        }
        let item = null;
        try {
          item = JSON.parse(itemStr);
        } catch {
          item = null;
        }
        if (!item) {
          log$8.warn(`Key '${key}' has invalid JSON in it.`);
          this.remove(key);
          return null;
        }
        if (item.expiration && Date.now() > item.expiration) {
          this.remove(key);
          log$8.debug(`Key '${key}' has expired.`);
          return null;
        }
        return item.value;
      } catch (error) {
        log$8.error(`Error retrieving item '${key}':`, error);
        return null;
      }
    }
remove(key) {
      try {
        localStorage.removeItem(this.prefix + key);
      } catch (error) {
        log$8.error(`Error removing item '${key}':`, error);
      }
    }
has(key) {
      return this.get(key) !== null;
    }
clearAll() {
      try {
        Object.keys(localStorage).filter((key) => key.startsWith(this.prefix)).forEach((key) => {
          localStorage.removeItem(key);
        });
      } catch (error) {
        log$8.error("Error clearing storage:", error);
      }
    }
  }
  class Config {
    constructor(prefix = "twse-config-") {
      this.legacyPrefix = "xentac-torn_war_stuff_enhanced-";
      this.storage = new Storage(prefix);
      logger.setLevel(this.debug_logs ? LogLevel.DEBUG : LogLevel.INFO);
    }
get apiKey() {
      const key = this.storage.get(
        "apikey"
);
      if (key) {
        return key;
      }
      const legacyKey = localStorage.getItem(`${this.legacyPrefix}apikey`);
      if (legacyKey) {
        return legacyKey;
      }
      return "";
    }
set apiKey(val) {
      this.storage.set("apikey", val);
      localStorage.setItem(`${this.legacyPrefix}apikey`, val);
    }
get debug_logs() {
      return this.storage.get(
        "debug_logs"
) ?? false;
    }
    set debug_logs(val) {
      this.storage.set("debug_logs", val);
      logger.setLevel(val ? LogLevel.DEBUG : LogLevel.INFO);
    }
get war_sorting() {
      return this.storage.get(
        "war_sorting"
) ?? true;
    }
    set war_sorting(val) {
      this.storage.set("war_sorting", val);
    }
get bubble_position() {
      return this.storage.get(
        "bubble_position"
) ?? null;
    }
    set bubble_position(val) {
      if (val === null) {
        this.storage.remove(
          "bubble_position"
);
      } else {
        this.storage.set("bubble_position", val);
      }
    }
get bubble_minimized() {
      return this.storage.get(
        "bubble_minimized"
) ?? false;
    }
    set bubble_minimized(val) {
      this.storage.set("bubble_minimized", val);
    }
get bubble_enabled() {
      return this.storage.get(
        "bubble_enabled"
) ?? true;
    }
    set bubble_enabled(val) {
      this.storage.set("bubble_enabled", val);
    }
get copy_button_enabled() {
      return this.storage.get(
        "copy_button_enabled"
) ?? true;
    }
    set copy_button_enabled(val) {
      this.storage.set("copy_button_enabled", val);
    }
reset() {
      this.storage.remove(
        "debug_logs"
);
      this.storage.remove(
        "war_sorting"
);
      this.storage.remove(
        "bubble_position"
);
      this.storage.remove(
        "bubble_minimized"
);
      this.storage.remove(
        "bubble_enabled"
);
      this.storage.remove(
        "copy_button_enabled"
);
    }
  }
  const twseconfig = new Config();
  var StartTime = ((StartTime2) => {
    StartTime2[StartTime2["DocumentStart"] = 0] = "DocumentStart";
    StartTime2[StartTime2["DocumentBody"] = 1] = "DocumentBody";
    StartTime2[StartTime2["DocumentEnd"] = 2] = "DocumentEnd";
    return StartTime2;
  })(StartTime || {});
  const log$7 = logger.child("feature:key-manager");
  const KeyManagerFeature = {
    name: "Key Manager",
    description: "Allows the user to register their Torn API key via a Tampermonkey menu command",
    executionTime: StartTime.DocumentEnd,
    shouldRun() {
      return true;
    },
    run() {
      if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("Torn War Stuff: Register Key", () => {
          const defaultPrompt = twseconfig.apiKey;
          const key = prompt("Please enter a Torn API Key:", defaultPrompt);
          if (key !== null) {
            const trimmedKey = key.trim();
            if (trimmedKey.length === 16 || trimmedKey === "") {
              twseconfig.apiKey = trimmedKey;
              log$7.info("Successfully updated API Key registration");
              alert("Torn API key registered successfully!");
            } else {
              alert("Invalid key! A Torn API key must be exactly 16 characters.");
            }
          }
        });
        log$7.debug("Tampermonkey menu command 'Register Key' initialized");
      } else {
        log$7.warn("GM_registerMenuCommand is not available in this context.");
      }
    }
  };
  const __vite_glob_0_0 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: KeyManagerFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const log$6 = logger.child("dom");
  function waitForElement(selector, timeoutMs = 15e3) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        return resolve(existing);
      }
      const observer = new MutationObserver((_, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      if (timeoutMs > 0) {
        setTimeout(() => {
          observer.disconnect();
          log$6.debug(`Timeout waiting for element selector: '${selector}'`);
          resolve(null);
        }, timeoutMs);
      }
    });
  }
  function observeElement(target, callback, options = { childList: true, subtree: true }) {
    const observer = new MutationObserver((mutations, obs) => {
      if (!target.isConnected) {
        cleanup();
        return;
      }
      callback(mutations, obs);
    });
    const intervalId = setInterval(() => {
      if (!target.isConnected) {
        cleanup();
      }
    }, 1e4);
    function cleanup() {
      clearInterval(intervalId);
      observer.disconnect();
    }
    const originalDisconnect = observer.disconnect.bind(observer);
    observer.disconnect = () => {
      clearInterval(intervalId);
      originalDisconnect();
    };
    observer.observe(target, options);
    return observer;
  }
  function on_navigation(callback) {
    const nav = window.navigation;
    if (nav) {
      nav.addEventListener("currententrychange", callback);
      return () => {
        nav.removeEventListener("currententrychange", callback);
      };
    }
    const delayedCallback = () => {
      setTimeout(callback, 0);
    };
    window.addEventListener("popstate", delayedCallback);
    window.addEventListener("hashchange", delayedCallback);
    return () => {
      window.removeEventListener("popstate", delayedCallback);
      window.removeEventListener("hashchange", delayedCallback);
    };
  }
  function sort_by_attribute(a, b, attr, d = 0) {
    const left = parseInt(a.getAttribute(attr) || `${d}`, 10);
    const right = parseInt(b.getAttribute(attr) || `${d}`, 10);
    return left - right;
  }
  let _react$1;
  function getReact$1() {
    return _react$1 ??= unsafeWindow.React;
  }
  const FRAGMENT_SENTINEL = Symbol("ReactFragment");
  function jsx(type, { children, ...props }, key) {
    const R = getReact$1();
    const realType = type === FRAGMENT_SENTINEL ? R.Fragment : type;
    if (key !== void 0) props.key = key;
    if (children === void 0) {
      return R.createElement(realType, props);
    }
    return Array.isArray(children) ? R.createElement(realType, props, ...children) : R.createElement(realType, props, children);
  }
  const jsxs = jsx;
  let _react;
  function getReact() {
    return _react ??= unsafeWindow.React;
  }
  new Proxy({}, {
    get(_, prop) {
      return getReact()[prop];
    }
  });
  const useEffect = ((...args) => getReact().useEffect(
    ...args
  ));
  const createElement = ((...args) => getReact().createElement(
    ...args
  ));
  new Proxy(
    {},
    {
      get: (_, prop) => getReact().Fragment[prop]
    }
  );
  new Proxy(
    {},
    {
      get: (_, prop) => getReact().StrictMode[prop]
    }
  );
  new Proxy(
    {},
    {
      get: (_, prop) => getReact().Suspense[prop]
    }
  );
  new Proxy(
    {},
    {
      get: (_, prop) => getReact().Children[prop]
    }
  );
  let _reactDOM;
  function getReactDOM() {
    return _reactDOM ??= unsafeWindow.ReactDOM;
  }
  new Proxy({}, {
    get(_, prop) {
      return getReactDOM()[prop];
    }
  });
  const createRoot = ((...args) => getReactDOM().createRoot(...args));
  const DEFAULT_VALUES = {
    apiKey: "",
    warSorting: true,
    bubbleEnabled: true,
    copyButtonEnabled: true,
    debugLogs: false
  };
  function SettingsPanelComponent({
    apiKey,
    drafts,
    showSavedMessage,
    onApiKeyDraftChange,
    onApiKeyCommit,
    onWarSortingDraftChange,
    onBubbleEnabledDraftChange,
    onCopyButtonEnabledDraftChange,
    onDebugLogsDraftChange,
    onSave,
    onReset,
    onClearCache,
    onRendered
  }) {
    useEffect(() => {
      onRendered();
    });
    return jsxs("details", { className: "accordion cont-gray border-round twse-settings-details", children: [
jsx(
        "summary",
        {
          style: { cursor: "pointer", fontWeight: "bold", userSelect: "none" },
          children: "Torn War Stuff Enhanced Settings"
        }
      ),
jsxs("div", { style: { marginTop: "15px" }, children: [
jsxs("div", { className: "input-row", children: [
jsx("label", { htmlFor: "twse-api-key", children: "Torn API Key:" }),
jsx(
            "input",
            {
              id: "twse-api-key",
              type: "text",
              className: apiKey ? "blur-mode" : "",
              placeholder: "Paste 16-char API key here...",
              maxLength: 16,
              value: drafts.apiKey,
              onInput: (e) => onApiKeyDraftChange(e.target.value),
              onChange: (e) => onApiKeyCommit(e.target.value.trim())
            }
          ),
jsxs("div", { className: "twse-api-explanation", children: [
jsx("strong", { children: "Info:" }),
            " Provide a valid 16-character public API key to pull faction war information and real-time member statuses."
          ] })
        ] }),
jsx("h3", { children: "Feature Toggles:" }),
jsxs("div", { className: "input-row-inline", children: [
jsx(
            "input",
            {
              id: "twse-war-sorting",
              type: "checkbox",
              checked: drafts.warSorting,
              onChange: (e) => onWarSortingDraftChange(e.target.checked)
            }
          ),
jsx("label", { htmlFor: "twse-war-sorting", children: "Enable War Page Sorting (automatically sorts okay/traveling/hospitalized members)" })
        ] }),
jsxs("div", { className: "input-row-inline", children: [
jsx(
            "input",
            {
              id: "twse-chain-bubble-toggle",
              type: "checkbox",
              checked: drafts.bubbleEnabled,
              onChange: (e) => onBubbleEnabledDraftChange(e.target.checked)
            }
          ),
jsx("label", { htmlFor: "twse-chain-bubble-toggle", children: "Show Floating Chain Bubble (displays real-time countdown of your faction's chain)" })
        ] }),
jsxs("div", { className: "input-row-inline", children: [
jsx(
            "input",
            {
              id: "twse-copy-btn-toggle",
              type: "checkbox",
              checked: drafts.copyButtonEnabled,
              onChange: (e) => onCopyButtonEnabledDraftChange(
                e.target.checked
              )
            }
          ),
jsx("label", { htmlFor: "twse-copy-btn-toggle", children: 'Enable "Copy Name [ID]" Button next to members' })
        ] }),
jsxs("div", { className: "input-row-inline", children: [
jsx(
            "input",
            {
              id: "twse-debug-logs",
              type: "checkbox",
              checked: drafts.debugLogs,
              onChange: (e) => onDebugLogsDraftChange(e.target.checked)
            }
          ),
jsx("label", { htmlFor: "twse-debug-logs", children: "Enable Developer/Debug Logging" })
        ] }),
jsxs(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginTop: "20px"
            },
            children: [
jsx("button", { type: "button", className: "torn-btn btn-save", onClick: onSave, children: "Save Settings" }),
jsx(
                "button",
                {
                  type: "button",
                  className: "torn-btn btn-secondary",
                  onClick: onReset,
                  children: "Reset to Defaults"
                }
              ),
jsx(
                "button",
                {
                  type: "button",
                  className: "torn-btn btn-secondary",
                  onClick: onClearCache,
                  children: "Clear Cache"
                }
              ),
              showSavedMessage && jsx(
                "span",
                {
                  style: {
                    color: "#4CAF50",
                    fontWeight: "bold",
                    marginLeft: "10px"
                  },
                  children: "✓ Saved!"
                }
              )
            ]
          }
        )
      ] })
    ] });
  }
  class TWSESettingsPanel extends HTMLElement {
    constructor() {
      super();
      this._props = { ...DEFAULT_VALUES };
      this._drafts = { ...DEFAULT_VALUES };
      this._showSavedMessage = false;
      this._root = null;
      this._updatePromise = Promise.resolve();
      this._resolveUpdate = null;
      this.resetDrafts();
    }
    connectedCallback() {
      this._root = createRoot(this);
      this.render();
    }
    disconnectedCallback() {
      this._root?.unmount();
      this._root = null;
    }
    get updateComplete() {
      return this._updatePromise;
    }
    resetDrafts() {
      this._drafts = {
        apiKey: this._props.apiKey,
        warSorting: this._props.warSorting,
        bubbleEnabled: this._props.bubbleEnabled,
        copyButtonEnabled: this._props.copyButtonEnabled,
        debugLogs: this._props.debugLogs
      };
    }
    render() {
      if (!this._root) return;
      if (!this._resolveUpdate) {
        this._updatePromise = new Promise((resolve) => {
          this._resolveUpdate = resolve;
        });
      }
      this._root.render(
        createElement(SettingsPanelComponent, {
          apiKey: this._props.apiKey,
          drafts: this._drafts,
          showSavedMessage: this._showSavedMessage,
          onApiKeyDraftChange: (val) => {
            this._drafts.apiKey = val;
            this._showSavedMessage = false;
            this.render();
          },
          onApiKeyCommit: (val) => {
            this._drafts.apiKey = val;
            this.dispatchEvent(
              new CustomEvent("twse-save-key", {
                detail: { apiKey: val },
                bubbles: true,
                composed: true
              })
            );
          },
          onWarSortingDraftChange: (val) => {
            this._drafts.warSorting = val;
            this._showSavedMessage = false;
            this.render();
          },
          onBubbleEnabledDraftChange: (val) => {
            this._drafts.bubbleEnabled = val;
            this._showSavedMessage = false;
            this.render();
          },
          onCopyButtonEnabledDraftChange: (val) => {
            this._drafts.copyButtonEnabled = val;
            this._showSavedMessage = false;
            this.render();
          },
          onDebugLogsDraftChange: (val) => {
            this._drafts.debugLogs = val;
            this._showSavedMessage = false;
            this.render();
          },
          onSave: () => {
            this.handleSave();
          },
          onReset: () => {
            if (confirm("Are you sure you want to reset all settings to defaults?")) {
              this.dispatchEvent(
                new CustomEvent("twse-reset", {
                  bubbles: true,
                  composed: true
                })
              );
            }
          },
          onClearCache: () => {
            if (confirm(
              "Are you sure you want to clear all TWSE war monitoring cache?"
            )) {
              this.dispatchEvent(
                new CustomEvent("twse-clear-cache", {
                  bubbles: true,
                  composed: true
                })
              );
            }
          },
          onRendered: () => {
            if (this._resolveUpdate) {
              this._resolveUpdate();
              this._resolveUpdate = null;
            }
          }
        })
      );
    }
    handleSave() {
      this._showSavedMessage = true;
      this.render();
      setTimeout(() => {
        this._showSavedMessage = false;
        this.render();
      }, 3e3);
      this.dispatchEvent(
        new CustomEvent("twse-save", {
          detail: {
            apiKey: this._drafts.apiKey,
            warSorting: this._drafts.warSorting,
            bubbleEnabled: this._drafts.bubbleEnabled,
            copyButtonEnabled: this._drafts.copyButtonEnabled,
            debugLogs: this._drafts.debugLogs
          },
          bubbles: true,
          composed: true
        })
      );
    }
get apiKey() {
      return this._props.apiKey;
    }
    set apiKey(val) {
      this._props.apiKey = val;
      this._drafts.apiKey = val;
      this.render();
    }
    get warSorting() {
      return this._props.warSorting;
    }
    set warSorting(val) {
      this._props.warSorting = val;
      this._drafts.warSorting = val;
      this.render();
    }
    get bubbleEnabled() {
      return this._props.bubbleEnabled;
    }
    set bubbleEnabled(val) {
      this._props.bubbleEnabled = val;
      this._drafts.bubbleEnabled = val;
      this.render();
    }
    get copyButtonEnabled() {
      return this._props.copyButtonEnabled;
    }
    set copyButtonEnabled(val) {
      this._props.copyButtonEnabled = val;
      this._drafts.copyButtonEnabled = val;
      this.render();
    }
    get debugLogs() {
      return this._props.debugLogs;
    }
    set debugLogs(val) {
      this._props.debugLogs = val;
      this._drafts.debugLogs = val;
      this.render();
    }
get draftApiKey() {
      return this._drafts.apiKey;
    }
    set draftApiKey(val) {
      this._drafts.apiKey = val;
      this.render();
    }
    get draftWarSorting() {
      return this._drafts.warSorting;
    }
    set draftWarSorting(val) {
      this._drafts.warSorting = val;
      this.render();
    }
    get draftBubbleEnabled() {
      return this._drafts.bubbleEnabled;
    }
    set draftBubbleEnabled(val) {
      this._drafts.bubbleEnabled = val;
      this.render();
    }
    get draftCopyButtonEnabled() {
      return this._drafts.copyButtonEnabled;
    }
    set draftCopyButtonEnabled(val) {
      this._drafts.copyButtonEnabled = val;
      this.render();
    }
    get draftDebugLogs() {
      return this._drafts.debugLogs;
    }
    set draftDebugLogs(val) {
      this._drafts.debugLogs = val;
      this.render();
    }
  }
  customElements.define("twse-settings-panel", TWSESettingsPanel);
  const log$5 = logger.child("feature:settings");
  const SettingsFeature = {
    name: "Settings",
    description: "Renders and handles the settings panel at the bottom of the faction page",
    executionTime: StartTime.DocumentEnd,
    shouldRun() {
      return window.location.href.includes("factions.php");
    },
    async run() {
      const factionsContainer = await waitForElement("#factions");
      if (!factionsContainer) {
        log$5.warn("Failed to find #factions element to append settings panel");
        return;
      }
      const panel = document.createElement("twse-settings-panel");
      panel.apiKey = twseconfig.apiKey;
      panel.warSorting = twseconfig.war_sorting;
      panel.bubbleEnabled = twseconfig.bubble_enabled;
      panel.copyButtonEnabled = twseconfig.copy_button_enabled;
      panel.debugLogs = twseconfig.debug_logs;
      panel.addEventListener("twse-save", (e) => {
        const detail = e.detail;
        twseconfig.apiKey = detail.apiKey;
        twseconfig.war_sorting = detail.warSorting;
        twseconfig.bubble_enabled = detail.bubbleEnabled;
        twseconfig.copy_button_enabled = detail.copyButtonEnabled;
        twseconfig.debug_logs = detail.debugLogs;
        log$5.info("Settings saved successfully");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-reset", () => {
        twseconfig.reset();
        panel.apiKey = twseconfig.apiKey;
        panel.warSorting = twseconfig.war_sorting;
        panel.bubbleEnabled = twseconfig.bubble_enabled;
        panel.copyButtonEnabled = twseconfig.copy_button_enabled;
        panel.debugLogs = twseconfig.debug_logs;
        log$5.info("Settings reset to defaults");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-save-key", (e) => {
        const detail = e.detail;
        twseconfig.apiKey = detail.apiKey;
        log$5.info("API key saved");
        window.dispatchEvent(new CustomEvent("twse-config-updated"));
      });
      panel.addEventListener("twse-clear-cache", () => {
        log$5.info("Settings cleared caching successfully");
        window.dispatchEvent(new CustomEvent("twse-clear-cache"));
      });
      const checkAndMount = () => {
        const warList = document.getElementById("faction_war_list_id");
        if (warList) {
          if (panel.previousSibling !== warList) {
            warList.after(panel);
            log$5.debug(
              "Settings panel successfully placed after #faction_war_list_id"
            );
          }
        } else {
          panel.remove();
        }
      };
      const observer = new MutationObserver(checkAndMount);
      observer.observe(factionsContainer, {
        childList: true,
        subtree: true
      });
      checkAndMount();
    }
  };
  const __vite_glob_0_1 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: SettingsFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const log$4 = logger.child("api");
  class TornApiClient {
    constructor() {
      this.baseUrl = "https://api.torn.com/v2/faction";
    }
async fetchFactionData(factionId) {
      const tornpdakey = "###PDA-APIKEY###";
      let key = twseconfig.apiKey;
      if (!tornpdakey.startsWith("###PDA")) {
        key = tornpdakey;
      }
      if (!key || key.length !== 16) {
        log$4.warn("Torn API key is invalid or not set. Skipping API request.");
        return null;
      }
      const url = `${this.baseUrl}?id=${factionId}&selections=members,chain,timestamp&key=${key}&comment=TornWarStuffEnhanced&timestamp=${Date.now() % 1e3 + 10}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          try {
            const errData = await response.json();
            log$4.error(
              `Torn API returned error code ${errData.code}: ${errData.error}`
            );
            return { error: errData };
          } catch {
            throw new Error(`HTTP Error status: ${response.status}`);
          }
        }
        const data = await response.json();
        return data;
      } catch (e) {
        log$4.error(
          `Network or parse error fetching faction ${factionId} data:`,
          e
        );
        return null;
      }
    }
isUnrecoverableError(errorCode) {
      const unrecoverable = [0, 1, 2, 3, 4, 6, 7, 10, 12, 13, 14, 16, 18, 21];
      return unrecoverable.includes(errorCode);
    }
isRateLimitError(errorCode) {
      const rateLimits = [5, 8, 9];
      return rateLimits.includes(errorCode);
    }
  }
  const tornApi = new TornApiClient();
  class BatchedDomWriter {
    constructor(config) {
      this.attrCache = new WeakMap();
      this.styleCache = new WeakMap();
      this.deferredWrites = [];
      this.deferredStyles = [];
      this.groupsByAttr = new Map();
      this.dirtyGroups = new Set();
      for (const [groupName, attrs] of Object.entries(config.groups)) {
        for (const attr of attrs) {
          let groups = this.groupsByAttr.get(attr);
          if (!groups) {
            groups = new Set();
            this.groupsByAttr.set(attr, groups);
          }
          groups.add(groupName);
        }
      }
    }
    setAttr(element, attr, value) {
      const cache = this.cacheFor(
        this.attrCache,
        element,
        attr,
        () => element.getAttribute(attr) ?? ""
      );
      if (cache[attr] === value) {
        return false;
      }
      cache[attr] = value;
      this.deferredWrites.push([element, attr, value]);
      for (const groupName of this.groupsByAttr.get(attr) ?? []) {
        this.dirtyGroups.add(groupName);
      }
      return true;
    }
    setStyle(element, prop, value) {
      const cache = this.cacheFor(
        this.styleCache,
        element,
        prop,
        () => element.style.getPropertyValue(prop)
      );
      if (cache[prop] === value) {
        return;
      }
      cache[prop] = value;
      this.deferredStyles.push([element, prop, value]);
    }


cacheFor(cacheMap, element, key, readLiveValue) {
      let cache = cacheMap.get(element);
      if (!cache) {
        cache = {};
        cacheMap.set(element, cache);
      }
      if (cache[key] === void 0) {
        cache[key] = readLiveValue();
      }
      return cache;
    }
    flush() {
      for (const [element, attr, value] of this.deferredWrites) {
        element.setAttribute(attr, value);
      }
      this.deferredWrites = [];
      for (const [element, prop, value] of this.deferredStyles) {
        element.style.setProperty(prop, value);
      }
      this.deferredStyles = [];
      const dirtyGroups = this.dirtyGroups;
      this.dirtyGroups = new Set();
      return dirtyGroups;
    }
  }
  const log$3 = logger.child("cache");
  const CACHE_VERSION = 1;
  class FactionCache {
    constructor() {
      this.prefix = "xentac-torn_war_stuff_enhanced-status-";
      this.ttlMs = 1e4;
    }

get(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheStr = localStorage.getItem(key);
        if (!cacheStr) {
          return null;
        }
        const parsed = JSON.parse(cacheStr);
        if (!parsed || typeof parsed.timestamp !== "number" || !parsed.members || parsed.version !== CACHE_VERSION) {
          this.remove(factionId);
          return null;
        }
        const now = Date.now();
        if (now - parsed.timestamp > this.ttlMs) {
          this.remove(factionId);
          return null;
        }
        return parsed.members;
      } catch (e) {
        log$3.error(`Error reading cached members for faction ${factionId}:`, e);
        this.remove(factionId);
        return null;
      }
    }
set(factionId, members) {
      try {
        const key = `${this.prefix}${factionId}`;
        const cacheItem = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          members
        };
        localStorage.setItem(key, JSON.stringify(cacheItem));
      } catch (e) {
        log$3.error(`Error caching members for faction ${factionId}:`, e);
      }
    }
remove(factionId) {
      try {
        const key = `${this.prefix}${factionId}`;
        localStorage.removeItem(key);
      } catch (e) {
        log$3.error(`Error removing cached status for faction ${factionId}:`, e);
      }
    }
cleanExpired() {
      try {
        const now = Date.now();
        let cleanedCount = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(this.prefix)) {
            continue;
          }
          const value = localStorage.getItem(key);
          if (!value) {
            continue;
          }
          try {
            const parsed = JSON.parse(value);
            if (!parsed || now - parsed.timestamp > this.ttlMs) {
              localStorage.removeItem(key);
              cleanedCount++;
              i--;
            }
          } catch {
            localStorage.removeItem(key);
            cleanedCount++;
            i--;
          }
        }
        if (cleanedCount > 0) {
          log$3.info(`Cleaned ${cleanedCount} expired cached statuses`);
        }
      } catch (e) {
        log$3.error("Error sweeping expired cached statuses:", e);
      }
    }
clearAll() {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(this.prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });
        log$3.info(`Cleared all cached faction statuses`);
      } catch (e) {
        log$3.error("Error clearing cached statuses:", e);
      }
    }
  }
  const factionCache = new FactionCache();
  function getCurrentTime() {
    const w = window;
    if (typeof w.getCurrentTimestamp === "function") {
      try {
        return w.getCurrentTimestamp();
      } catch (_e) {
      }
    }
    return Date.now();
  }
  function pad_with_zeros(n) {
    if (n < 10) {
      return `0${n}`;
    }
    return String(n);
  }
  function calc_delta(delta, include_seconds = true, pad_hour = true) {
    const s = Math.floor(delta % 60);
    const m = Math.floor(delta / 60 % 60);
    const h = Math.floor(delta / 60 / 60);
    const hour_minute = `${pad_hour ? pad_with_zeros(h) : h}:${pad_with_zeros(m)}`;
    return hour_minute + (include_seconds ? `:${pad_with_zeros(s)}` : "");
  }
  function formatChainTimeout(seconds) {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);
    const m = Math.floor(absSeconds / 60);
    const s = Math.floor(absSeconds % 60);
    return `${isNegative ? "-" : ""}${m}:${pad_with_zeros(s)}`;
  }
  function formatChainCooldown(seconds) {
    if (seconds <= 0) return "0:00";
    const s = Math.floor(seconds % 60);
    const m = Math.floor(seconds / 60 % 60);
    const h = Math.floor(seconds / 3600 % 24);
    const d = Math.floor(seconds / 86400);
    if (d > 0) return `${d}d${h}h`;
    if (h > 0) return `${h}h${m}m`;
    if (m >= 10) return `${m}m`;
    return `${m}:${pad_with_zeros(s)}`;
  }
  const DEST_TABLE = new Map([
    ["mexico", "MX"],
    ["cayman islands", "CI"],
    ["canada", "CA"],
    ["hawaii", "HI"],
    ["united kingdom", "UK"],
    ["argentina", "AR"],
    ["switzerland", "SW"],
    ["japan", "JP"],
    ["china", "CN"],
    ["uae", "UAE"],
    ["south africa", "SA"],
    ["torn", "TC"]
  ]);
  function shorten_destination(dest) {
    return DEST_TABLE.get(dest.toLowerCase().trim()) ?? dest;
  }
  const TRAVELING_REGEX = /Traveling from ([\S ]+) to ([\S ]+)/;
  function extract_destinations_from_description(description) {
    if (!description.startsWith("Traveling from")) {
      return null;
    }
    const match = TRAVELING_REGEX.exec(description);
    if (!match) {
      return null;
    }
    return {
      from: shorten_destination(match[1]),
      to: shorten_destination(match[2])
    };
  }
  const log$2 = logger.child("twse-server");
  const TWSE_SERVER_BASE_URL = "https://twse.dev";
  const MIN_FETCH_INTERVAL_MS = 1e3;
  class TwseServerClient {
    constructor() {
      this.tabId = crypto.randomUUID();
      this.lastFetchTime = new Map();
    }
async fetchLatest(factionId) {
      const now = Date.now();
      const last = this.lastFetchTime.get(factionId) ?? 0;
      if (now - last < MIN_FETCH_INTERVAL_MS) return null;
      this.lastFetchTime.set(factionId, now);
      log$2.debug("Fetching latest from twse.dev");
      const start = performance.now();
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}`,
          onload: (response) => {
            if (response.status !== 200) {
              resolve(null);
              return;
            }
            try {
              const end = performance.now();
              log$2.debug(`Received result in ${end - start}ms`);
              resolve(JSON.parse(response.responseText));
            } catch (e) {
              log$2.error(`Failed to parse response for faction ${factionId}:`, e);
              resolve(null);
            }
          },
          onerror: (e) => {
            log$2.debug(`Failed to fetch latest data for faction ${factionId}:`, e);
            resolve(null);
          }
        });
      });
    }
submit(factionId, payload) {
      log$2.debug("Sending update to twse server");
      GM_xmlhttpRequest({
        method: "POST",
        url: `${TWSE_SERVER_BASE_URL}/faction/${factionId}/submit`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ ...payload, tab_id: this.tabId }),
        onerror: (e) => {
          log$2.error(
            `Failed to submit faction ${factionId} data to TWSE Server:`,
            e
          );
        }
      });
    }
  }
  const twseClient = new TwseServerClient();
  const stylesCss = ".members-list li:has(div.status[data-twse-highlight=true]){background-color:#99eb99!important}:root.twse-window-focused .members-list li:has(div.status[data-twse-status-differs=true]){background-color:#c4974c!important}.members-list div.status[data-twse-traveling=true]:after{color:#696026!important}:root .dark-mode .members-list li:has(div.status[data-twse-highlight=true]){background-color:#446944!important}:root.twse-window-focused .dark-mode .members-list li:has(div.status[data-twse-status-differs=true]){background-color:#795315!important}:root .dark-mode .members-list div.status[data-twse-traveling=true]:after{color:#ffed76!important}.members-list div.status[data-twse-overridden=true]{position:relative!important;color:transparent!important}.members-list div.status[data-twse-overridden=true]:after{content:var(--twse-content);position:absolute;top:0;left:0;width:calc(100% - 10px);height:100%;background:inherit;display:flex;right:10px;justify-content:flex-end;align-items:center;white-space:nowrap!important}.members-list .ok.status:after{color:var(--user-status-green-color)}.members-list .not-ok.status:after{color:var(--user-status-red-color)}.members-list .abroad.status:after,.members-list .traveling.status:after{color:var(--user-status-blue-color)}.twse-sort-toggle-container{position:absolute;left:10px;display:inline-flex;align-items:center}.twse-sort-toggle-label{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#999;font-size:13px;-webkit-user-select:none;user-select:none}.twse-sort-toggle-checkbox{cursor:pointer;margin:0;width:13px;height:13px}.members-list li .member{position:relative!important;display:flex!important;align-items:center}.twse-copy-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:4px;color:#888;transition:color .15s,background-color .15s,transform .1s;border-radius:4px;z-index:10}.twse-copy-btn:hover{color:#333;background-color:#0000000d}:root .dark-mode .twse-copy-btn:hover{color:#fff;background-color:#ffffff26}.twse-copy-btn:active{transform:translateY(-50%) scale(.9)}.twse-copy-btn.success{color:#494!important}:root .dark-mode .twse-copy-btn.success{color:#69eb69!important}.twse-chain-bubble{position:fixed;bottom:100px;right:20px;z-index:9999;background:#1e1e1ed9;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:6px 10px;box-shadow:0 8px 32px #0000005e;color:#e0e0e0;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:11px;line-height:1.5;display:flex;flex-direction:column;transition:opacity .3s ease,transform .3s ease;min-width:100px;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none!important}.twse-chain-bubble *{touch-action:none!important}.twse-chain-bubble.hidden{opacity:0;transform:translateY(10px);pointer-events:none}.twse-chain-body{display:flex;flex-direction:column;gap:4px;width:100%}.twse-chain-tag,.twse-chain-mult{display:none}.twse-chain-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.twse-chain-stats{display:flex;align-items:center;gap:6px;width:100%}.twse-chain-count{font-weight:600;color:#fff}.twse-chain-timer{margin-left:auto;font-family:monospace;font-weight:700;padding:2px 6px;border-radius:4px;background:#0000004d}.twse-chain-timer.okay{color:#69eb69}.twse-chain-timer.cooldown{color:#64b5f6;background:#64b5f626}.twse-chain-count.cooldown{color:#64b5f6}.twse-chain-timer.negative{color:#ff5252}.twse-chain-timer.urgent{color:#ff5252;background:#ff525226;animation:twse-pulse 1s infinite alternate}@keyframes twse-pulse{0%{box-shadow:0 0 2px #ff525266}to{box-shadow:0 0 8px #ff5252cc}}body.twse-copy-disabled .twse-copy-btn,body.twse-bubble-disabled #twse-chain-bubble{display:none!important}body{--twse-bg-color: #f0f0f0;--twse-alt-bg-color: #fff;--twse-border-color: #ccc;--twse-input-color: #333;--twse-text-color: #000;--twse-hover-color: #ddd;--twse-glow-color: #4caf50;--twse-success-color: #4caf50}:root .dark-mode{--twse-bg-color: #333;--twse-alt-bg-color: #383838;--twse-border-color: #444;--twse-input-color: #ccc;--twse-text-color: #ccc;--twse-hover-color: #555;--twse-glow-color: #4caf50;--twse-success-color: #4caf50}twse-settings-panel{display:block;margin-top:20px;clear:both}twse-settings-panel .accordion{margin:10px 0;padding:15px;background-color:var(--twse-bg-color);border:1px solid var(--twse-border-color);border-radius:5px;color:var(--twse-text-color);font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}twse-settings-panel .accordion.glow{border-color:var(--twse-glow-color);box-shadow:0 0 8px #4caf5080}twse-settings-panel .input-row{display:flex;flex-direction:column;gap:5px;margin-bottom:15px}twse-settings-panel .input-row-inline{display:flex;align-items:center;gap:10px;margin-bottom:15px;font-size:13px;cursor:pointer;-webkit-user-select:none;user-select:none}twse-settings-panel .input-row-inline input[type=checkbox]{cursor:pointer;width:14px;height:14px;margin:0}twse-settings-panel .input-row-inline label{cursor:pointer;line-height:1.4}twse-settings-panel .blur-mode{filter:blur(4px);transition:filter .2s ease}twse-settings-panel .blur-mode:hover,twse-settings-panel .blur-mode:focus{filter:blur(0)}twse-settings-panel input[type=text]{box-sizing:border-box;text-align:left;vertical-align:top;width:250px;height:34px;margin-right:8px;padding:8px 10px;line-height:14px;display:inline-block;border:1px solid var(--twse-border-color);border-radius:5px;background-color:var(--twse-alt-bg-color);color:var(--twse-text-color);outline:none}twse-settings-panel input[type=text]:focus{border-color:var(--twse-glow-color)}twse-settings-panel .twse-api-explanation{background-color:var(--twse-alt-bg-color);border:1px solid var(--twse-border-color);border-radius:8px;color:var(--twse-text-color);margin-top:5px;margin-bottom:5px;padding:10px 14px;font-size:12px;line-height:1.4;max-width:600px}twse-settings-panel h3{margin:20px 0 12px;font-size:14px;font-weight:700;border-bottom:1px solid var(--twse-border-color);padding-bottom:6px}";
  importCSS(stylesCss);
  var SortGroup = ((SortGroup2) => {
    SortGroup2["UnexpectedOkay"] = "UnexpectedOkay";
    SortGroup2["ExpectedOkay"] = "ExpectedOkay";
    SortGroup2["Hospitalized"] = "Hospitalized";
    SortGroup2["Incoming"] = "Incoming";
    SortGroup2["Abroad"] = "Abroad";
    SortGroup2["Outgoing"] = "Outgoing";
    SortGroup2["Traveling"] = "Traveling";
    return SortGroup2;
  })(SortGroup || {});
  function parseCanonicalStatus(statusDiv) {
    if (statusDiv.classList.contains("traveling") || statusDiv.classList.contains("abroad")) {
      return "Traveling";
    }
    if (statusDiv.classList.contains("hospital") || statusDiv.classList.contains("jail")) {
      return "HospitalOrJail";
    }
    if (statusDiv.textContent === "Okay") {
      return "Okay";
    }
    return "Unknown";
  }
  function classifyMember(status, canonicalStatus, transitionState, browserNow, tornNow, config) {
    let decision;
    if (status.state === "Hospital" || status.state === "Jail") {
      decision = classifyHospitalOrJail(
        status,
        canonicalStatus,
        transitionState,
        browserNow,
        tornNow,
        config.nearExpiryThresholdSec
      );
    } else if (status.state === "Traveling" || status.state === "Abroad") {
      decision = classifyTraveling(
        status,
        canonicalStatus,
        transitionState,
        browserNow
      );
    } else {
      decision = classifyOkay(transitionState, browserNow);
    }
    return {
      ...decision,
      isUnexpectedHighlighted: isUnexpectedHighlighted(
        decision.nextTransitionState,
        browserNow,
        config
      )
    };
  }
  function classifyOkay(transitionState, browserNow) {
    const sortGroup = carryForwardSortGroup(transitionState);
    const okaySince = sortGroup === "ExpectedOkay" && transitionState.okaySince === null ? browserNow : transitionState.okaySince;
    return {
      sortGroup,
      route: null,
      nextTransitionState: {
        unexpectedSince: transitionState.unexpectedSince,
        okaySince
      },
      isNearExpiry: false
    };
  }
  function classifyHospitalOrJail(status, canonicalStatus, transitionState, browserNow, tornNow, nearExpiryThresholdSec) {
    const timeRemainingSec = Math.round(
      (status.until ?? 0) - tornNow / 1e3
    );
    if (canonicalStatus === "HospitalOrJail") {
      return {
        sortGroup: "Hospitalized",
        route: null,
        nextTransitionState: { unexpectedSince: null, okaySince: null },
        isNearExpiry: timeRemainingSec > 0 && timeRemainingSec < nearExpiryThresholdSec
      };
    }
    if (timeRemainingSec >= 0) {
      return {
        sortGroup: "UnexpectedOkay",
        route: null,
        nextTransitionState: {
          unexpectedSince: transitionState.unexpectedSince ?? browserNow,
          okaySince: transitionState.okaySince
        },
        isNearExpiry: false
      };
    }
    return {
      sortGroup: "ExpectedOkay",
      route: null,
      nextTransitionState: {
        unexpectedSince: null,
        okaySince: (status.until ?? 0) * 1e3
      },
      isNearExpiry: false
    };
  }
  function classifyTraveling(status, canonicalStatus, transitionState, browserNow) {
    if (canonicalStatus === "Traveling") {
      const nextTransitionState = {
        unexpectedSince: null,
        okaySince: null
      };
      if (status.description.includes("In ")) {
        return {
          sortGroup: "Abroad",
          route: null,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      const route = extract_destinations_from_description(status.description);
      if (route?.from === "TC") {
        return {
          sortGroup: "Outgoing",
          route,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      if (route?.to === "TC") {
        return {
          sortGroup: "Incoming",
          route,
          nextTransitionState,
          isNearExpiry: false
        };
      }
      return {
        sortGroup: "Traveling",
        route: route ?? null,
        nextTransitionState,
        isNearExpiry: false
      };
    }
    if (canonicalStatus === "Okay") {
      return {
        sortGroup: "UnexpectedOkay",
        route: null,
        nextTransitionState: {
          unexpectedSince: transitionState.unexpectedSince ?? browserNow,
          okaySince: transitionState.okaySince
        },
        isNearExpiry: false
      };
    }
    return {
      sortGroup: carryForwardSortGroup(transitionState),
      route: null,
      nextTransitionState: transitionState,
      isNearExpiry: false
    };
  }
  function carryForwardSortGroup(transitionState) {
    return transitionState.unexpectedSince ? "UnexpectedOkay" : "ExpectedOkay";
  }
  function isUnexpectedHighlighted(transitionState, browserNow, config) {
    return transitionState.unexpectedSince !== null && browserNow - transitionState.unexpectedSince < config.unexpectedHighlightMs;
  }
  function getMemberLists() {
    return Array.from(document.querySelectorAll("ul.members-list"));
  }
  function getFactionIds() {
    const ids = [];
    for (const list of getMemberLists()) {
      const anchor = list.querySelector(
        "a[href^='/factions.php']"
      );
      if (!anchor) continue;
      const id = parseHrefParam(anchor, "ID");
      if (id) ids.push(id);
    }
    return ids;
  }
  function getMemberRows() {
    const rows = [];
    for (const list of getMemberLists()) {
      const lis = list.querySelectorAll("li.enemy, li.your");
      for (const li of Array.from(lis)) {
        const anchor = li.querySelector(
          "a[href^='/profiles.php']"
        );
        if (!anchor) continue;
        const id = parseHrefParam(anchor, "XID");
        if (!id) continue;
        rows.push({
          id,
          li,
          statusDiv: li.querySelector("div.status")
        });
      }
    }
    return rows;
  }
  function getSortedColumn(memberList) {
    const parent = memberList.parentNode;
    if (!parent) return { column: null, order: null };
    const memberDiv = parent.querySelector("div.member div");
    const levelDiv = parent.querySelector("div.level div");
    const pointsDiv = parent.querySelector("div.points div");
    const statusDiv = parent.querySelector("div.status div");
    let column = null;
    let classname = "";
    if (memberDiv?.className.includes("activeIcon__")) {
      column = "member";
      classname = memberDiv.className;
    } else if (levelDiv?.className.includes("activeIcon__")) {
      column = "level";
      classname = levelDiv.className;
    } else if (pointsDiv?.className.includes("activeIcon__")) {
      column = "points";
      classname = pointsDiv.className;
    } else if (statusDiv?.className.includes("activeIcon__")) {
      column = "status";
      classname = statusDiv.className;
    }
    const order = column ? classname.includes("asc__") ? "asc" : "desc" : null;
    return { column, order };
  }
  function parseHrefParam(anchor, paramName) {
    try {
      return new URL(anchor.href, "https://www.torn.com").searchParams.get(
        paramName
      );
    } catch {
      return null;
    }
  }
  const log$1 = logger.child("feature:war-monitor");
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";
  const STATUS_DIFFERS = "data-twse-status-differs";
  function shouldRunMonitor() {
    if (!window.location.href.includes("factions.php")) {
      return false;
    }
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/war/")) {
      return false;
    }
    return true;
  }
  const WarMonitorFeature = {
    name: "War Monitor",
    description: "Monitors active Faction wars, retrieves real-time member statuses, and decorates rows",
    executionTime: StartTime.DocumentEnd,
    intervals: {
      poll: 1e4,
      watch: 500,
      minTimeBetweenRequests: 1e4,
      unexpectedHighlight: 1e4,
      nearExpiryThresholdSec: 300
    },
    shouldRun() {
      return window.location.href.includes("factions.php");
    },
    async run() {
      let active = false;
      let stopMonitor = null;
      const isVisible = () => {
        return !document.hidden;
      };
      const isTornPda = () => typeof window !== "undefined" && !!window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function";
      const startMonitor = async () => {
        if (active) return;
        active = true;
        factionCache.cleanExpired();
        const syncBodyClasses = () => {
          document.body.classList.toggle(
            "twse-copy-disabled",
            !twseconfig.copy_button_enabled
          );
          document.body.classList.toggle(
            "twse-bubble-disabled",
            !twseconfig.bubble_enabled
          );
        };
        syncBodyClasses();
        let running = true;
        let foundWar = false;
        let pageVisible = isVisible();
        const onTornPda = isTornPda();
        let windowFocused = onTornPda ? !document.hidden : document.hasFocus();
        const updateWindowFocusClass = () => {
          document.documentElement.classList.toggle(
            "twse-window-focused",
            windowFocused
          );
        };
        updateWindowFocusClass();
        let everSorted = false;
        let ffscouterSortingDeferred = false;
        let forceSortNextTick = false;
        const members = new Map();
        const memberLis = new Map();
        const unexpectedTransitions = new Map();
        const okaySinceTimestamps = new Map();
        const domWriter = new BatchedDomWriter({
          groups: {
            sort: [
              "data-until",
              "data-player_id",
              "data-sortA",
              "data-location",
              "data-okay-since",
              "data-unexpected-at"
            ]
          }
        });
        const UNEXPECTED_HIGHLIGHT_MS = WarMonitorFeature.intervals.unexpectedHighlight;
        let lastRequestTime = 0;
        const minTimeBetweenRequestsMs = WarMonitorFeature.intervals.minTimeBetweenRequests;
        const activeChains = new Map();
        const lastAppliedTimestamp = new Map();
        let cachedUserIdHashKey = null;
        let cachedUserIdHash = null;
        let lastChainHtml = "";
        let isDragging = false;
        let _isSorting = false;
        const memberListObservers = [];
        const onConfigUpdated = () => {
          syncBodyClasses();
          const checkbox = document.querySelector(
            "#twse-war-sort-checkbox"
          );
          if (checkbox) {
            checkbox.checked = twseconfig.war_sorting;
          }
        };
        window.addEventListener("twse-config-updated", onConfigUpdated);
        const onClearCache = () => {
          log$1.info("Received twse-clear-cache event. Purging all caches.");
          members.clear();
          factionCache.clearAll();
          activeChains.clear();
          unexpectedTransitions.clear();
          okaySinceTimestamps.clear();
          lastAppliedTimestamp.clear();
          updateStatuses();
        };
        window.addEventListener("twse-clear-cache", onClearCache);
        let bubbleContainer = document.getElementById(
          "twse-chain-bubble"
        );
        if (!bubbleContainer) {
          bubbleContainer = document.createElement("div");
          bubbleContainer.id = "twse-chain-bubble";
          bubbleContainer.className = "twse-chain-bubble hidden";
          document.body.appendChild(bubbleContainer);
        }
        if (bubbleContainer && !bubbleContainer.querySelector(".twse-chain-body")) {
          bubbleContainer.innerHTML = `<div class="twse-chain-body"></div>`;
        }
        const getBubbleRect = () => {
          if (bubbleContainer && typeof bubbleContainer.getBoundingClientRect === "function") {
            const r = bubbleContainer.getBoundingClientRect();
            return {
              left: r.left ?? 0,
              top: r.top ?? 0,
              width: r.width || 170,
              height: r.height || 60
            };
          }
          return { left: 0, top: 0, width: 170, height: 60 };
        };
        const clampToScreen = () => {
          if (!bubbleContainer) return;
          const rect = getBubbleRect();
          const w = rect.width;
          const h = rect.height;
          const currentLeft = parseFloat(bubbleContainer.style.left);
          const currentTop = parseFloat(bubbleContainer.style.top);
          if (!Number.isNaN(currentLeft) && !Number.isNaN(currentTop)) {
            const maxLeft = window.innerWidth - w;
            const maxTop = window.innerHeight - h;
            bubbleContainer.style.left = `${Math.max(0, Math.min(currentLeft, maxLeft))}px`;
            bubbleContainer.style.top = `${Math.max(0, Math.min(currentTop, maxTop))}px`;
          }
        };
        window.addEventListener("resize", clampToScreen, { passive: true });
        if (bubbleContainer) {
          const savedPos = twseconfig.bubble_position;
          if (savedPos) {
            bubbleContainer.style.bottom = "auto";
            bubbleContainer.style.right = "auto";
            bubbleContainer.style.left = `${savedPos.left}px`;
            bubbleContainer.style.top = `${savedPos.top}px`;
            setTimeout(clampToScreen, 0);
          }
          let startX = 0;
          let startY = 0;
          let initialX = 0;
          let initialY = 0;
          const dragStart = (e) => {
            isDragging = true;
            const isTouch = e.type === "touchstart";
            const touchEvent = e;
            const mouseEvent = e;
            const clientX = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientX : mouseEvent.clientX;
            const clientY = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientY : mouseEvent.clientY;
            startX = clientX;
            startY = clientY;
            if (bubbleContainer) {
              const rect = getBubbleRect();
              initialX = rect.left;
              initialY = rect.top;
              bubbleContainer.style.transition = "none";
              bubbleContainer.style.cursor = "grabbing";
            }
            if (isTouch) {
              e.stopPropagation();
            }
            if (e.cancelable) {
              e.preventDefault();
            }
            window.getSelection()?.removeAllRanges();
            if (isTouch) {
              if (bubbleContainer) {
                bubbleContainer.addEventListener("touchmove", dragMove, {
                  passive: false
                });
                bubbleContainer.addEventListener("touchend", dragEnd);
                bubbleContainer.addEventListener("touchcancel", dragEnd);
              }
            } else {
              document.addEventListener("mousemove", dragMove);
              document.addEventListener("mouseup", dragEnd);
            }
          };
          const dragMove = (e) => {
            if (!isDragging || !bubbleContainer) return;
            const isTouch = e.type === "touchmove";
            if (isTouch) {
              e.stopPropagation();
            }
            if (e.cancelable) {
              e.preventDefault();
            }
            const touchEvent = e;
            const mouseEvent = e;
            const clientX = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientX : mouseEvent.clientX;
            const clientY = isTouch && touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0].clientY : mouseEvent.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;
            const rect = getBubbleRect();
            const w = rect.width;
            const h = rect.height;
            let newLeft = initialX + dx;
            let newTop = initialY + dy;
            const maxLeft = window.innerWidth - w;
            const maxTop = window.innerHeight - h;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            bubbleContainer.style.bottom = "auto";
            bubbleContainer.style.right = "auto";
            bubbleContainer.style.left = `${newLeft}px`;
            bubbleContainer.style.top = `${newTop}px`;
          };
          const dragEnd = (e) => {
            isDragging = false;
            if (e && (e.type === "touchend" || e.type === "touchcancel")) {
              e.stopPropagation();
            }
            if (bubbleContainer) {
              bubbleContainer.style.cursor = "grab";
              const left = parseFloat(bubbleContainer.style.left) || 0;
              const top = parseFloat(bubbleContainer.style.top) || 0;
              twseconfig.bubble_position = { left, top };
              bubbleContainer.removeEventListener("touchmove", dragMove);
              bubbleContainer.removeEventListener("touchend", dragEnd);
              bubbleContainer.removeEventListener("touchcancel", dragEnd);
            }
            document.removeEventListener("mousemove", dragMove);
            document.removeEventListener("mouseup", dragEnd);
            updateChainBubble();
          };
          bubbleContainer.addEventListener("mousedown", dragStart);
          bubbleContainer.addEventListener("touchstart", dragStart, {
            passive: false
          });
        }
        const onVisibilityChange = () => {
          pageVisible = isVisible();
          if (onTornPda) {
            windowFocused = !document.hidden;
            updateWindowFocusClass();
          }
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        const onWindowFocus = () => {
          windowFocused = true;
          updateWindowFocusClass();
        };
        const onWindowBlur = () => {
          windowFocused = false;
          updateWindowFocusClass();
        };
        if (!onTornPda) {
          window.addEventListener("focus", onWindowFocus);
          window.addEventListener("blur", onWindowBlur);
        }
        async function copyToClipboard(text) {
          if (typeof window !== "undefined" && window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === "function") {
            try {
              await window.flutter_inappwebview.callHandler(
                "copyToClipboard",
                text
              );
              return true;
            } catch (err) {
              log$1.error("Failed to copy using Torn PDA callHandler", err);
            }
          }
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(text);
              return true;
            }
          } catch (err) {
            log$1.error("Failed to copy using clipboard API", err);
          }
          try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const success = document.execCommand("copy");
            document.body.removeChild(textarea);
            return success;
          } catch (err) {
            log$1.error("Failed to copy using fallback", err);
            return false;
          }
        }
        function injectCopyButton(id, li) {
          if (li.querySelector(".twse-copy-btn")) return;
          const atag = li.querySelector(
            "a[href^='/profiles.php']"
          );
          if (!atag) return;
          const parent = li.querySelector(".member");
          if (!parent) return;
          const copyBtn = document.createElement("button");
          copyBtn.className = "twse-copy-btn";
          copyBtn.type = "button";
          copyBtn.title = "Copy Name [ID]";
          copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        `;
          copyBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ariaMatch = atag.getAttribute("aria-label")?.match(/^View profile of (.+)$/);
            const name = ariaMatch ? ariaMatch[1].trim() : atag.textContent?.trim() || "";
            const copyText = `${name} [${id}]`;
            const success = await copyToClipboard(copyText);
            if (success) {
              copyBtn.classList.add("success");
              copyBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon-success"><polyline points="20 6 9 17 4 12"></polyline></svg>
            `;
              setTimeout(() => {
                copyBtn.classList.remove("success");
                copyBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="twse-copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              `;
              }, 1e3);
            }
          });
          parent.appendChild(copyBtn);
        }
        function extractAllMemberLis() {
          memberLis.clear();
          for (const row of getMemberRows()) {
            memberLis.set(row.id, { li: row.li, statusDiv: row.statusDiv });
            injectCopyButton(row.id, row.li);
          }
        }
        function populateCachedStatus(factionId) {
          const cached = factionCache.get(factionId);
          if (!cached) return;
          for (const [id, member] of Object.entries(cached)) {
            members.set(id, member);
          }
          log$1.info(
            `Populated war monitor cache with stored statuses for faction: ${factionId}`
          );
        }
        function sortMemberList(listElem) {
          let sortedColumn = getSortedColumn(listElem);
          if (sortedColumn.column && (sortedColumn.column !== "points" || sortedColumn.order !== "desc")) {
            everSorted = true;
          }
          if (!everSorted) {
            sortedColumn = { column: "status", order: "asc" };
          }
          if (listElem.getAttribute("data-ffscouter-active-filter") === "true") {
            ffscouterSortingDeferred = true;
            return;
          }
          if (sortedColumn.column !== "status") {
            return;
          }
          const lis = Array.from(listElem.childNodes);
          const validLis = lis.filter(
            (node) => node.nodeType === Node.ELEMENT_NODE
          );
          const sortedLis = validLis.sort((a, b) => {
            let left = a;
            let right = b;
            if (sortedColumn.order === "desc") {
              left = b;
              right = a;
            }
            const sorta = sort_by_attribute(left, right, "data-sortA", 1);
            const sortA_a = parseInt(left.getAttribute("data-sortA") || "1", 10);
            if (sorta !== 0) return sorta;
            const leftLocation = left.getAttribute("data-location") || "";
            const rightLocation = right.getAttribute("data-location") || "";
            if (leftLocation && rightLocation) {
              if (leftLocation < rightLocation) return -1;
              if (leftLocation > rightLocation) return 1;
              return 0;
            }
            if (sortA_a === 0) {
              return sort_by_attribute(left, right, "data-unexpected-at") * -1;
            }
            if (sortA_a === 1) {
              const okaysince = sort_by_attribute(left, right, "data-okay-since");
              if (okaysince === 0) {
                const est = sort_by_attribute(left, right, "data-est-value");
                if (est === 0) {
                  return sort_by_attribute(left, right, "data-player_id");
                }
                return est * -1;
              }
              return okaysince;
            }
            return sort_by_attribute(left, right, "data-until");
          });
          let sorted = true;
          for (let j = 0; j < sortedLis.length; j++) {
            if (listElem.children[j] !== sortedLis[j]) {
              sorted = false;
              break;
            }
          }
          if (!sorted) {
            const fragment = document.createDocumentFragment();
            for (const li of sortedLis) fragment.appendChild(li);
            listElem.appendChild(fragment);
          }
        }
        function setupMemberListObservers() {
          for (const obs of memberListObservers) obs.disconnect();
          memberListObservers.length = 0;
          const memberLists = getMemberLists();
          for (let i = 0; i < memberLists.length; i++) {
            const ul = memberLists[i];
            const obs = observeElement(
              ul,
              () => {
                if (_isSorting || !twseconfig.war_sorting) return;
                _isSorting = true;
                sortMemberList(ul);
                _isSorting = false;
              },
              { childList: true }
            );
            memberListObservers.push(obs);
          }
        }
        function calculateFlightTimeRemaining(li) {
          const earliestArrivalAttr = li.getAttribute("data-earliest-arrival");
          const latestArrivalAttr = li.getAttribute("data-latest-arrival");
          if (!earliestArrivalAttr && !latestArrivalAttr) return "";
          const earliestArrival = parseInt(
            earliestArrivalAttr || "",
            10
          );
          const latestArrival = parseInt(
            latestArrivalAttr || "",
            10
          );
          if (Number.isNaN(earliestArrival) && Number.isNaN(latestArrival))
            return "";
          const nowSec = getCurrentTime() / 1e3;
          if (!Number.isNaN(earliestArrival) && earliestArrival > nowSec) {
            const remaining = Math.round(earliestArrival - nowSec);
            return ` ${calc_delta(remaining, false, false)}`;
          }
          if (!Number.isNaN(latestArrival) && latestArrival > nowSec) {
            const remaining = Math.round(latestArrival - nowSec);
            return ` <${calc_delta(remaining, false, false)}`;
          }
          return " LATE";
        }
        async function getUserIdHash() {
          const key = twseconfig.apiKey;
          if (!key) return null;
          if (cachedUserIdHashKey === key) return cachedUserIdHash;
          const encoded = new TextEncoder().encode(key);
          const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
          const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
          cachedUserIdHashKey = key;
          cachedUserIdHash = hash;
          return hash;
        }
        function applyFactionData(factionId, data) {
          if (data.timestamp !== void 0) {
            const last = lastAppliedTimestamp.get(factionId) ?? 0;
            if (data.timestamp <= last) return;
            lastAppliedTimestamp.set(factionId, data.timestamp);
          }
          if (data.members) {
            const reqTime = Date.now();
            const factionMembers = {};
            for (const memberData of data.members) {
              const id = String(memberData.id);
              memberData.status.last_req_time = reqTime;
              members.set(id, memberData);
              factionMembers[id] = memberData;
            }
            factionCache.set(factionId, factionMembers);
          }
          if (data.chain) {
            activeChains.set(factionId, {
              current: data.chain.current,
              max: data.chain.max,
              timeout: data.chain.timeout,
              modifier: data.chain.modifier,
              apiReceivedAt: getCurrentTime(),
              cooldown: data.chain.cooldown || 0,
              end: data.chain.end
            });
          }
        }
        async function updateStatuses() {
          if (!running) return;
          const factionIds = getFactionIds();
          if (factionIds.length === 0) return;
          const now = Date.now();
          if (now - lastRequestTime < minTimeBetweenRequestsMs) return;
          lastRequestTime = now;
          const userIdHash = await getUserIdHash();
          for (const factionId of factionIds) {
            log$1.debug(`Fetching API status update for faction: ${factionId}`);
            const data = await tornApi.fetchFactionData(factionId);
            if (!data) continue;
            if (data.error) {
              if (tornApi.isUnrecoverableError(data.error.code)) {
                log$1.error(
                  "Torn API returned unrecoverable error. Halting war monitor polling."
                );
                running = false;
                break;
              }
              continue;
            }
            applyFactionData(factionId, data);
            if (userIdHash !== null) {
              twseClient.submit(factionId, {
                user_id_hash: userIdHash,
                torn_response: data
              });
            }
          }
        }
        const SORT_GROUP_TO_SORT_A = {
          [SortGroup.UnexpectedOkay]: "0",
          [SortGroup.ExpectedOkay]: "1",
          [SortGroup.Hospitalized]: "2",
          [SortGroup.Incoming]: "3",
          [SortGroup.Abroad]: "4",
          [SortGroup.Outgoing]: "5",
          [SortGroup.Traveling]: "6"
        };
        function applyClassification(li, statusDiv, status, classification, tornNow) {
          domWriter.setAttr(
            li,
            "data-sortA",
            SORT_GROUP_TO_SORT_A[classification.sortGroup]
          );
          const isTravelState = status.state === "Traveling" || status.state === "Abroad";
          let dataLocation = "";
          let overridden = false;
          switch (classification.sortGroup) {
            case SortGroup.Abroad: {
              const content = shorten_destination(
                status.description.split("In ")[1]
              );
              dataLocation = content;
              domWriter.setStyle(statusDiv, "--twse-content", `"${content}"`);
              overridden = true;
              break;
            }
            case SortGroup.Outgoing: {
              if (classification.route) {
                dataLocation = `► ${classification.route.to}`;
                const remaining = calculateFlightTimeRemaining(li);
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Incoming: {
              if (classification.route) {
                dataLocation = `◄ ${classification.route.from}`;
                const remaining = calculateFlightTimeRemaining(li);
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}${remaining}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Traveling: {
              if (isTravelState) {
                dataLocation = "Traveling";
                domWriter.setStyle(
                  statusDiv,
                  "--twse-content",
                  `"${dataLocation}"`
                );
                overridden = true;
              }
              break;
            }
            case SortGroup.Hospitalized: {
              const timeRemaining = Math.round(
                (status.until ?? 0) - tornNow / 1e3
              );
              if (timeRemaining > 0) {
                const timeStr = calc_delta(timeRemaining);
                domWriter.setStyle(statusDiv, "--twse-content", `"${timeStr}"`);
                overridden = true;
              }
              break;
            }
          }
          domWriter.setAttr(li, "data-location", dataLocation);
          const okaySince = classification.nextTransitionState.okaySince;
          domWriter.setAttr(
            li,
            "data-okay-since",
            okaySince === null ? "" : String(okaySince)
          );
          const unexpectedAt = classification.nextTransitionState.unexpectedSince ?? 0;
          domWriter.setAttr(li, "data-unexpected-at", String(unexpectedAt));
          domWriter.setAttr(
            statusDiv,
            STATUS_DIFFERS,
            classification.isUnexpectedHighlighted ? "true" : "false"
          );
          if (!isTravelState) {
            if (classification.sortGroup === SortGroup.Hospitalized) {
              domWriter.setAttr(
                statusDiv,
                TRAVELING,
                status.description.includes("In a") ? "true" : "false"
              );
            } else {
              domWriter.setAttr(statusDiv, TRAVELING, "false");
            }
            domWriter.setAttr(
              statusDiv,
              HIGHLIGHT,
              classification.isNearExpiry ? "true" : "false"
            );
          }
          domWriter.setAttr(
            statusDiv,
            "data-twse-overridden",
            overridden ? "true" : "false"
          );
        }
        function watch() {
          memberLis.forEach((elem, id) => {
            const li = elem.li;
            const statusDiv = elem.statusDiv;
            if (!li || !statusDiv) return;
            const member = members.get(id);
            if (!member || !running) {
              domWriter.setAttr(statusDiv, "data-twse-overridden", "false");
              return;
            }
            const status = member.status;
            domWriter.setAttr(li, "data-until", String(status.until ?? 0));
            domWriter.setAttr(li, "data-player_id", String(id));
            domWriter.setAttr(
              li,
              "data-twse-last-action-timestamp",
              String(member.last_action?.timestamp ?? 0)
            );
            const canonicalStatus = parseCanonicalStatus(statusDiv);
            const transitionState = {
              unexpectedSince: unexpectedTransitions.get(id) ?? null,
              okaySince: okaySinceTimestamps.get(id) ?? null
            };
            const browserNow = Date.now();
            const tornNow = getCurrentTime();
            const classification = classifyMember(
              status,
              canonicalStatus,
              transitionState,
              browserNow,
              tornNow,
              {
                unexpectedHighlightMs: UNEXPECTED_HIGHLIGHT_MS,
                nearExpiryThresholdSec: WarMonitorFeature.intervals.nearExpiryThresholdSec
              }
            );
            if (classification.nextTransitionState.unexpectedSince === null) {
              unexpectedTransitions.delete(id);
            } else {
              unexpectedTransitions.set(
                id,
                classification.nextTransitionState.unexpectedSince
              );
            }
            if (classification.nextTransitionState.okaySince === null) {
              okaySinceTimestamps.delete(id);
            } else {
              okaySinceTimestamps.set(
                id,
                classification.nextTransitionState.okaySince
              );
            }
            applyClassification(li, statusDiv, status, classification, tornNow);
          });
          const dirtyGroups = domWriter.flush();
          if (twseconfig.war_sorting && (dirtyGroups.has("sort") || forceSortNextTick)) {
            forceSortNextTick = false;
            _isSorting = true;
            const memberLists = getMemberLists();
            for (let i = 0; i < memberLists.length; i++) {
              sortMemberList(memberLists[i]);
            }
            _isSorting = false;
          }
          if (ffscouterSortingDeferred) {
            const memberLists = getMemberLists();
            let activeFilterFound = false;
            for (let i = 0; i < memberLists.length; i++) {
              if (memberLists[i].getAttribute("data-ffscouter-active-filter") === "true") {
                activeFilterFound = true;
                break;
              }
            }
            if (!activeFilterFound) {
              ffscouterSortingDeferred = false;
              forceSortNextTick = true;
            }
          }
          for (const [id, ref] of memberLis) {
            if (!ref.li.isConnected) {
              memberLis.delete(id);
            }
          }
          updateChainBubble();
        }
        function updateChainBubble() {
          if (!bubbleContainer || isDragging) return;
          if (!foundWar || activeChains.size === 0) {
            bubbleContainer.classList.add("hidden");
            lastChainHtml = "";
            return;
          }
          const bodyContainer = bubbleContainer.querySelector(".twse-chain-body");
          if (!bodyContainer) return;
          let html = "";
          const nowSec = getCurrentTime() / 1e3;
          activeChains.forEach((chain) => {
            let formattedTime = "";
            let timerClass = "okay";
            let countClass = "";
            if (chain.cooldown > 0) {
              const remainingCooldown = Math.max(
                0,
                chain.cooldown - nowSec
              );
              formattedTime = formatChainCooldown(remainingCooldown);
              timerClass = "cooldown";
              countClass = "cooldown";
            } else if (chain.current === 0 || !chain.end || chain.end === 0) {
              formattedTime = "-:--";
              timerClass = "okay";
            } else {
              const remaining = chain.end - nowSec;
              if (remaining < 0) {
                formattedTime = formatChainTimeout(remaining);
                timerClass = "negative";
              } else if (remaining < 60) {
                formattedTime = formatChainTimeout(remaining);
                timerClass = "urgent";
              } else {
                formattedTime = formatChainTimeout(remaining);
              }
            }
            html += `
            <div class="twse-chain-row">
              <div class="twse-chain-stats">
                <span class="twse-chain-count ${countClass}">${chain.current}/${chain.max}</span>
                <span class="twse-chain-mult">${chain.modifier.toFixed(2)}x</span>
                <span class="twse-chain-timer ${timerClass}">${formattedTime}</span>
              </div>
            </div>
          `;
          });
          if (lastChainHtml !== html) {
            bodyContainer.innerHTML = html;
            lastChainHtml = html;
          }
          bubbleContainer.classList.remove("hidden");
        }
        let descriptionsObserver = null;
        let innerDescriptionsObserver = null;
        const initWarMonitoring = (descriptions) => {
          foundWar = false;
          log$1.info("Descriptions container detected. Starting observation.");
          let injectedToggle = false;
          const injectSortingToggle = (descEl) => {
            if (injectedToggle) return;
            if (descEl.querySelector("#twse-war-sort-checkbox")) {
              injectedToggle = true;
              return;
            }
            const graphContainer = descEl.querySelector('[class*="graphIcon"]');
            if (!graphContainer || !graphContainer.parentNode) return;
            const parent = graphContainer.parentNode;
            parent.style.position = "relative";
            const computedStyle = window.getComputedStyle(graphContainer);
            const toggleContainer = document.createElement("div");
            toggleContainer.className = "twse-sort-toggle-container";
            toggleContainer.style.top = computedStyle.top && computedStyle.top !== "auto" ? computedStyle.top : "10px";
            toggleContainer.innerHTML = `
            <label class="twse-sort-toggle-label">
              <input type="checkbox" id="twse-war-sort-checkbox" class="twse-sort-toggle-checkbox" ${twseconfig.war_sorting ? "checked" : ""} />
              TWSE Sort
            </label>
          `;
            graphContainer.parentNode.insertBefore(
              toggleContainer,
              graphContainer
            );
            log$1.info(
              "Successfully injected war sorting toggle checkbox before Graph link."
            );
            injectedToggle = true;
            const checkbox = toggleContainer.querySelector(
              "#twse-war-sort-checkbox"
            );
            if (checkbox) {
              checkbox.addEventListener("change", (e) => {
                const isChecked = e.target.checked;
                log$1.info(`War sorting configuration changed: ${isChecked}`);
                twseconfig.war_sorting = isChecked;
              });
            }
          };
          injectSortingToggle(descriptions);
          innerDescriptionsObserver = observeElement(descriptions, () => {
            if (!injectedToggle) {
              injectSortingToggle(descriptions);
            }
            if (!foundWar && descriptions.querySelector(".faction-war")) {
              foundWar = true;
              extractAllMemberLis();
              setupMemberListObservers();
              const ids = getFactionIds();
              ids.forEach(populateCachedStatus);
              updateStatuses();
            }
            if (foundWar && injectedToggle) {
              log$1.info(
                "Active war detected and toggle injected. Disconnecting innerDescriptionsObserver."
              );
              innerDescriptionsObserver?.disconnect();
              innerDescriptionsObserver = null;
            }
          });
          if (descriptions.querySelector(".faction-war")) {
            foundWar = true;
            extractAllMemberLis();
            setupMemberListObservers();
            const ids = getFactionIds();
            ids.forEach(populateCachedStatus);
            updateStatuses();
            if (injectedToggle) {
              log$1.info(
                "Active war detected at start and toggle injected. Disconnecting innerDescriptionsObserver."
              );
              innerDescriptionsObserver?.disconnect();
              innerDescriptionsObserver = null;
            }
          }
        };
        const factWarList = await waitForElement("#faction_war_list_id");
        if (!active) return;
        if (factWarList) {
          descriptionsObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (node instanceof HTMLElement && node.classList.contains("descriptions")) {
                  log$1.info("Observed descriptions container added to DOM");
                  initWarMonitoring(node);
                }
              }
            }
          });
          descriptionsObserver.observe(factWarList, { childList: true });
          const existingDescriptions = factWarList.querySelector(".descriptions");
          if (existingDescriptions) {
            log$1.info("Found existing descriptions container");
            initWarMonitoring(existingDescriptions);
          }
        }
        const pollingInterval = setInterval(() => {
          if (running && foundWar) {
            updateStatuses();
          }
        }, WarMonitorFeature.intervals.poll);
        const watchInterval = setInterval(() => {
          pageVisible = isVisible();
          if (foundWar && running && pageVisible) {
            watch();
          }
        }, WarMonitorFeature.intervals.watch);
        let cacheTimer = null;
        const queryCache = async () => {
          if (cacheTimer) {
            clearTimeout(cacheTimer);
          }
          cacheTimer = null;
          try {
            if (!running || !foundWar) return;
            for (const factionId of getFactionIds()) {
              const data = await twseClient.fetchLatest(factionId);
              if (data) applyFactionData(factionId, data);
            }
          } finally {
            if (!cacheTimer) {
              cacheTimer = setTimeout(queryCache, 1e3);
            }
          }
        };
        queryCache();
        stopMonitor = () => {
          active = false;
          running = false;
          clearInterval(pollingInterval);
          clearInterval(watchInterval);
          if (cacheTimer) {
            clearTimeout(cacheTimer);
            cacheTimer = null;
          }
          if (descriptionsObserver) {
            descriptionsObserver.disconnect();
          }
          if (innerDescriptionsObserver) {
            innerDescriptionsObserver.disconnect();
          }
          for (const obs of memberListObservers) obs.disconnect();
          memberListObservers.length = 0;
          window.removeEventListener("twse-config-updated", onConfigUpdated);
          window.removeEventListener("twse-clear-cache", onClearCache);
          window.removeEventListener("resize", clampToScreen);
          document.removeEventListener("visibilitychange", onVisibilityChange);
          if (!onTornPda) {
            window.removeEventListener("focus", onWindowFocus);
            window.removeEventListener("blur", onWindowBlur);
          }
          if (bubbleContainer) {
            bubbleContainer.remove();
            bubbleContainer = null;
          }
          document.querySelector(".twse-sort-toggle-container")?.remove();
        };
      };
      const handleNavigation = () => {
        const shouldRun = shouldRunMonitor();
        if (shouldRun) {
          if (stopMonitor) {
            stopMonitor();
            stopMonitor = null;
          }
          startMonitor();
        } else if (!shouldRun && active) {
          if (stopMonitor) {
            stopMonitor();
            stopMonitor = null;
          }
        }
      };
      on_navigation(handleNavigation);
      if (shouldRunMonitor()) {
        startMonitor();
      }
      window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
    }
  };
  const __vite_glob_0_2 = Object.freeze( Object.defineProperty({
    __proto__: null,
    default: WarMonitorFeature
  }, Symbol.toStringTag, { value: "Module" }));
  const modules = Object.assign({
    "./key-manager/index.ts": __vite_glob_0_0,
    "./settings/index.ts": __vite_glob_0_1,
    "./war-monitor/index.ts": __vite_glob_0_2
  });
  const Features = Object.values(modules).map((mod) => mod.default).filter((feat) => !!feat && "name" in feat);
  const log = logger.child("boot");
  const INJECTION_KEY = "data-twse-injected";
  async function boot() {
    if (document.documentElement.hasAttribute(INJECTION_KEY)) {
      log.info("Script already injected, skipping boot.");
      return;
    }
    document.documentElement.setAttribute(INJECTION_KEY, "true");
    log.info("Initializing Torn War Stuff Enhanced...");
    for (const feature of Features) {
      try {
        const shouldRun = await feature.shouldRun();
        if (!shouldRun) {
          continue;
        }
        log.debug(`Booting feature: '${feature.name}'`);
        if (feature.executionTime === StartTime.DocumentStart) {
          feature.run();
        } else if (feature.executionTime === StartTime.DocumentBody) {
          if (document.body) {
            feature.run();
          } else {
            let booted = false;
            const trigger = () => {
              if (booted) return;
              booted = true;
              bodyObserver.disconnect();
              feature.run();
            };
            const bodyObserver = new MutationObserver(() => {
              if (document.body) {
                trigger();
              }
            });
            bodyObserver.observe(document.documentElement, {
              childList: true
            });
            document.addEventListener("DOMContentLoaded", trigger);
          }
        } else {
          if (document.readyState === "complete" || document.readyState === "interactive") {
            feature.run();
          } else {
            document.addEventListener("DOMContentLoaded", () => {
              feature.run();
            });
          }
        }
      } catch (e) {
        log.error(`Error running feature '${feature.name}':`, e);
      }
    }
  }
  boot();

})();