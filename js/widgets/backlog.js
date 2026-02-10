// js/widgets/backlog.js
// Pulls backlog items from the GAS web app (action=backlog) via JSONP
// Renders Task + Description into #backlogList

(function () {
  "use strict";

  const HOST_ID = "backlogList";
  const LIMIT = 50;
  const TIMEOUT_MS = 10000;

  function el(id) { return document.getElementById(id); }

  function setMsg(text) {
    const host = el(HOST_ID);
    if (!host) return;
    host.innerHTML = `<div class="backlogMsg">${escapeHtml(text)}</div>`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getConfig() {
    // Try globals first, then CONFIG object, then localStorage.
    const candidates = [
      { url: "PORTALSTATE_WEBAPP_URL", token: "PORTALSTATE_TOKEN" },
      { url: "GSCRIPT_WEBAPP_URL",     token: "GSCRIPT_TOKEN" },
      { url: "WEBAPP_URL",             token: "TOKEN" },

      // common “human” names people use in quick hacks
      { url: "portalStateUrl",         token: "portalStateToken" },
      { url: "portalStateWebAppUrl",   token: "portalStateSecret" }
    ];

    for (const c of candidates) {
      const url =
        window[c.url] ||
        (window.CONFIG && window.CONFIG[c.url]) ||
        localStorage.getItem(c.url) ||
        localStorage.getItem(c.url.toUpperCase()) ||
        "";

      const token =
        window[c.token] ||
        (window.CONFIG && window.CONFIG[c.token]) ||
        localStorage.getItem(c.token) ||
        localStorage.getItem(c.token.toUpperCase()) ||
        "";

      if (url && token) return { url, token };
    }

    return { url: "", token: "" };
  }

  function jsonp(baseUrl) {
    return new Promise((resolve, reject) => {
      const cbName = "__backlog_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
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
      }, TIMEOUT_MS);

      window[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      const join = baseUrl.includes("?") ? "&" : "?";
      script.src = baseUrl + join + "callback=" + encodeURIComponent(cbName);

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

  function render(items) {
    const host = el(HOST_ID);
    if (!host) return;

    if (!items || !items.length) {
      host.innerHTML = `<div class="backlogMsg">No backlog items.</div>`;
      return;
    }

    host.innerHTML = "";

    for (const it of items) {
      const task = (it && it.task) ? String(it.task) : "";
      const desc = (it && it.description) ? String(it.description) : "";

      const row = document.createElement("div");
      row.className = "backlogRow";

      const left = document.createElement("div");
      left.className = "backlogTask";
      left.textContent = task;

      const right = document.createElement("div");
      right.className = "backlogDesc";
      right.textContent = desc;

      row.appendChild(left);
      row.appendChild(right);
      host.appendChild(row);
    }
  }

  async function loadBacklog() {
    const host = el(HOST_ID);
    if (!host) return;

    host.innerHTML = `<div class="backlogMsg">Loading backlog…</div>`;

    const cfg = getConfig();
    if (!cfg.url || !cfg.token) {
      console.warn("[Backlog] Missing web app URL/token. Set window.PORTALSTATE_WEBAPP_URL + window.PORTALSTATE_TOKEN or store them in localStorage with those keys.");
      setMsg("Backlog config missing (web app URL/token not found).");
      return;
    }

    try {
      // GAS endpoint must support: ?action=backlog&token=...&limit=...&callback=...
      const url =
        cfg.url +
        "?action=backlog" +
        "&token=" + encodeURIComponent(cfg.token) +
        "&limit=" + encodeURIComponent(String(LIMIT));

      const res = await jsonp(url);

      if (!res || res.ok !== true) {
        throw new Error(res && res.error ? res.error : "Bad backlog response");
      }

      render(res.items || []);
    } catch (err) {
      console.error("[Backlog] Load failed:", err);
      setMsg("Backlog unavailable.");
    }
  }

  // Run after DOM is ready (defer scripts run after parsing anyway, but this avoids race conditions)
  window.addEventListener("DOMContentLoaded", loadBacklog);

  // Optional: expose a manual refresh hook for later
  window.BacklogWidget = { loadBacklog };
})();
