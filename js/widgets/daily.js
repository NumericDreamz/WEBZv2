(function () {
  const STORAGE_KEY = "portal_metrics_daily_v1";

  const defaultConfig = {
    title: "Daily Metrics",
    toggles: [
      { id: "check_hazards", label: "Check for new Hazards" },
      { id: "review_work_orders", label: "Review Work Orders" },
      { id: "check_workday", label: "Check Workday" }
    ]
  };

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

  function ensureToday(state, todayKey, toggles) {
    if (!state[todayKey]) state[todayKey] = {};
    toggles.forEach(t => {
      if (typeof state[todayKey][t.id] !== "boolean") state[todayKey][t.id] = false;
    });
  }

  function buildHTML(cfg, todayPretty) {
    const rows = cfg.toggles.map(t => `
      <div class="toggle-row" data-toggle-id="${t.id}">
        <div class="toggle-left">
          <div class="toggle-title">${t.label}</div>
          <div class="toggle-sub">Daily</div>
        </div>

        <div class="toggle-right">
          <label class="switch" aria-label="${t.label}">
            <input type="checkbox" data-action="toggle" data-toggle-id="${t.id}">
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `).join("");

    return `
      <section class="metrics-card" data-widget="daily">
        <div class="widget-head">
          <h2>${cfg.title}</h2>
          <div class="daily-progress" data-role="progress">0/${cfg.toggles.length}</div>
        </div>

        ${rows}

        <div class="metric-footer">
          <div class="month-label" data-role="day-label">Today: ${todayPretty}</div>
          <div></div>
          <button class="btn subtle" type="button" data-action="reset-today">Reset</button>
        </div>
      </section>
    `;
  }

  function render(card, state, todayKey, cfg) {
    const todays = (state && state[todayKey]) ? state[todayKey] : {};
    let done = 0;

    cfg.toggles.forEach(t => {
      const checked = !!todays[t.id];
      const row = card.querySelector(`.toggle-row[data-toggle-id="${t.id}"]`);
      const input = card.querySelector(`input[data-toggle-id="${t.id}"]`);

      if (input) input.checked = checked;
      if (row) row.classList.toggle("toggle-done", checked);
      if (checked) done += 1;
    });

    const progress = card.querySelector('[data-role="progress"]');
    if (progress) progress.textContent = `${done}/${cfg.toggles.length}`;
  }

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

  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const cfg = {
      ...defaultConfig,
      ...config,
      toggles: (config.toggles || defaultConfig.toggles).slice()
    };

    const now = new Date();
    const todayKeyStr = dayKey(now);
    const todayPretty = prettyDay(now);

    slot.innerHTML = buildHTML(cfg, todayPretty);
    const card = slot.querySelector('[data-widget="daily"]');
    if (!card) return;

    const store = window.PortalApp?.Storage || getFallbackStore();

    let state = store.load(STORAGE_KEY);
    if (!state || typeof state !== "object") state = {};

    pruneOldDays(state);
    ensureToday(state, todayKeyStr, cfg.toggles);
    store.save(STORAGE_KEY, state);

    render(card, state, todayKeyStr, cfg);

    card.addEventListener("change", (e) => {
      const input = e.target.closest('input[data-action="toggle"]');
      if (!input) return;

      const id = input.dataset.toggleId;
      if (!id) return;

      ensureToday(state, todayKeyStr, cfg.toggles);
      state[todayKeyStr][id] = !!input.checked;

      pruneOldDays(state);
      store.save(STORAGE_KEY, state);
      render(card, state, todayKeyStr, cfg);
    });

    card.addEventListener("click", (e) => {
      const btn = e.target.closest('button[data-action="reset-today"]');
      if (!btn) return;

      ensureToday(state, todayKeyStr, cfg.toggles);
      cfg.toggles.forEach(t => state[todayKeyStr][t.id] = false);

      pruneOldDays(state);
      store.save(STORAGE_KEY, state);
      render(card, state, todayKeyStr, cfg);
    });
  }

  window.PortalWidgets = window.PortalWidgets || {};
  window.PortalWidgets.Daily = { init };
})();
