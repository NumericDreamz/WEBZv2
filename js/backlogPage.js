(function () {
  "use strict";

  console.log("[BacklogPage] build 2026-02-13_01 loaded");

  const DEFAULTS = { limit: 200, timeoutMs: 10000 };
  const STATUS_KEY = "backlog_status_map_v1";       // already used by index widget
  const NOTES_KEY  = "backlog_notes_map_v1";        // new: notes only for this page

  const STATUS_OPTIONS = [
    { value: "", label: "(unassigned)" },
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

  const STATUS_ORDER = [
    { key: "awaiting_parts", label: "Awaiting Parts" },
    { key: "on_order",       label: "On Order" },
    { key: "scheduled",      label: "Scheduled" },
    { key: "complete",       label: "Complete" },
    { key: "",               label: "Unassigned" }
  ];

  function $(id) { return document.getElementById(id); }

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

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getConfig() {
    // Back-compat globals are set by config.js
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

  function safeSave(key, val) {
    const store = getStore();
    if (store && typeof store.save === "function") {
      store.save(key, val);
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(val || {})); } catch (_) {}
  }

  function jsonp(url, timeoutMs = DEFAULTS.timeoutMs) {
    return new Promise((resolve, reject) => {
      const cbName = "__backlogpage_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
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
    return null; // complete = row highlight
  }

  function applyStatusToRow(rowEl, status) {
    for (const c of STATUS_CLASS_LIST) rowEl.classList.remove(c);
    if (status) rowEl.classList.add("status-" + status);

    const slot = rowEl.querySelector(".backlogStatusSlot");
    if (!slot) return;

    const p = pillFor(status);
    slot.innerHTML = p ? `<div class="backlogStatusPill ${esc(p.cls)}">${esc(p.text)}</div>` : "";
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

    if (!keys.length) return `<div class="backlogMsg">No additional fields for this row.</div>`;

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

  function loadBacklog(limit) {
    const cfg = getConfig();
    if (!cfg.webAppUrl || !cfg.token) {
      throw new Error("Backlog config missing (web app URL/token not found).");
    }

    const endpoint =
      cfg.webAppUrl +
      (cfg.webAppUrl.includes("?") ? "&" : "?") +
      "action=backlog" +
      "&token=" + encodeURIComponent(cfg.token) +
      "&limit=" + encodeURIComponent(String(limit)) +
      "&_=" + Date.now();

    return jsonp(endpoint, DEFAULTS.timeoutMs);
  }

  function calcSummary(items, statusMap) {
    const counts = {
      awaiting_parts: 0,
      on_order: 0,
      scheduled: 0,
      complete: 0,
      "": 0
    };

    items.forEach((item, idx) => {
      const taskRaw = String(pickTask(item) ?? "").trim();
      const taskKey = taskRaw || ("row_" + idx);
      const st = String(statusMap[taskKey] || "");
      if (Object.prototype.hasOwnProperty.call(counts, st)) counts[st] += 1;
      else counts[""] += 1;
    });

    return { total: items.length, counts };
  }

  function renderDonut(summary) {
    const donutHost = $("blDonut");
    const totalEl = $("blTotal");
    const legendHost = $("blLegend");
    if (!donutHost || !totalEl || !legendHost) return;

    const total = summary.total || 0;
    totalEl.textContent = String(total);

    const r = 46;
    const cx = 60, cy = 60;
    const sw = 10;
    const C = 2 * Math.PI * r;

    // Base ring
    let svg = `
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="seg-base" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" />
    `;

    if (total > 0) {
      let offset = 0;

      // draw in a stable order so the ring doesn't reshuffle visually
      const segs = [
        { key: "awaiting_parts", cls: "seg-awaiting_parts" },
        { key: "on_order",       cls: "seg-on_order" },
        { key: "scheduled",      cls: "seg-scheduled" },
        { key: "complete",       cls: "seg-complete" },
        { key: "",               cls: "seg-unassigned" }
      ];

      for (const s of segs) {
        const n = summary.counts[s.key] || 0;
        if (!n) continue;

        const len = (n / total) * C;
        // circle segments via dasharray + dashoffset
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

    // Inject SVG behind the center label
    // Keep the center overlay intact
    const center = donutHost.querySelector(".bl-donutCenter");
    donutHost.innerHTML = svg + (center ? center.outerHTML : "");

    // Legend
    function pct(n) {
      if (!total) return "0%";
      return Math.round((n / total) * 100) + "%";
    }

    legendHost.innerHTML = STATUS_ORDER.map(s => {
      const n = summary.counts[s.key] || 0;
      const dotCls =
        s.key === "awaiting_parts" ? "dot-awaiting_parts" :
        s.key === "on_order" ? "dot-on_order" :
        s.key === "scheduled" ? "dot-scheduled" :
        s.key === "complete" ? "dot-complete" :
        "dot-unassigned";

      return `
        <div class="bl-legendRow">
          <div class="bl-dot ${dotCls}"></div>
          <div>${esc(s.label)}</div>
          <div style="opacity:.9; font-weight:900;">${esc(pct(n))}</div>
        </div>
      `;
    }).join("");
  }

  function renderBacklog(host, items, columns, statusMap, notesMap) {
    host.innerHTML = "";

    items.forEach((item, idx) => {
      const taskRaw = normalizeText(pickTask(item));
      const desc = normalizeText(pickDesc(item));
      const taskKey = taskRaw || ("row_" + idx);

      const status = String(statusMap[taskKey] || "");

      const optionsHtml = STATUS_OPTIONS.map(o => {
        const sel = (o.value === status) ? "selected" : "";
        return `<option value="${esc(o.value)}" ${sel}>${esc(o.label)}</option>`;
      }).join("");

      const notes = Array.isArray(notesMap[taskKey]) ? notesMap[taskKey].slice() : [];
      notes.sort((a, b) => {
        const ad = String(a?.date || "");
        const bd = String(b?.date || "");
        if (ad !== bd) return ad.localeCompare(bd);
        return (Number(a?.createdAt || 0) - Number(b?.createdAt || 0));
      });

      const notesHtml = notes.length
        ? `<ul class="bl-notesList">` + notes.map(n => `
            <li data-note-id="${esc(n.id)}">
              <span class="bl-noteDateTag">${esc(n.date || "????-??-??")}</span>
              ${esc(n.text || "")}
              <button class="bl-noteDel" type="button" data-action="del-note" aria-label="Delete note">✕</button>
            </li>
          `).join("") + `</ul>`
        : `<div class="backlogMsg">No notes yet.</div>`;

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
          <div class="backlogDetailsBar">
            <select class="backlogStatusSelect" aria-label="Backlog status">
              ${optionsHtml}
            </select>
          </div>

          <div class="bl-notes" aria-label="Notes">
            <div class="bl-notesHead">
              <div class="bl-notesTitle">Notes</div>
              <div class="bl-notesHint">Dated bullets are stored only for this page.</div>
            </div>

            <div class="bl-notesBody">
              ${notesHtml}
            </div>

            <div class="bl-compose">
              <input class="bl-date" type="date" value="${esc(todayISO())}" data-role="note-date" aria-label="Note date">
              <textarea class="bl-text" rows="1" data-role="note-text" placeholder="Paste technician note…"></textarea>
              <button class="bl-addBtn" type="button" data-action="add-note">Add Note</button>
            </div>
          </div>

          ${buildDetailsHtml(item, columns)}
        </div>
      `;

      host.appendChild(row);
      applyStatusToRow(row, status);
    });
  }

  async function boot() {
    const host = $("backlogList");
    const refreshBtn = $("blRefresh");
    if (!host) return;

    // Pull remote state first so notes/status are up-to-date
    const store = getStore();
    if (store && typeof store.init === "function") {
      try { await store.init(); }
      catch (e) { console.warn("[BacklogPage] Storage.init failed (continuing local-only):", e); }
    }

    let lastItems = [];
    let lastColumns = null;

    async function reload() {
      host.innerHTML = `<div class="backlogMsg">Loading backlog…</div>`;

      try {
        const res = await loadBacklog(DEFAULTS.limit);
        if (!res || res.ok !== true) throw new Error(res && res.error ? res.error : "Bad backlog response");

        lastItems = Array.isArray(res.items) ? res.items : [];
        lastColumns = Array.isArray(res.columns) ? res.columns : null;

        const statusMap = safeLoad(STATUS_KEY);
        const notesMap  = safeLoad(NOTES_KEY);

        renderBacklog(host, lastItems, lastColumns, statusMap, notesMap);
        renderDonut(calcSummary(lastItems, statusMap));
      } catch (err) {
        console.error("[BacklogPage] load failed:", err);
        host.innerHTML = `<div class="backlogMsg">Backlog unavailable.</div>`;
      }
    }

    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = "1";
      refreshBtn.addEventListener("click", reload);
    }

    // Delegated events for expand/status/notes
    if (!host.dataset.bound) {
      host.dataset.bound = "1";

      host.addEventListener("click", (e) => {
        const t = e.target;

        const toggleBtn = t && t.closest ? t.closest(".backlogToggle") : null;
        if (toggleBtn) {
          const row = toggleBtn.closest(".backlogRow");
          if (!row) return;

          const isExpanded = row.classList.toggle("is-expanded");
          toggleBtn.textContent = isExpanded ? "-" : "+";
          toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
          return;
        }

        const actionBtn = t && t.closest ? t.closest("button[data-action]") : null;
        if (!actionBtn) return;

        const row = actionBtn.closest(".backlogRow");
        if (!row) return;

        const taskKey = row.dataset.taskKey || "";
        if (!taskKey) return;

        const action = actionBtn.dataset.action || "";

        if (action === "add-note") {
          const dateEl = row.querySelector('[data-role="note-date"]');
          const textEl = row.querySelector('[data-role="note-text"]');

          const date = normalizeText(dateEl ? dateEl.value : "") || todayISO();
          const text = normalizeText(textEl ? textEl.value : "");
          if (!text) return;

          const notesMap = safeLoad(NOTES_KEY);
          const arr = Array.isArray(notesMap[taskKey]) ? notesMap[taskKey] : [];
          arr.push({ id: uid(), date, text, createdAt: Date.now() });

          // basic prune: keep last 75 notes per task
          if (arr.length > 75) arr.splice(0, arr.length - 75);

          notesMap[taskKey] = arr;
          safeSave(NOTES_KEY, notesMap);

          // re-render this row's notes area only
          const body = row.querySelector(".bl-notesBody");
          if (body) {
            const sorted = arr.slice().sort((a,b)=>{
              const ad = String(a?.date||"");
              const bd = String(b?.date||"");
              if(ad !== bd) return ad.localeCompare(bd);
              return Number(a?.createdAt||0) - Number(b?.createdAt||0);
            });

            body.innerHTML = `<ul class="bl-notesList">` + sorted.map(n => `
              <li data-note-id="${esc(n.id)}">
                <span class="bl-noteDateTag">${esc(n.date || "????-??-??")}</span>
                ${esc(n.text || "")}
                <button class="bl-noteDel" type="button" data-action="del-note" aria-label="Delete note">✕</button>
              </li>
            `).join("") + `</ul>`;
          }

          if (textEl) textEl.value = "";
          return;
        }

        if (action === "del-note") {
          const li = actionBtn.closest("li[data-note-id]");
          const noteId = li ? li.getAttribute("data-note-id") : "";
          if (!noteId) return;

          const notesMap = safeLoad(NOTES_KEY);
          const arr = Array.isArray(notesMap[taskKey]) ? notesMap[taskKey] : [];
          const next = arr.filter(n => String(n.id) !== String(noteId));
          notesMap[taskKey] = next;
          safeSave(NOTES_KEY, notesMap);

          // remove the li from DOM
          if (li && li.parentNode) li.parentNode.removeChild(li);
          return;
        }
      });

      host.addEventListener("change", (e) => {
        const sel = e.target && e.target.classList && e.target.classList.contains("backlogStatusSelect") ? e.target : null;
        if (!sel) return;

        const row = sel.closest(".backlogRow");
        if (!row) return;

        const taskKey = row.dataset.taskKey || "";
        const value = String(sel.value || "");

        const statusMap = safeLoad(STATUS_KEY);
        if (!value) delete statusMap[taskKey];
        else statusMap[taskKey] = value;

        safeSave(STATUS_KEY, statusMap);
        applyStatusToRow(row, value);
        renderDonut(calcSummary(lastItems, statusMap));
      });
    }

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();