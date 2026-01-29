/* ========================================================= */
/* ====================== daily.js (Widget) ================= */
/* ========================================================= */
/*
  Purpose:
    Daily toggles with “Complete” collapse behavior.

  Changes:
    - Title shortened: "Daily"
    - Removed top-right x/3 counter (obsolete)
    - Removed bottom-right Reset button (obsolete)
    - Moved date display to under the title
    - Removed redundant "Daily" sublabel on each row
    - When a toggle is checked, switch is replaced with "Complete" pill
    - Completed labels shorten to: Hazards / Review / Workday

  Storage:
    STORAGE_KEY: portal_metrics_daily_v1
*/

/* ========================================================= */
/* ================= Config / Globals ====================== */
/* ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "portal_metrics_daily_v1";

  const defaultConfig = {
    title: "Daily",
    toggles: [
      { id: "check_hazards", label: "Check for new Hazards" },
      { id: "review_work_orders", label: "Review Work Orders" },
      { id: "check_workday", label: "Check Workday" }
    ]
  };

  /* ========================================================= */
  /* ======================= Utilities ======================= */
  /* ========================================================= */
  function dayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // YYYY-MM-DD
  }

  function prettyDay(d) {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function pruneOldDays(state, keep = 45) {
    if (!state || typeof state !== "object") return;
    const keys = Object.keys(state).sort(); // YYYY-MM-DD sorts correctly
    while (keys.length > keep) delete state[keys.shift()];
  }

  function ensureToday(state, todayKeyStr, toggles) {
    if (!state[todayKeyStr]) state[todayKeyStr] = {};
    toggles.forEach(t => {
      if (typeof state[todayKeyStr][t.id] !== "boolean") state[todayKeyStr][t.id] = false;
    });
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortLabelForToggle(id, fullLabel) {
    if (id === "check_hazards") return "Hazards";
    if (id === "review_work_orders") return "Review";
    if (id === "check_workday") return "Workday";
    return fullLabel || id;
  }

  /* ========================================================= */
  /* =================== Storage Wrapper ===================== */
  /* ========================================================= */
  function getFallbackStore() {
    return {
      load: function (key) {
        try { return JSON.parse(localStorage.getItem(key) || "{}"); }
        catch { return {}; }
      },
      save: function (key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function getStore() {
    return window.PortalApp?.Storage || getFallbackStore();
  }

  /* ========================================================= */
  /* =================== Render / Template =================== */
  /* ========================================================= */
  function buildHTML(cfg, todayPretty, todaysState) {
    const rows = cfg.toggles.map(t => {
      const checked = !!todaysState?.[t.id];
      const labelText = checked ? shortLabelForToggle(t.id, t.label) : t.label;

      // If complete: replace switch with pill
      const rightSide = checked
        ? `
          <div class="status-pill status-good" aria-live="polite">
            <span class="status-dot"></span>
            <span class="status-text">Complete</span>
          </div>
        `
        : `
          <label class="switch" aria-label="${esc(t.label)}">
            <input type="checkbox" data-action="toggle" data-toggle-id="${esc(t.id)}">
            <span class="slider"></span>
          </label>
        `;

      return `
        <div class="toggle-row ${checked ? "toggle-done toggle-complete" : ""}" data-toggle-id="${esc(t.id)}">
          <div class="toggle-left">
            <div class="toggle-title">${esc(labelText)}</div>
          </div>

          <div class="toggle-right">
            ${rightSide}
          </div>
        </div>
      `;
    }).join("");

    return `
      <section class="metrics-card" data-widget="daily">
        <div class="widget-head">
          <h2>${esc(cfg.title || "Daily")}</h2>
        </div>

        <!-- date directly under title -->
        <div class="daily-progress" data-role="day-label">${esc(todayPretty)}</div>

        ${rows}
      </section>
    `;
  }

  function render(slot, cfg, state, todayKeyStr, todayPretty) {
    const todays = (state && state[todayKeyStr]) ? state[todayKeyStr] : {};
    slot.innerHTML = buildHTML(cfg, todayPretty, todays);

    // Sync checkbox states for any rows still showing switches
    const card = slot.querySelector('[data-widget="daily"]');
    if (!card) return;

    cfg.toggles.forEach(t => {
      const checked = !!todays[t.id];
      const input = card.querySelector(`input[data-toggle-id="${CSS.escape(t.id)}"]`);
      if (input) input.checked = checked;
    });
  }

  /* ========================================================= */
  /* =========================== Init ======================== */
  /* ========================================================= */
  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const cfg = {
      ...defaultConfig,
      ...config,
      title: "Daily",
      toggles: (config.toggles || defaultConfig.toggles).slice()
    };

    const now = new Date();
    const todayKeyStr = dayKey(now);
    const todayPretty = prettyDay(now);

    const store = getStore();

    let state = store.load(STORAGE_KEY);
    if (!state || typeof state !== "object") state = {};

    pruneOldDays(state);
    ensureToday(state, todayKeyStr, cfg.toggles);
    store.save(STORAGE_KEY, state);

    render(slot, cfg, state, todayKeyStr, todayPretty);

    // Delegate change handling (only fires for rows that still have switches)
    slot.addEventListener("change", (e) => {
      const input = e.target.closest('input[data-action="toggle"]');
      if (!input) return;

      const id = input.dataset.toggleId;
      if (!id) return;

      ensureToday(state, todayKeyStr, cfg.toggles);
      state[todayKeyStr][id] = !!input.checked;

      pruneOldDays(state);
      store.save(STORAGE_KEY, state);

      // Rerender to swap switch -> Complete pill when checked
      render(slot, cfg, state, todayKeyStr, todayPretty);
    });
  }

  window.PortalWidgets = window.PortalWidgets || {};
  window.PortalWidgets.Daily = { init };
})();
