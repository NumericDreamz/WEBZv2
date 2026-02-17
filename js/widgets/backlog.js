(function () {
  "use strict";

  console.log("[BacklogWidget] build 2026-02-17_01 loaded");

  window.PortalWidgets = window.PortalWidgets || {};

  const STATUS_KEY = "backlog_status_map_v1";

  const STATUS_ORDER = [
    { key: "awaiting_parts", label: "Awaiting Parts" },
    { key: "on_order",       label: "On Order" },
    { key: "scheduled",      label: "Scheduled" },
    { key: "complete",       label: "Complete" },
    { key: "",               label: "Unassigned" }
  ];

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }

  function getConfig() {
    return {
      webAppUrl: (window.PORTALSTATE_WEBAPP_URL || "").toString().trim(),
      token: (window.PORTALSTATE_TOKEN || "").toString().trim()
    };
  }

  function getStore() {
    return (window.PortalApp && window.PortalApp.Storage) ? window.PortalApp.Storage : null;
  }

  function safeLoad(key) {
    const store = getStore();
    if (store && typeof store.load === "function") {
      const v = store.load(key);
      return (v && typeof v === "object") ? v : {};
    }
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === "object") ? obj : {};
    } catch {
      return {};
    }
  }

  function jsonp(url, timeoutMs = 9000) {
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

  function pillFor(status) {
    if (status === "awaiting_parts") return { cls: "backlogStatus-awaiting_parts", text: "Awaiting Parts" };
    if (status === "on_order")       return { cls: "backlogStatus-on_order",       text: "On Order" };
    if (status === "scheduled")      return { cls: "backlogStatus-scheduled",      text: "Scheduled" };
    return null;
  }

  function buildDetailsHtml(item, columns) {
    const raw = (item && typeof item === "object") ? item : {};
    const ignore = new Set([
      "task","description","Task","Description","Desc",
      "Task ID","TaskId","Task Number","Task #","id"
    ]);
    const ignoreLower = new Set([
      "backlog status"
    ]);

    let keys = Array.isArray(columns) && columns.length
      ? columns.map(c => String(c || "").trim()).filter(Boolean)
      : Object.keys(raw);

    keys = keys.filter(k => !ignore.has(k) && !ignoreLower.has(String(k).toLowerCase()));

    if (!keys.length) return `<div class="backlogMsg">No additional fields.</div>`;

    let html = `<div class="backlogCard">`;
    for (const k of keys) {
      const val = normalizeValue(raw[k]);
      const isEmpty = !val.trim();
      html += `
        <div class="backlogField">
          <div class="backlogLabel" title="${esc(k)}">${esc(k)}</div>
          <div class="backlogValue ${isEmpty ? "is-empty" : ""}">${esc(isEmpty ? "—" : val)}</div>
        </div>`;
    }
    html += `</div>`;
    return html;
  }

  function applyStatusToRow(rowEl, status) {
    rowEl.classList.remove("status-awaiting_parts","status-on_order","status-scheduled","status-complete");
    if (status) rowEl.classList.add("status-" + status);

    const slot = rowEl.querySelector(".backlogStatusSlot");
    if (!slot) return;

    const p = pillFor(status);
    slot.innerHTML = p ? `<div class="backlogStatusPill ${esc(p.cls)}">${esc(p.text)}</div>` : "";
  }

  function calcSummary(items, statusMap) {
    const counts = { awaiting_parts: 0, on_order: 0, scheduled: 0, complete: 0, "": 0 };

    items.forEach((item, idx) => {
      const taskRaw = String(pickTask(item) ?? "").trim();
      const taskKey = taskRaw || ("row_" + idx);
      const st = String(statusMap[taskKey] || "");
      if (Object.prototype.hasOwnProperty.call(counts, st)) counts[st] += 1;
      else counts[""] += 1;
    });

    return { total: items.length, counts };
  }

  function renderIndicator(summary) {
    const donutHost = document.getElementById("blwDonut");
    const totalEl = document.getElementById("blwTotal");
    const legendHost = document.getElementById("blwLegend");
    if (!donutHost || !totalEl || !legendHost) return;

    const total = summary?.total || 0;
    totalEl.textContent = String(total);

    const r = 46;
    const cx = 60, cy = 60;
    const sw = 10;
    const C = 2 * Math.PI * r;

    let svg = `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="seg-base" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" />
    `;

    if (total > 0) {
      let offset = 0;

      const segs = [
        { key: "awaiting_parts", cls: "seg-awaiting_parts" },
        { key: "on_order",       cls: "seg-on_order" },
        { key: "scheduled",      cls: "seg-scheduled" },
        { key: "complete",       cls: "seg-complete" },
        { key: "",               cls: "seg-unassigned" }
      ];

      for (const s of segs) {
        const n = summary.counts?.[s.key] || 0;
        if (!n) continue;

        const len = (n / total) * C;
        svg += `
          <circle
            class="${s.cls}"
            cx="${cx}" cy="${cy}" r="${r}"
            fill="none"
            stroke-width="${sw}"
            stroke-linecap="round"
            stroke-dasharray="${len} ${C - len}"
            stroke-dashoffset="${-offset}"
          />
        `;
        offset += len;
      }
    }

    svg += `</svg>`;

    const center = donutHost.querySelector(".blw-donutCenter");
    donutHost.innerHTML = svg + (center ? center.outerHTML : "");

    function pct(n) {
      if (!total) return "0%";
      return Math.round((n / total) * 100) + "%";
    }

    legendHost.innerHTML = STATUS_ORDER.map(s => {
      const n = summary.counts?.[s.key] || 0;
      const dotCls =
        s.key === "awaiting_parts" ? "dot-awaiting_parts" :
        s.key === "on_order" ? "dot-on_order" :
        s.key === "scheduled" ? "dot-scheduled" :
        s.key === "complete" ? "dot-complete" :
        "dot-unassigned";

      return `
        <div class="blw-legendRow">
          <div class="blw-dot ${dotCls}"></div>
          <div>${esc(s.label)}</div>
          <div style="opacity:.9; font-weight:900;">${esc(pct(n))}</div>
        </div>
      `;
    }).join("");
  }

  async function fetchBacklog(limit) {
    const cfg = getConfig();
    if (!cfg.webAppUrl || !cfg.token) throw new Error("Backlog config missing.");

    const url =
      cfg.webAppUrl +
      (cfg.webAppUrl.includes("?") ? "&" : "?") +
      "action=backlog" +
      "&token=" + encodeURIComponent(cfg.token) +
      "&limit=" + encodeURIComponent(String(limit || 50)) +
      "&_=" + Date.now();

    return jsonp(url);
  }

  function renderList(slot, items, columns, statusMap) {
    if (!items.length) {
      slot.innerHTML = `<div class="backlogMsg">No backlog items.</div>`;
      return;
    }

    slot.innerHTML = "";

    items.forEach((item, idx) => {
      const taskRaw = normalizeText(pickTask(item));
      const desc = normalizeText(pickDesc(item));
      const taskKey = taskRaw || ("row_" + idx);
      const status = String(statusMap[taskKey] || "");

      const row = document.createElement("div");
      row.className = "backlogRow";
      row.dataset.taskKey = taskKey;

      row.innerHTML = `
        <div class="backlogRowTop">
          <div class="backlogTask" title="${esc(taskRaw)}">${esc(taskRaw)}</div>
          <div class="backlogDesc" title="${esc(desc)}">${esc(desc)}</div>
          <div class="backlogStatusSlot"></div>
          <button class="backlogToggle" type="button" aria-expanded="false" aria-label="Expand backlog item">+</button>
        </div>
        <div class="backlogDetails">
          ${buildDetailsHtml(item, columns)}
        </div>
      `;

      slot.appendChild(row);
      applyStatusToRow(row, status);
    });
  }

  window.PortalWidgets.Backlog = {
    init: async function (slotId, opts) {
      const slot = document.getElementById(slotId);
      if (!slot) return;

      if (slot.dataset.backlogInited === "1") return;
      slot.dataset.backlogInited = "1";

      const limit = opts?.limit || 50;
      const refreshBtn = document.getElementById("backlogRefreshBtn");

      // Expand/collapse handler (event delegation). Attach once.
      slot.addEventListener("click", (e) => {
        const btn = e.target.closest(".backlogToggle");
        if (!btn) return;

        const row = btn.closest(".backlogRow");
        if (!row) return;

        const isExpanded = row.classList.toggle("is-expanded");
        btn.textContent = isExpanded ? "-" : "+";
        btn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      });

      function setBusy(isBusy) {
        if (!refreshBtn) return;
        refreshBtn.disabled = !!isBusy;
        refreshBtn.textContent = isBusy ? "Loading…" : "Refresh";
      }

      async function loadAndRender() {
        setBusy(true);

        // lightweight placeholders so it feels responsive
        if (slot.childElementCount === 0 || slot.textContent.includes("Loading")) {
          slot.innerHTML = `<div class="backlogMsg">Loading backlog…</div>`;
        }

        const legendHost = document.getElementById("blwLegend");
        if (legendHost) legendHost.innerHTML = `<div class="blw-legendSub">Loading…</div>`;

        try {
          const res = await fetchBacklog(limit);
          if (!res || res.ok !== true) throw new Error(res?.error || "Bad backlog response");

          const items = Array.isArray(res.items) ? res.items : [];
          const columns = Array.isArray(res.columns) ? res.columns : null;

          const statusMap = safeLoad(STATUS_KEY);
          renderList(slot, items, columns, statusMap);
          renderIndicator(calcSummary(items, statusMap));
        } catch (err) {
          console.error("[BacklogWidget] load failed:", err);
          slot.innerHTML = `<div class="backlogMsg">Backlog unavailable.</div>`;

          const legendHost2 = document.getElementById("blwLegend");
          if (legendHost2) legendHost2.innerHTML = `<div class="blw-legendSub">Unavailable</div>`;

          renderIndicator({ total: 0, counts: { awaiting_parts: 0, on_order: 0, scheduled: 0, complete: 0, "": 0 } });
        } finally {
          setBusy(false);
        }
      }

      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => { loadAndRender(); });
      }

      await loadAndRender();
    }
  };
})();
