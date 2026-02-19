(function () {
  "use strict";

  console.log("[StatusMini] build 2026-02-19_05 loaded");

  window.PortalWidgets = window.PortalWidgets || {};
  const DEFAULTS = { timeoutMs: 10000 };

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cfg() {
    try {
      const env = window.PortalApp && window.PortalApp.Env;
      if (env && typeof env.getRemoteConfig === "function") {
        const c = env.getRemoteConfig();
        return {
          webAppUrl: String(c?.webAppUrl || "").trim(),
          token: String(c?.token || "").trim()
        };
      }
    } catch (_) {}
    return {
      webAppUrl: String(window.PORTALSTATE_WEBAPP_URL || "").trim(),
      token: String(window.PORTALSTATE_TOKEN || "").trim()
    };
  }

  function jsonp(url, timeoutMs = DEFAULTS.timeoutMs) {
    return new Promise((resolve, reject) => {
      const cbName = "__statusmini_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      const script = document.createElement("script");
      let done = false;

      function cleanup() {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      }

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("JSONP timeout"));
      }, timeoutMs);

      window[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      const join = url.includes("?") ? "&" : "?";
      script.src = url + join + "callback=" + encodeURIComponent(cbName);

      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error("JSONP load error"));
      };

      document.body.appendChild(script);
    });
  }

  function isDown(st) {
    return String(st || "").trim().toLowerCase() === "down";
  }
  function isReduced(st) {
    return String(st || "").trim().toLowerCase() === "reduced";
  }
  function isComplete(item) {
    const ws = String(item?.workOrderStatus || "").trim().toLowerCase();
    if (ws === "complete" || ws === "completed") return true;

    const subj = String(item?.subject || "").toLowerCase();
    if (subj.includes("work order is completed")) return true;

    return !!String(item?.resolvedAt || "").trim();
  }

  function parseDateMaybe(v) {
    const s = String(v || "").trim();
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function loadStatus() {
    const c = cfg();
    if (!c.webAppUrl || !c.token) {
      return Promise.reject(new Error("Missing web app URL/token (check js/config.js load order)."));
    }

    const endpoint =
      c.webAppUrl +
      (c.webAppUrl.includes("?") ? "&" : "?") +
      "action=status_get" +
      "&token=" + encodeURIComponent(c.token) +
      "&_=" + Date.now();

    return jsonp(endpoint, DEFAULTS.timeoutMs);
  }

  function pickAssetDesc(item) {
    return String(item?.assetDescription || "").trim();
  }

  function pickProblemDesc(item) {
    return String(item?.workOrderDescription || item?.notes || item?.subject || "").trim();
  }

  function pickAssetId(item) {
    const assetId = String(item?.assetId || "").trim();
    const eqId = String(item?.equipmentId || "").trim();
    if (assetId) return assetId;
    if (eqId) return "EQ " + eqId;
    return "—";
  }

  function itemClass(item) {
    const st = String(item?.operationalStatus || "").trim();
    if (isComplete(item)) return "smini-item is-complete";
    if (isDown(st)) return "smini-item is-down";
    if (isReduced(st)) return "smini-item is-reduced";
    return "smini-item";
  }

  function sortNewestFirst(a, b) {
    const at = parseDateMaybe(a?.escalatedAt) || parseDateMaybe(a?.emailReceivedAt);
    const bt = parseDateMaybe(b?.escalatedAt) || parseDateMaybe(b?.emailReceivedAt);
    return bt - at;
  }

  function normalizeCat(raw) {
    const c = String(raw || "").trim().toLowerCase();
    if (c === "down") return "down";
    if (c === "reduced") return "reduced";
    if (c === "complete" || c === "completed") return "completed";
    return "";
  }

  function setTextIfExists(root, selector, text) {
    const el = root.querySelector(selector);
    if (el) el.textContent = String(text);
  }

  function renderCounts(root, items) {
    let down = 0, reduced = 0, completed = 0;

    for (const it of items) {
      if (isComplete(it)) { completed++; continue; }
      if (isDown(it?.operationalStatus)) down++;
      if (isReduced(it?.operationalStatus)) reduced++;
    }

    // SVG ids
    setTextIfExists(root, "#smDownCount", down);
    setTextIfExists(root, "#smReducedCount", reduced);
    setTextIfExists(root, "#smCompleteCount", completed);

    // legacy ids (if any remain)
    setTextIfExists(root, "#sminiDownCount", down);
    setTextIfExists(root, "#sminiReducedCount", reduced);
    setTextIfExists(root, "#sminiCompleteCount", completed);
  }

  function filterItems(items, cat) {
    if (cat === "down") {
      return items.filter(it => !isComplete(it) && isDown(it?.operationalStatus)).sort(sortNewestFirst);
    }
    if (cat === "reduced") {
      return items.filter(it => !isComplete(it) && isReduced(it?.operationalStatus)).sort(sortNewestFirst);
    }
    if (cat === "completed") {
      return items.filter(it => isComplete(it)).sort(sortNewestFirst);
    }
    return [];
  }

  function anySelected(state) {
    const c = state?.cats || {};
    return !!(c.down || c.reduced || c.completed);
  }

  function renderList(root, items, state) {
    const wrap = root.querySelector("#sminiListWrap");
    const list = root.querySelector("#sminiList");
    if (!wrap || !list) return;

    if (!anySelected(state)) {
      wrap.classList.remove("is-open");
      list.innerHTML = "";
      return;
    }

    wrap.classList.add("is-open");

    const order = ["down", "reduced", "completed"];
    let html = "";

    for (const cat of order) {
      if (!state.cats[cat]) continue;

      const filtered = filterItems(items, cat);
      if (!filtered.length) {
        const label = cat === "down" ? "Down" : (cat === "reduced" ? "Reduced" : "Completed");
        html += `<div class="smini-empty">No ${esc(label)} items.</div>`;
        continue;
      }

      for (const it of filtered) {
        const wo = String(it?.workOrderNumber || "").trim() || "—";
        const assetId = pickAssetId(it);
        const assetDesc = pickAssetDesc(it) || "—";
        const problem = pickProblemDesc(it) || "—";

        const line1 = `WO ${wo} • ${assetId} • ${assetDesc}`;

        html += `
          <div class="${esc(itemClass(it))}">
            <div class="smini-line1" title="${esc(line1)}">
              <span class="smini-wo">WO ${esc(wo)}</span>
              <span class="smini-sep">•</span>
              <span class="smini-assetId">${esc(assetId)}</span>
              <span class="smini-sep">•</span>
              <span class="smini-assetDesc">${esc(assetDesc)}</span>
            </div>
            <div class="smini-line2" title="${esc(problem)}">${esc(problem)}</div>
          </div>`;
      }
    }

    list.innerHTML = html;
  }

  function setActive(root, state) {
    root.querySelectorAll("#smGlyph .sm-shape[data-key]").forEach(g => {
      const key = normalizeCat(g.getAttribute("data-key"));
      if (!key) return;
      const on = !!state.cats[key];
      g.classList.toggle("is-selected", on);
      g.setAttribute("aria-pressed", on ? "true" : "false");
    });

    root.querySelectorAll(".smini-badge[data-cat]").forEach(b => {
      const key = normalizeCat(b.getAttribute("data-cat"));
      if (!key) return;
      const on = !!state.cats[key];
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function toggle(root, state, cat) {
    const key = normalizeCat(cat);
    if (!key) return;
    state.cats[key] = !state.cats[key];
    setActive(root, state);
    renderList(root, state.items, state);
  }

  function wire(root, state) {
    if (state.__wired) return;
    state.__wired = true;

    const refreshBtn = root.querySelector("#sminiRefresh");
    if (refreshBtn) refreshBtn.addEventListener("click", () => refresh(root, state));

    // Bind SVG shapes directly (SVG closest() is flaky on some mobile builds)
    root.querySelectorAll("#smGlyph .sm-shape[data-key]").forEach(g => {
      const key = normalizeCat(g.getAttribute("data-key"));
      if (!key) return;

      g.addEventListener("click", () => toggle(root, state, key));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(root, state, key);
        }
      });
    });

    // Legacy badge clicks (if they exist)
    root.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".smini-badge[data-cat]") : null;
      if (!btn) return;
      toggle(root, state, btn.getAttribute("data-cat"));
    });
  }

  async function refresh(root, state) {
    const list = root.querySelector("#sminiList");
    if (list && anySelected(state)) list.innerHTML = `<div class="smini-empty">Loading…</div>`;

    try {
      const data = await loadStatus();
      if (!data || data.ok !== true) throw new Error(String(data?.error || "Status fetch failed"));

      const items = Array.isArray(data.items) ? data.items.slice() : [];
      items.sort(sortNewestFirst);

      state.items = items;
      renderCounts(root, state.items);
      renderList(root, state.items, state);
    } catch (err) {
      if (anySelected(state)) {
        const wrap = root.querySelector("#sminiListWrap");
        const listEl = root.querySelector("#sminiList");
        if (wrap && listEl) {
          wrap.classList.add("is-open");
          listEl.innerHTML = `<div class="smini-empty">Status fetch failed: ${esc(err?.message || String(err))}</div>`;
        }
      }
      console.warn("[StatusMini] refresh failed:", err);
    }
  }

  function init(rootId) {
    const root = (typeof rootId === "string") ? document.getElementById(rootId) : rootId;
    if (!root) return;

    if (root.dataset && root.dataset.sminiInit === "1") return;
    if (root.dataset) root.dataset.sminiInit = "1";

    const state = {
      items: [],
      cats: { down: false, reduced: false, completed: false },
      __wired: false
    };

    wire(root, state);
    setActive(root, state);
    refresh(root, state);
  }

  // Auto-init safety net: if app.js order/caching prevents init, we still boot.
  function autoInit() {
    const glyph = document.getElementById("smGlyph");
    if (!glyph) return;

    let p = glyph.parentElement;
    while (p && p !== document.body) {
      if (p.querySelector("#sminiListWrap") && p.querySelector("#sminiList")) {
        init(p);
        return;
      }
      p = p.parentElement;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  } else {
    autoInit();
  }

  window.PortalWidgets.StatusMini = { init };
})();
