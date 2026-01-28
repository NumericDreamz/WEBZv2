(function () {
  const STORAGE_KEY = "portal_metrics_weekly_v2"; // new key to avoid old bogus state

  const defaultConfig = {
    title: "Weekly Metrics",
    tasks: [
      { id: "make_next_week_schedule", label: "Make next week’s schedule" }
    ]
  };

  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`; // YYYY-MM-DD
  }

  function mondayOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    d.setDate(d.getDate() - dow);
    return d;
  }

  function addDays(d, days) {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  }

  // The week being scheduled is NEXT week (Monday start)
  function targetWeekMonday(now) {
    return addDays(mondayOfWeek(now), 7);
  }

  function labelForWeek(monday) {
    return `Week of ${monday.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    })}`;
  }

  // For target week Monday:
  // available Wednesday before: Monday - 5 days @ 00:00
  // overdue Saturday before:   Monday - 2 days @ 00:00
  function availableStart(targetMonday) {
    const d = addDays(targetMonday, -5);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function overdueStart(targetMonday) {
    const d = addDays(targetMonday, -2);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getFallbackStore() {
    return {
      load: function (key) {
        try { return JSON.parse(localStorage.getItem(key) || "null"); }
        catch { return null; }
      },
      save: function (key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function getStore() {
    return window.PortalApp?.Storage || getFallbackStore();
  }

  function normalizeState(raw) {
    return (raw && typeof raw === "object") ? raw : {};
  }

  function pruneOld(state, keep = 18) {
    const keys = Object.keys(state).sort();
    while (keys.length > keep) delete state[keys.shift()];
  }

  function buildHTML(cfg, labelText) {
    const rows = cfg.tasks.map(t => `
      <div class="toggle-row weekly-row" data-task-id="${t.id}">
        <div class="toggle-left">
          <div class="toggle-title">${t.label}</div>
        </div>
        <div class="toggle-right">
          <label class="switch" aria-label="${t.label}">
            <input type="checkbox" data-action="toggle" data-task-id="${t.id}">
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `).join("");

    return `
      <section class="metrics-card" data-widget="weekly">
        <div class="widget-head">
          <h2>${cfg.title}</h2>
          <div class="daily-progress" data-role="week-label">${labelText}</div>
        </div>
        ${rows}
      </section>
    `;
  }

  function ensureState(state, targetKey, tasks) {
    if (!state[targetKey]) state[targetKey] = {};
    tasks.forEach(t => {
      if (typeof state[targetKey][t.id] !== "boolean") state[targetKey][t.id] = false;
    });
  }

  function applyRowClasses(row, done, isOverdue) {
    row.classList.remove("weekly-good", "weekly-warn", "weekly-overdue");
    if (done) row.classList.add("weekly-good");
    else if (isOverdue) row.classList.add("weekly-overdue"); // your CSS should flash this
    else row.classList.add("weekly-warn"); // red border/toggle, no flashing
  }

  function render(card, state, targetKey, cfg, now, targetMonday) {
    const odStart = overdueStart(targetMonday);
    const isOverdue = now >= odStart;

    cfg.tasks.forEach(t => {
      const row = card.querySelector(`.weekly-row[data-task-id="${t.id}"]`);
      const input = card.querySelector(`input[data-task-id="${t.id}"]`);
      const done = !!state[targetKey]?.[t.id];

      if (input) input.checked = done;
      if (row) applyRowClasses(row, done, isOverdue && !done);
    });
  }

  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const cfg = {
      ...defaultConfig,
      ...config,
      tasks: (config.tasks || defaultConfig.tasks).slice()
    };

    const store = getStore();
    const now = new Date();

    // Determine the current target week (next Monday)
    const curTargetMon = targetWeekMonday(now);
    const curTargetKey = dateKey(curTargetMon);

    // If we missed last week’s schedule, keep yelling until it’s done
    const prevTargetMon = addDays(curTargetMon, -7);
    const prevTargetKey = dateKey(prevTargetMon);

    let state = normalizeState(store.load(STORAGE_KEY));
    pruneOld(state);

    // IMPORTANT: do NOT create fake previous entries unless they already exist
    const prevExists = Object.prototype.hasOwnProperty.call(state, prevTargetKey);
    const firstTaskId = cfg.tasks[0]?.id;
    const prevDone = prevExists ? !!state[prevTargetKey]?.[firstTaskId] : true;
    const prevIsOverdue = now >= overdueStart(prevTargetMon);

    // Decide which “week to schedule” to display:
    // 1) If previous target exists, is overdue, and not done, show that angry one.
    // 2) Otherwise show current target if we're at/after Wednesday availability,
    //    and show Sat+ ONLY if not done (angry). If done on Sat+, hide.
    let targetMonToShow = null;

    if (prevExists && !prevDone && prevIsOverdue) {
      targetMonToShow = prevTargetMon;
    } else {
      const avail = availableStart(curTargetMon);
      const od = overdueStart(curTargetMon);

      // Ensure current entry exists so we can correctly determine "done"
      ensureState(state, curTargetKey, cfg.tasks);
      store.save(STORAGE_KEY, state);

      const curDone = !!state[curTargetKey]?.[firstTaskId];
      const inPreDueWindow = (now >= avail && now < od);
      const inOverdueWindow = (now >= od && !curDone);

      if (inPreDueWindow || inOverdueWindow) {
        targetMonToShow = curTargetMon;
      }
    }

    if (!targetMonToShow) {
      slot.innerHTML = "";
      return;
    }

    const targetKey = dateKey(targetMonToShow);
    ensureState(state, targetKey, cfg.tasks);
    store.save(STORAGE_KEY, state);

    slot.innerHTML = buildHTML(cfg, labelForWeek(targetMonToShow));
    const card = slot.querySelector('[data-widget="weekly"]');
    if (!card) return;

    render(card, state, targetKey, cfg, new Date(), targetMonToShow);

    card.addEventListener("change", (e) => {
      const input = e.target.closest('input[data-action="toggle"]');
      if (!input) return;

      const id = input.dataset.taskId;
      if (!id) return;

      ensureState(state, targetKey, cfg.tasks);
      state[targetKey][id] = !!input.checked;

      pruneOld(state);
      store.save(STORAGE_KEY, state);

      const now2 = new Date();
      const od2 = overdueStart(targetMonToShow);
      const doneNow = !!state[targetKey][id];

      // If completed and we're past Saturday cutoff, hide it immediately.
      if (doneNow && now2 >= od2) {
        slot.innerHTML = "";
        return;
      }

      render(card, state, targetKey, cfg, now2, targetMonToShow);
    });
  }

  window.PortalWidgets = window.PortalWidgets || {};
  window.PortalWidgets.Weekly = { init };
})();
