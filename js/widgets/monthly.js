
/* ========================================================= */
/* ===================== monthly.js (Widget) ================= */
/* ========================================================= */
/*
  Purpose:
    Monthly counters + Recognition tracker

  Title:
    "Monthly - <MonthName>"  (drops "Metrics")

  Top progress bar:
    % through the current month (under the title)

  Behavior updates:
    - Removed the Monthly reset button (obsolete test control).
    - Recognition no longer shows a month progress bar inside itself.
    - Recognition collapses into a minimal "Complete" row when used >= allotment.
    - LOTO + Care Convo collapse into minimal "Complete" rows when val >= target:
        * No "Target: x / month"
        * No +/- controls
        * Display names shortened to "LOTO" and "Care Convo"
    - All "On track" pills changed to "Complete"

  Storage:
    STORAGE_KEY: portal_monthly_metrics_v2

  External deps:
    window.PortalApp.Storage (load/save) if available
*/

(function () {
  "use strict";

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_monthly_metrics_v2";

  /* ========================================================= */
  /* ======================= Utilities ======================= */
  /* ========================================================= */
  function monthKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function daysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function monthTitle(now) {
    const monthName = now.toLocaleString(undefined, { month: "long" });
    return `Monthly - ${monthName}`;
  }

  function shortNameForMetricId(id, fallbackLabel) {
    if (id === "loto_obs") return "LOTO";
    if (id === "care_convos") return "Care Convo";
    if (id === "efs") return "Eyes For Safety";
    if (id === "pulse_surv") return "Pulse Survey";
    return fallbackLabel || id;
  }

  /* ========================================================= */
  /* =================== Storage Wrapper ===================== */
  /* ========================================================= */
  function getFallbackStore() {
    return {
      load: function (key) {
        try {
          return JSON.parse(localStorage.getItem(key) || "{}");
        } catch {
          return {};
        }
      },
      save: function (key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function getStore() {
    return window.PortalApp?.Storage || getFallbackStore();
  }

  function pruneOldMonths(state, keep = 12) {
    if (!state || typeof state !== "object") return;
    const keys = Object.keys(state).sort(); // YYYY-MM sorts correctly
    while (keys.length > keep) {
      delete state[keys.shift()];
    }
  }

  function ensureMonth(state, key) {
    if (!state[key] || typeof state[key] !== "object") {
      state[key] = {};
    }
    return state[key];
  }

  function getVal(state, key, id) {
    const m = ensureMonth(state, key);
    if (typeof m[id] !== "number") m[id] = 0;
    return m[id];
  }

  function setVal(state, key, id, val) {
    const m = ensureMonth(state, key);
    m[id] = val;
  }

  /* ========================================================= */
  /* =================== Render / Template =================== */
  /* ========================================================= */
  function render(host, cfg, state, now) {
    const key = monthKey(now);
    const metrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];

    // Top-of-widget month progress bar
    const dim = daysInMonth(now);
    const day = now.getDate();
    const monthPct = clamp(Math.round((day / dim) * 100), 0, 100);
    const monthShort = now.toLocaleString(undefined, { month: "short" });

    const htmlParts = [];

    htmlParts.push(`
      <section class="metrics-card" id="monthly-metrics">
        <div class="widget-head">
          <h2>${esc(monthTitle(now))}</h2>
        </div>

        <!-- progress bar directly under title -->
        <div class="bar-row" style="margin-top:0;">
          <div class="bar-label">${esc(monthShort)}</div>
          <div class="bar-track month">
            <div class="bar-fill month" style="width:${monthPct}%;"></div>
          </div>
          <div class="bar-pct">${monthPct}%</div>
        </div>
    `);

    for (const m of metrics) {
      const id = m && m.id;
      if (!id) continue;

      /* ========================================================= */
      /* ================ Recognition (special) ================== */
      /* ========================================================= */
      if (m.type === "recognition") {
        const label = esc(m.label || "Recognition");
        const allot = Number(m.allotment || 0) || 0;

        const usedRaw = getVal(state, key, id);
        const used = clamp(usedRaw, 0, allot || 999999);

        const pctUsed = allot ? clamp(Math.round((used / allot) * 100), 0, 100) : 0;
        const done = allot > 0 && used >= allot;

        // COLLAPSED WHEN COMPLETE
        if (done) {
          htmlParts.push(`
            <div class="metric-row recognition recog-collapsed"
                 data-metric-id="${esc(id)}"
                 data-allotment="${esc(allot)}">
              <div class="metric-left">
                <div class="metric-title">${label}</div>
              </div>

              <div class="status-pill status-good" aria-live="polite">
                <span class="status-dot"></span>
                <span class="status-text">Complete</span>
              </div>
            </div>
          `);
          continue;
        }

        // EXPANDED WHEN NOT COMPLETE
        htmlParts.push(`
          <div class="metric-row recognition"
               data-metric-id="${esc(id)}"
               data-allotment="${esc(allot)}">
            <div class="recog-head">
              <div class="recog-title">${label}</div>
              <div class="recog-right">
                <div class="recog-points">
                  <span data-role="recog-used">${used}</span>/${allot}
                </div>
                <button class="btn"
                        type="button"
                        data-action="recog-edit"
                        aria-label="Update Recognition points">+</button>
              </div>
            </div>

            <!-- Only the total progress bar now (month progress lives at top of Monthly widget) -->
            <div class="bar-row">
              <div class="bar-label">Total</div>
              <div class="bar-track points">
                <div class="bar-fill points" style="width:${pctUsed}%;"></div>
              </div>
              <div class="bar-pct">
                <span data-role="recog-pct">${pctUsed}</span>%
              </div>
            </div>
          </div>
        `);

        continue;
      }

      /* ========================================================= */
      /* ============== Standard counter metric ================== */
      /* ========================================================= */
      const target = Number(m.target || 0);
      const val = getVal(state, key, id);
      const done = target ? val >= target : false;

      const shortLabel = esc(shortNameForMetricId(id, m.label));

      // For LOTO + Care Convo + EFS + Pulse: collapse when complete
      const isCollapseCandidate =
        (id === "loto_obs" ||
         id === "care_convos" ||
         id === "efs" ||
         id === "pulse_surv");

      if (isCollapseCandidate && done) {
        htmlParts.push(`
          <div class="metric-row metric-collapsed"
               data-metric-id="${esc(id)}"
               data-target="${esc(target)}">
            <div class="metric-left">
              <div class="metric-title">${shortLabel}</div>
            </div>

            <div class="status-pill status-good" aria-live="polite">
              <span class="status-dot"></span>
              <span class="status-text">Complete</span>
            </div>
          </div>
        `);
        continue;
      }

      // Default full metric (still editable)
      htmlParts.push(`
        <div class="metric-row"
             data-metric-id="${esc(id)}"
             data-target="${esc(target)}">
          <div class="metric-top">
            <div class="metric-left">
              <div class="metric-title">${shortLabel}</div>
              <div class="metric-subtitle">
                Target: <span class="target-val">${target}</span> / month
              </div>
            </div>

            <div class="status-pill ${done ? "status-good" : "status-bad"}"
                 aria-live="polite">
              <span class="status-dot"></span>
              <span class="status-text">${done ? "Complete" : "Behind"}</span>
            </div>
          </div>

          <div class="counter counter-anchored">
            <button class="btn"
                    type="button"
                    data-action="dec"
                    aria-label="Decrease ${shortLabel}">−</button>
            <div class="count" data-role="count">${val}</div>
            <button class="btn"
                    type="button"
                    data-action="inc"
                    aria-label="Increase ${shortLabel}">+</button>
          </div>
        </div>
      `);
    }

    htmlParts.push(`</section>`);
    host.innerHTML = htmlParts.join("");
  }

  /* ========================================================= */
  /* =========================== Init ======================== */
  /* ========================================================= */
  window.PortalWidgets.Monthly = {
    init: function (slotId, cfg) {
      const host = document.getElementById(slotId);
      if (!host) return;

      const store = getStore();
      const config = cfg || {};

      // Inject EFS + Pulse as standard counters at the top if not provided
      const baseMetrics = Array.isArray(config.metrics) ? config.metrics.slice() : [];
      const existingIds = new Set(baseMetrics.map(m => m && m.id));

      const extraMetrics = [];

      // Eyes For Safety – monthly counter, collapses when >= target (like LOTO)
      if (!existingIds.has("efs")) {
        extraMetrics.push({
          id: "efs",
          label: "Eyes For Safety",
          target: 1  // adjust if you want a different target
        });
      }

      // Pulse Survey – monthly counter, collapses when >= target
      if (!existingIds.has("pulse_surv")) {
        extraMetrics.push({
          id: "pulse_surv",
          label: "Pulse Survey",
          target: 1  // adjust if you want a different target
        });
      }

      // Final metrics array: [EFS, Pulse, ...existing (LOTO, Care, Recognition, ...)]
      config.metrics = extraMetrics.concat(baseMetrics);

      let state = store.load(STORAGE_KEY);
      if (!state || typeof state !== "object") state = {};

      pruneOldMonths(state);
      ensureMonth(state, monthKey(new Date()));
      store.save(STORAGE_KEY, state);

      render(host, config, state, new Date());

      // One event handler for the whole card
      host.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const now = new Date();
        const key = monthKey(now);
        const row = e.target.closest(".metric-row");
        if (!row) return;

        const metricId = row.dataset.metricId;
        if (!metricId) return;

        // Recognition edit (only exists in expanded view)
        if (btn.dataset.action === "recog-edit") {
          const allot = Number(row.dataset.allotment || 0) || 0;
          const current = getVal(state, key, metricId);
          const raw = prompt(
            `Add Recognition points (remaining ${Math.max(0, allot - current)}):`,
            "10"
          );
          if (raw === null) return;

          const add = Number(String(raw).trim());
          if (!Number.isFinite(add)) return;

          const next = clamp(current + Math.round(add), 0, allot);
          setVal(state, key, metricId, next);
          pruneOldMonths(state);
          store.save(STORAGE_KEY, state);
          render(host, config, state, new Date());
          return;
        }

        // Standard counter inc/dec
        const action = btn.dataset.action;
        if (!action) return;

        ensureMonth(state, key);
        const current = getVal(state, key, metricId);
        let next = current;

        if (action === "inc") next = current + 1;
        if (action === "dec") next = Math.max(0, current - 1);

        setVal(state, key, metricId, next);
        pruneOldMonths(state);
        store.save(STORAGE_KEY, state);
        render(host, config, state, new Date());
      });
    }
  };

})();
