(function () {
  "use strict";

  console.log("[StatusPage] build 2026-02-19_02 loaded");

  const DEFAULTS = { timeoutMs: 10000 };

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cfg() {
    // Prefer the newer env config if present.
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
      const cbName = "__statuspage_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
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

    // If resolvedAt exists, it's complete.
    return !!String(item?.resolvedAt || "").trim();
  }

  function parseDateMaybe(v) {
    const s = String(v || "").trim();
    if (!s) return 0;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function prettyTime(ts) {
    // “Last update” should be in local time.
    try {
      const d = new Date(ts);
      return d.toLocaleString("en-US", { timeZone: "America/Chicago" });
    } catch (_) {
      return "";
    }
  }

  function formatCstMinute(isoString) {
    const ms = parseDateMaybe(isoString);
    if (!ms) return "";

    try {
      const fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

      const parts = fmt.formatToParts(new Date(ms));
      const get = (t) => parts.find(p => p.type === t)?.value || "";
      const y = get("year");
      const m = get("month");
      const d = get("day");
      const h = get("hour");
      const min = get("minute");
      if (!y || !m || !d || !h || !min) return "";
      return `${y}-${m}-${d} ${h}:${min}`;
    } catch (_) {
      // Fallback: best effort local conversion.
      try {
        const d = new Date(ms);
        const y = String(d.getFullYear());
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const da = String(d.getDate()).padStart(2, "0");
        const h = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return `${y}-${m}-${da} ${h}:${mi}`;
      } catch (_) {
        return "";
      }
    }
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

  function field(label, value) {
    const v = String(value ?? "").trim();
    const shown = v ? esc(v) : "—";
    return `
      <div class="sm-field">
        <div class="sm-label" title="${esc(label)}">${esc(label)}</div>
        <div class="sm-value">${shown}</div>
      </div>`;
  }

  function pickAssetLine(item) {
    // First line on the cards: Asset ID, Asset Description, Sub-location
    const assetId = String(item?.assetId || "").trim();
    const eqId = String(item?.equipmentId || "").trim();
    const left = assetId ? assetId : (eqId ? `EQ ${eqId}` : "Unknown Asset");

    const assetDesc = String(item?.assetDescription || "").trim();
    const subLoc = String(item?.subLocation || "").trim();

    const parts = [];
    parts.push(left);
    if (assetDesc) parts.push(assetDesc);
    if (subLoc) parts.push(subLoc);

    return parts.join("; ");
  }

  function pillHtml(item) {
    const st = String(item?.operationalStatus || "").trim();
    const down = isDown(st);
    const reduced = isReduced(st);
    const complete = isComplete(item);

    if (complete) {
      return `<div class="sm-pill complete" title="Complete"><span class="sm-dot"></span>Complete</div>`;
    }
    if (down) {
      return `<div class="sm-pill down" title="Down"><span class="sm-dot"></span>Down</div>`;
    }
    if (reduced) {
      return `<div class="sm-pill reduced" title="Reduced"><span class="sm-dot"></span>Reduced</div>`;
    }
    return `<div class="sm-pill open" title="Open"><span class="sm-dot"></span>Open</div>`;
  }

  function rowClass(item) {
    const st = String(item?.operationalStatus || "").trim();
    if (isComplete(item)) return "sm-row is-complete";
    if (isDown(st)) return "sm-row is-down";
    if (isReduced(st)) return "sm-row is-reduced";
    return "sm-row";
  }

  function buildDetails(item) {
    const parts = [];

    parts.push(field("Work Order #", item?.workOrderNumber));
    parts.push(field("Operational Status", item?.operationalStatus));
    parts.push(field("WO Status", item?.workOrderStatus));
    parts.push(field("WO Description", item?.workOrderDescription));

    parts.push(field("Asset Id", item?.assetId));
    parts.push(field("Equipment ID", item?.equipmentId));
    parts.push(field("Asset Description", item?.assetDescription));

    parts.push(field("Criticality", item?.equipmentCriticality));
    parts.push(field("Priority", item?.workOrderPriority));
    parts.push(field("WO Type", item?.workOrderType));
    parts.push(field("Task Template", item?.taskTemplate));

    parts.push(field("Site", item?.site));
    parts.push(field("Sub-location", item?.subLocation));
    parts.push(field("Bldg Location", item?.bldgLocation));

    parts.push(field("Work Order Date/Time", item?.workOrderDateTime));
    parts.push(field("Escalated At", item?.escalatedAt));
    parts.push(field("Assigned Technician", item?.assignedTechnician));

    parts.push(field("Notes", item?.notes));

    // If it's resolved, show it.
    if (String(item?.resolvedAt || "").trim()) {
      parts.push(field("Resolved At", item?.resolvedAt));
    }

    return `<div class="sm-card">${parts.join("")}</div>`;
  }

  function render(data) {
    const list = $("smList");
    if (!list) return;

    if (!data || data.ok !== true) {
      const err = esc(data?.error || "Unknown error");
      list.innerHTML = `<div class="sm-empty">Status fetch failed: ${err}</div>`;
      return;
    }

    const items = Array.isArray(data.items) ? data.items.slice() : [];

    // Sort: open first, newest first (escalatedAt > emailReceivedAt)
    items.sort((a, b) => {
      const aOpen = !isComplete(a) && (isDown(a?.operationalStatus) || isReduced(a?.operationalStatus));
      const bOpen = !isComplete(b) && (isDown(b?.operationalStatus) || isReduced(b?.operationalStatus));
      if (aOpen !== bOpen) return aOpen ? -1 : 1;

      const at = parseDateMaybe(a?.escalatedAt) || parseDateMaybe(a?.emailReceivedAt);
      const bt = parseDateMaybe(b?.escalatedAt) || parseDateMaybe(b?.emailReceivedAt);
      return bt - at;
    });

    let downCount = 0;
    let reducedCount = 0;
    let completeCount = 0;

    for (const it of items) {
      if (isComplete(it)) { completeCount++; continue; }
      if (isDown(it?.operationalStatus)) downCount++;
      if (isReduced(it?.operationalStatus)) reducedCount++;
    }

    const downEl = $("smDownCount");
    const redEl = $("smReducedCount");
    const compEl = $("smCompleteCount");
    if (downEl) downEl.textContent = String(downCount);
    if (redEl) redEl.textContent = String(reducedCount);
    if (compEl) compEl.textContent = String(completeCount);

    const updatedEl = $("smUpdated");
    if (updatedEl) updatedEl.textContent = "Last update: " + prettyTime(Date.now());

    if (!items.length) {
      list.innerHTML = `<div class="sm-empty">Nothing here. Either everything’s fine, or the email system is asleep.</div>`;
      return;
    }

    let html = "";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const wo = String(it?.workOrderNumber || "").trim() || ("row_" + i);
      const problem = String(it?.workOrderDescription || "").trim();
      const woText = String(it?.workOrderNumber || "").trim();
      const stampRaw = String(it?.escalatedAt || it?.emailReceivedAt || "").trim();
      const stamp = formatCstMinute(stampRaw) || "";

      html += `
        <div class="${rowClass(it)}" data-wo="${esc(wo)}">
          <div class="sm-rowTop">
            <div class="sm-rowMain">
              <div class="sm-asset" title="${esc(pickAssetLine(it))}">${esc(pickAssetLine(it))}</div>
              <div class="sm-wo">WO: ${esc(woText || "—")}${stamp ? `  <span style=\"opacity:0.55; padding:0 6px;\">•</span>  ${esc(stamp)}` : ""}</div>
              <div class="sm-desc" title="${esc(problem)}">${esc(problem || "—")}</div>
            </div>
            <div class="sm-right">
              ${pillHtml(it)}
              <button class="sm-toggle" type="button" data-action="toggle" aria-label="Toggle details">+</button>
            </div>
          </div>
          <div class="sm-details">${buildDetails(it)}</div>
        </div>`;
    }

    list.innerHTML = html;
  }

  async function refresh() {
    const list = $("smList");
    if (list) list.textContent = "Loading status…";

    try {
      const data = await loadStatus();
      render(data);
    } catch (err) {
      render({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  function wire() {
    const list = $("smList");
    const btn = $("smRefresh");
    if (btn) btn.addEventListener("click", refresh);

    // Wire toggles (event delegation) once.
    if (list && !list.__smWired) {
      list.__smWired = true;
      list.addEventListener("click", (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("[data-action='toggle']") : null;
        if (!btn) return;

        const row = btn.closest(".sm-row");
        if (!row) return;

        const details = row.querySelector(".sm-details");
        if (!details) return;

        const open = details.style.display === "block";
        details.style.display = open ? "none" : "block";
        btn.textContent = open ? "+" : "−";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wire();
    refresh();
  });
})();
