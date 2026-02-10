// js/widgets/backlog.js
(function () {
  "use strict";

  const DEFAULTS = { limit: 50, timeoutMs: 10000 };
  const STATUS_KEY = "backlog_status_map_v1";

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

  function getStore() {
    return window.PortalApp && window.PortalApp.Storage ? window.PortalApp.Storage : null;
  }

  function loadStatusMap() {
    const store = getStore();
    if (store && typeof store.load === "function") {
      const m = store.load(STATUS_KEY);
      if (m && typeof m === "object") return { ...m };
      return {};
    }
    // Fallback (shouldn't happen in your app, but prevents total failure)
    try {
      const raw = localStorage.getItem(STATUS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    } catch {
      return {};
    }
  }

  function saveStatusMap(map) {
    const store = getStore();
    if (store && typeof store.save === "function") {
      store.save(STATUS_KEY, map);
      return;
    }
    // Fallback only if Storage is missing
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(map || {})); } catch (_) {}
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
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  const STATUS_OPTIONS = [
    { value: "", label: "(none)" },
    { value: "awaiting_parts", label: "Awaiting Parts" },
    { value: "on_order", label: "On Order" },
    { value: "scheduled", label: "Scheduled" },
    { value: "complete", label: "Complete" }
  ];

  const STATUS_CLASS_LIST = [
    "status-awaiting_parts",
    "status-on_order",
    "status-scheduled",
    "status-complete"
  ];

  function pillFor(status) {
    if (status === "awaiting_parts") return { cls: "backlogStatus-awaiting_parts", text: "Awaiting Parts" };
    if (status === "on_order") return { cls: "backlogStatus-on_order", text: "On Order" };
    if (status === "scheduled") return { cls: "backlogStatus-scheduled", text: "Scheduled" };
    // Complete = highlight row (no pill required per your spec)
    return null;
  }

  function applyStatusToRow(rowEl, status) {
    if (!rowEl) return;

    // Clear old row status classes
    for (const c of STATUS_CLASS_LIST) rowEl.classList.remove(c);

    // Apply new
    if (status) rowEl.classList.add("status-" + status);

    // Pill slot (collapsed view)
    const slot = rowEl.querySelector(".backlogStatusSlot");
    if (slot) {
      const p = pillFor(status);
      if (p) {
        slot.innerHTML = `<div class="backlogStatusPill ${p.cls}">${escapeHtml(p.text)}</div>`;
      } else {
        slot.innerHTML = "";
      }
    }
  }

  function buildDetailsHtml(item, columns) {
    const raw = (item && typeof item === "object") ? item : {};
    const ignore = new Set([
      "task","description","Task","Description","Desc",
      "Task ID","TaskId","Task Number","Task #","id"
    ]);

    let keys = Array.isArray(columns) && columns.length
      ? columns.map(c => String(c || "").trim()).filter(Boolean)
      : Object.keys(raw);

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
    html += `</div>`;
    return html;
  }

  function render(host, items, columns, statusMap) {
    if (!host) return;

    if (!items || !items.length) {
      setMsg(host, "No backlog items.");
      return;
    }

    host.innerHTML = "";

    items.forEach((item, idx) => {
      const taskRaw = String(pickTask(item) ?? "").trim();
      const desc = String(pickDesc(item) ?? "").trim();

      // Use Task as the key. If somehow blank, fall back to row index.
      const taskKey = taskRaw || ("row_" + idx);

      const status = (statusMap && typeof statusMap === "object") ? (statusMap[taskKey] || "") : "";

      const row = document.createElement("div");
      row.className = "backlogRow";
      row.dataset.taskKey = taskKey;

      // Build dropdown options
      const optionsHtml = STATUS_OPTIONS.map(o => {
        const sel = (o.value === status) ? "selected" : "";
        return `<option value="${escapeHtml(o.value)}" ${sel}>${escapeHtml(o.label)}</option>`;
      }).join("");

      row.innerHTML = `
        <div class="backlogRowTop">
          <div class="backlogTask">${escapeHtml(taskRaw)}</div>
          <div class="backlogDesc">${escapeHtml(desc)}</div>
          <div class="backlogStatusSlot"></div>
          <button class="backlogToggle" type="button" aria-expanded="false" aria-label="Expand backlog item">+</button>
        </div>

        <div class="backlogDetails">
          <div class="backlogDetailsBar">
            <select class="backlogStatusSelect" aria-label="Backlog status">
              ${optionsHtml}
            </select>
          </div>
          ${buildDetailsHtml(item, columns)}
        </div>
      `;

      host.appendChild(row);
      applyStatusToRow(row, status);
    });

    // Bind once. Not "once per click" (that was a mistake).
    if (!host.dataset.backlogBound) {
      host.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest(".backlogToggle") : null;
        if (!btn) return;

        const row = btn.closest(".backlogRow");
        if (!row) return;

        const isExpanded = row.classList.toggle("is-expanded");
        btn.textContent = isExpanded ? "-" : "+";
        btn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      });

      host.addEventListener("change", (e) => {
        const sel = e.target && e.target.classList && e.target.classList.contains("backlogStatusSelect")
          ? e.target
          : null;
        if (!sel) return;

        const row = sel.closest(".backlogRow");
        if (!row) return;

        const taskKey = row.dataset.taskKey || "";
        if (!taskKey) return;

        const value = String(sel.value || "");
        const map = loadStatusMap();

        if (!value) {
          delete map[taskKey];
        } else {
          map[taskKey] = value;
        }

        saveStatusMap(map);
        applyStatusToRow(row, value);
      });

      host.dataset.backlogBound = "1";
    }
  }

  async function load(hostId, options = {}) {
    const host = $(hostId);
    if (!host) return;

    setMsg(host, "Loading backlog…");

    const cfg = getConfig();
    if (!cfg.webAppUrl || !cfg.token) {
      setMsg(host, "Backlog config missing (web app URL/token not found).");
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

      const statusMap = loadStatusMap();
      render(host, items, columns, statusMap);
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

/* Backlog: add a status column + keep description sane */
.backlogRowTop{
  grid-template-columns: 90px minmax(0, 1fr) auto 38px !important;
}

.backlogStatusSlot{
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

/* Pills */
.backlogStatusPill{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid transparent;
  white-space: nowrap;
}

.backlogStatus-awaiting_parts{
  background: var(--badBg);
  color: var(--badText);
  border-color: var(--badBorder);
}

.backlogStatus-on_order{
  background: #2a2400;
  color: #ffe8a3;
  border-color: #8a6a00;
}

.backlogStatus-scheduled{
  background: var(--goodBg);
  color: var(--goodText);
  border-color: var(--goodBorder);
}

/* Complete = highlight entire line item green */
.backlogRow.status-complete{
  border-color: var(--goodBorder) !important;
  background: rgba(11, 42, 18, 0.35) !important;
}
.backlogRow.status-complete .backlogRowTop{
  background: rgba(11, 42, 18, 0.25);
}
.backlogRow.status-complete .backlogTask{
  color: var(--goodText);
}

/* Expanded view control bar */
.backlogDetailsBar{
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.backlogStatusSelect{
  background: #0b0b0b;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 12px;
  padding: 8px 10px;
  font-weight: 900;
}
.backlogStatusSelect:focus{
  outline: none;
  border-color: #555;
}