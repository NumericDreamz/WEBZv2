// js/widgets/backlog.js
(function () {
  "use strict";

  const DEFAULTS = { limit: 50, timeoutMs: 10000 };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setMsg(host, msg) {
    if (!host) return;
    host.innerHTML = `<div class="backlogMsg">${escapeHtml(msg)}</div>`;
  }

  function getConfig() {
    const webAppUrl = (window.PORTALSTATE_WEBAPP_URL || "").toString().trim();
    const token = (window.PORTALSTATE_TOKEN || "").toString().trim();
    return { webAppUrl, token };
  }

  function jsonp(url, timeoutMs = DEFAULTS.timeoutMs) {
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

  function pickTask(item) {
    return (
      item?.task ??
      item?.Task ??
      item?.["Task ID"] ??
      item?.["TaskId"] ??
      item?.["Task Number"] ??
      item?.["Task #"] ??
      item?.id ??
      ""
    );
  }

  function pickDesc(item) {
    return (
      item?.description ??
      item?.Description ??
      item?.Desc ??
      item?.["Task Description"] ??
      ""
    );
  }

  function normalizeValue(v) {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function buildDetailsHtml(item, columns) {
    const raw = (item && typeof item === "object") ? item : {};
    const task = pickTask(raw);
    const desc = pickDesc(raw);

    const ignore = new Set([
      "task", "description",
      "Task", "Description", "Desc",
      "Task ID", "TaskId", "Task Number", "Task #",
      "id"
    ]);

    // If server sent column headers, use them for ordering.
    let keys = Array.isArray(columns) && columns.length
      ? columns.map(c => String(c || "").trim()).filter(Boolean)
      : Object.keys(raw);

    // Remove the primary fields from the details list
    keys = keys.filter(k => !ignore.has(k));

    if (!keys.length) {
      return `<div class="backlogMsg">No additional fields for this row.</div>`;
    }

    let html = `<div class="backlogCard">`;

    for (const k of keys) {
      const val = normalizeValue(raw[k]);
      const isEmpty = !val.trim();

      html += `
        <div class="backlogField">
          <div class="backlogLabel" title="${escapeHtml(k)}">${escapeHtml(k)}</div>
          <div class="backlogValue ${isEmpty ? "is-empty" : ""}">${escapeHtml(isEmpty ? "—" : val)}</div>
        </div>
      `;
    }

    // If for some reason task/desc weren't part of headers and you still want them shown inside the card,
    // uncomment these:
    // html += `
    //   <div class="backlogField">
    //     <div class="backlogLabel">Task</div><div class="backlogValue">${escapeHtml(String(task))}</div>
    //   </div>
    //   <div class="backlogField">
    //     <div class="backlogLabel">Description</div><div class="backlogValue">${escapeHtml(String(desc))}</div>
    //   </div>
    // `;

    html += `</div>`;
    return html;
  }

  function render(host, items, columns) {
    if (!host) return;

    if (!items || !items.length) {
      setMsg(host, "No backlog items.");
      return;
    }

    host.innerHTML = "";

    items.forEach((item, idx) => {
      const task = String(pickTask(item) ?? "");
      const desc = String(pickDesc(item) ?? "");

      const row = document.createElement("div");
      row.className = "backlogRow";
      row.dataset.idx = String(idx);

      row.innerHTML = `
        <div class="backlogRowTop">
          <div class="backlogTask">${escapeHtml(task)}</div>
          <div class="backlogDesc">${escapeHtml(desc)}</div>
          <button class="backlogToggle" type="button" aria-expanded="false" aria-label="Expand backlog item">+</button>
        </div>
        <div class="backlogDetails">
          ${buildDetailsHtml(item, columns)}
        </div>
      `;

      host.appendChild(row);
    });

    // Event delegation for toggles
    host.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest(".backlogToggle") : null;
      if (!btn) return;

      const row = btn.closest(".backlogRow");
      if (!row) return;

      const isExpanded = row.classList.toggle("is-expanded");
      btn.textContent = isExpanded ? "−" : "+";
      btn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }, { once: true }); // attach once per render call
  }

  async function load(hostId, options = {}) {
    const host = $(hostId);
    if (!host) return;

    setMsg(host, "Loading backlog…");

    const cfg = getConfig();
    if (!cfg.webAppUrl || !cfg.token) {
      setMsg(host, "Backlog config missing (web app URL/token not found).");
      console.warn("[Backlog] Missing PORTALSTATE_WEBAPP_URL / PORTALSTATE_TOKEN.");
      return;
    }

    const limit = Number.isFinite(options.limit) ? options.limit : DEFAULTS.limit;

    try {
      const endpoint =
        cfg.webAppUrl +
        (cfg.webAppUrl.includes("?") ? "&" : "?") +
        "action=backlog" +
        "&token=" + encodeURIComponent(cfg.token) +
        "&limit=" + encodeURIComponent(String(limit)) +
        "&_=" + Date.now();

      const res = await jsonp(endpoint, DEFAULTS.timeoutMs);

      if (!res || res.ok !== true) {
        throw new Error(res && res.error ? res.error : "Bad backlog response");
      }

      const items = Array.isArray(res.items) ? res.items : [];
      const columns = Array.isArray(res.columns) ? res.columns : null;

      render(host, items, columns);
    } catch (err) {
      console.error("[Backlog] Load failed:", err);
      setMsg(host, "Backlog unavailable.");
    }
  }

  window.PortalWidgets = window.PortalWidgets || {};
  window.PortalWidgets.Backlog = {
    init: (hostId, options) => load(hostId, options)
  };
})();