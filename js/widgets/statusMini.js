(function () {
  "use strict";

  console.log("[StatusMini] build 2026-02-19_02 loaded");

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
    // "What is actually wrong" tends to live here.
    // (Fallbacks keep the UI from going blank if upstream changes.)
    return String(
      item?.workOrderDescription ||
      item?.notes ||
      item?.subject ||
      ""
    ).trim();
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

  function renderCounts(root, items) {
    let down = 0, reduced = 0, complete = 0;

    for (const it of items) {
      if (isComplete(it)) { complete++; continue; }
      if (isDown(it?.operationalStatus)) down++;
      if (isReduced(it?.operationalStatus)) reduced++;
    }

    const downEl = root.querySelector("#sminiDownCount");
    const redEl = root.querySelector("#sminiReducedCount");
    const compEl = root.querySelector("#sminiCompleteCount");

    if (downEl) downEl.textContent = String(down);
    if (redEl) redEl.textContent = String(reduced);
    if (compEl) compEl.textContent = String(complete);
  }

  function filterItems(items, cat) {
    if (cat === "down") {
      return items.filter(it => !isComplete(it) && isDown(it?.operationalStatus)).sort(sortNewestFirst);
    }
    if (cat === "reduced") {
      return items.filter(it => !isComplete(it) && isReduced(it?.operationalStatus)).sort(sortNewestFirst);
    }
    if (cat === "complete") {
      return items.filter(it => isComplete(it)).sort(sortNewestFirst);
    }
    return [];
  }

  function anySelected(state) {
    return !!(state?.cats?.down || state?.cats?.reduced || state?.cats?.complete);
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

    const order = ["down", "reduced", "complete"]; // fixed stacking order
    let html = "";

    for (const cat of order) {
      if (!state.cats[cat]) continue;

      const filtered = filterItems(items, cat);
      if (!filtered.length) {
        const label = cat === "down" ? "Down" : (cat === "reduced" ? "Reduced" : "Completed");
        html += `<div class="smini-empty">No ${esc(label)} items.</div>`;
        continue;
      }

      for (let i = 0; i < filtered.length; i++) {
        const it = filtered[i];
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
    const btns = Array.from(root.querySelectorAll(".smini-badge[data-cat]"));
    btns.forEach(b => {
      const c = String(b.getAttribute("data-cat") || "");
      const is = !!state?.cats?.[c];
      b.classList.toggle("is-active", is);
      b.setAttribute("aria-pressed", is ? "true" : "false");
    });
  }

  function wire(root, state) {
    if (state.__wired) return;
    state.__wired = true;

    const refreshBtn = root.querySelector("#sminiRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => refresh(root, state));
    }

    root.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".smini-badge[data-cat]") : null;
      if (!btn) return;

      const cat = String(btn.getAttribute("data-cat") || "");
      if (!cat) return;

      state.cats[cat] = !state.cats[cat];
      setActive(root, state);
      renderList(root, state.items, state);
    });
  }

  async function refresh(root, state) {
    const list = root.querySelector("#sminiList");
    if (list && anySelected(state)) list.innerHTML = `<div class="smini-empty">Loading…</div>`;

    try {
      const data = await loadStatus();
      if (!data || data.ok !== true) {
        throw new Error(String(data?.error || "Status fetch failed"));
      }

      const items = Array.isArray(data.items) ? data.items.slice() : [];
      // Keep a stable order for list rendering.
      items.sort(sortNewestFirst);

      state.items = items;
      renderCounts(root, state.items);
      renderList(root, state.items, state);
    } catch (err) {
      // If the widget is collapsed, fail quietly (counts stay as-is).
      if (anySelected(state)) {
        const wrap = root.querySelector("#sminiListWrap");
        const list = root.querySelector("#sminiList");
        if (wrap && list) {
          wrap.classList.add("is-open");
          list.innerHTML = `<div class="smini-empty">Status fetch failed: ${esc(err?.message || String(err))}</div>`;
        }
      }
      console.warn("[StatusMini] refresh failed:", err);
    }
  }

  function init(rootId) {
    const root = (typeof rootId === "string") ? document.getElementById(rootId) : rootId;
    if (!root) return;

    const state = { items: [], cats: { down: false, reduced: false, complete: false }, __wired: false };
    wire(root, state);
    setActive(root, state);
    refresh(root, state);
  }

  window.PortalWidgets.StatusMini = { init };
})();
