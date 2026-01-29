/* ========================================================= */
/* ===================== weekly.js (Widget) ================= */
/* ========================================================= */
/*
  Purpose:
    Weekly tasks with time-based visibility + “Complete” collapse UI.

  Tasks:
    1) Make next week’s schedule
       - Targets NEXT week (next Monday)
       - Shows Wed 00:00 through Fri 23:59 (even if done, it collapses)
       - Sat 00:00+ shows ONLY if not done (flashes angry)
       - If previous target week exists and is overdue + not done, show that one instead

    2) Update Backlog
       - Shows Tuesday 00:00 through Wednesday 23:59 (disappears Thu 00:00 no matter what)
       - If not done by Tuesday 12:00, flashes angry
       - Collapses to short label “Backlog” when complete

  Title:
    "Weekly" (drops "Metrics")

  Storage:
    STORAGE_KEY: portal_metrics_weekly_v2
    State shape:
      state["YYYY-MM-DD"][taskId] = boolean
      - schedule stored under target Monday dateKey (next Monday or previous)
      - backlog stored under current week Monday dateKey
*/

/* ========================================================= */
/* ================= Config / Globals ====================== */
/* ========================================================= */
(function () {
  "use strict";

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_metrics_weekly_v2";

  const TASK_SCHEDULE_ID = "make_next_week_schedule";
  const TASK_BACKLOG_ID  = "update_backlog";

  const defaultConfig = {
    title: "Weekly",
    tasks: [
      { id: TASK_SCHEDULE_ID, label: "Make next week’s schedule", shortLabel: "Schedule" },
      { id: TASK_BACKLOG_ID,  label: "Update Backlog",           shortLabel: "Backlog" }
    ]
  };

  /* ========================================================= */
  /* ======================= Utilities ======================= */
  /* ========================================================= */
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

  function labelForWeek(monday) {
    return `Week of ${monday.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    })}`;
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ========================================================= */
  /* =================== Schedule Windows ==================== */
  /* ========================================================= */

  // Schedule targets NEXT week (Monday start)
  function targetWeekMonday(now) {
    return addDays(mondayOfWeek(now), 7);
  }

  // For target week Monday:
  // available Wednesday before: Monday - 5 days @ 00:00
  // overdue Saturday before:   Monday - 2 days @ 00:00
  function scheduleAvailableStart(targetMonday) {
    const d = addDays(targetMonday, -5);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function scheduleOverdueStart(targetMonday) {
    const d = addDays(targetMonday, -2);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Backlog is tied to CURRENT week (Mon start)
  function backlogShowStart(curWeekMon) {
    const d = addDays(curWeekMon, 1); // Tuesday 00:00
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function backlogAngryStart(curWeekMon) {
    const d = addDays(curWeekMon, 1); // Tuesday
    d.setHours(12, 0, 0, 0);          // 12:00
    return d;
  }

  function backlogHideStart(curWeekMon) {
    const d = addDays(curWeekMon, 3); // Thursday 00:00 (end of Wednesday)
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* ========================================================= */
  /* =================== Storage Wrapper ===================== */
  /* ========================================================= */
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

  function ensureKey(state, k) {
    if (!state[k] || typeof state[k] !== "object") state[k] = {};
  }

  function ensureTask(state, k, taskId) {
    ensureKey(state, k);
    if (typeof state[k][taskId] !== "boolean") state[k][taskId] = false;
  }

  /* ========================================================= */
  /* =================== Template / Render =================== */
  /* ========================================================= */
  function buildRow(taskDef, scopeKey) {
    const id = taskDef.id;
    const label = taskDef.label;

    return `
      <div class="toggle-row weekly-row" data-task-id="${esc(id)}" data-scope-key="${esc(scopeKey)}" data-full="${esc(label)}" data-short="${esc(taskDef.shortLabel || label)}">
        <div class="toggle-left">
          <div class="toggle-title">${esc(label)}</div>
        </div>

        <div class="toggle-right">
          <div class="status-pill status-good toggle-pill" aria-live="polite">
            <span class="status-dot"></span>
            <span class="status-text">Complete</span>
          </div>

          <label class="switch" aria-label="${esc(label)}">
            <input type="checkbox" data-action="toggle" data-task-id="${esc(id)}" data-scope-key="${esc(scopeKey)}">
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
  }

  function buildHTML(cfg, weekLabelText, rowsHtml) {
    return `
      <section class="metrics-card" data-widget="weekly">
        <div class="widget-head">
          <h2>${esc(cfg.title)}</h2>
        </div>

        <div class="widget-sub">
          <div class="daily-progress" data-role="week-label">${esc(weekLabelText)}</div>
        </div>

        ${rowsHtml}
      </section>
    `;
  }

  function setRowState(row, done, overdue) {
    const input = row.querySelector('input[data-action="toggle"]');
    const titleEl = row.querySelector(".toggle-title");

    row.classList.remove("weekly-overdue", "is-complete");

    if (input) input.checked = !!done;

    if (done) {
      row.classList.add("is-complete");
      if (titleEl) titleEl.textContent = row.dataset.short || row.dataset.full || "";
      return;
    }

    // Not done: full label, possible angry flash
    if (titleEl) titleEl.textContent = row.dataset.full || "";
    if (overdue) row.classList.add("weekly-overdue");
  }

  /* ========================================================= */
  /* =========================== Init ======================== */
  /* ========================================================= */
  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    // prevent double-init
    if (slot.dataset.weeklyInited === "1") return;
    slot.dataset.weeklyInited = "1";

    const store = getStore();
    const cfg = {
      ...defaultConfig,
      ...config,
      tasks: (config.tasks || defaultConfig.tasks).slice()
    };

    function rerender() {
      const now = new Date();

      let state = normalizeState(store.load(STORAGE_KEY));
      pruneOld(state);

      /* ================= Schedule Context ================= */
      const curTargetMon = targetWeekMonday(now);
      const curTargetKey = dateKey(curTargetMon);

      const prevTargetMon = addDays(curTargetMon, -7);
      const prevTargetKey = dateKey(prevTargetMon);

      // schedule task def
      const schedDef = cfg.tasks.find(t => t.id === TASK_SCHEDULE_ID) || defaultConfig.tasks[0];

      // Only consider previous schedule if it already exists
      const prevExists = Object.prototype.hasOwnProperty.call(state, prevTargetKey);
      const prevDone = prevExists ? !!state[prevTargetKey]?.[TASK_SCHEDULE_ID] : true;
      const prevIsOverdue = now >= scheduleOverdueStart(prevTargetMon);

      let schedTargetMonToShow = null;

      if (prevExists && !prevDone && prevIsOverdue) {
        schedTargetMonToShow = prevTargetMon;
      } else {
        // Ensure current key exists ONLY so we can check done accurately
        ensureTask(state, curTargetKey, TASK_SCHEDULE_ID);
        store.save(STORAGE_KEY, state);

        const avail = scheduleAvailableStart(curTargetMon);
        const od = scheduleOverdueStart(curTargetMon);
        const curDone = !!state[curTargetKey]?.[TASK_SCHEDULE_ID];

        const inPreDueWindow = (now >= avail && now < od);      // Wed–Fri
        const inOverdueWindow = (now >= od && !curDone);        // Sat+ only if not done

        if (inPreDueWindow || inOverdueWindow) {
          schedTargetMonToShow = curTargetMon;
        }
      }

      /* ================= Backlog Context ================= */
      const curWeekMon = mondayOfWeek(now);
      const backlogKey = dateKey(curWeekMon);

      const blDef = cfg.tasks.find(t => t.id === TASK_BACKLOG_ID) || defaultConfig.tasks[1];

      const blShowStart = backlogShowStart(curWeekMon);
      const blHideStart = backlogHideStart(curWeekMon);

      const showBacklog = (now >= blShowStart && now < blHideStart);

      if (showBacklog) {
        ensureTask(state, backlogKey, TASK_BACKLOG_ID);
      }

      // Persist state updates (ensure keys exist)
      store.save(STORAGE_KEY, state);

      /* ================= Decide What To Show ================= */
      const rows = [];

      // week label: prefer schedule week-of if schedule is showing, otherwise current week
      const weekLabel = schedTargetMonToShow
        ? labelForWeek(schedTargetMonToShow)
        : labelForWeek(curWeekMon);

      // Schedule row
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);
        ensureTask(state, schedKey, TASK_SCHEDULE_ID);
        rows.push(buildRow(schedDef, schedKey));
      }

      // Backlog row
      if (showBacklog) {
        rows.push(buildRow(blDef, backlogKey));
      }

      if (!rows.length) {
        slot.innerHTML = "";
        return;
      }

      slot.innerHTML = buildHTML(cfg, weekLabel, rows.join(""));

      const card = slot.querySelector('[data-widget="weekly"]');
      if (!card) return;

      // Apply row state classes (done / overdue / collapsed)
      // Schedule overdue logic depends on which target we’re showing
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);
        const schedDone = !!state[schedKey]?.[TASK_SCHEDULE_ID];
        const schedOverdue = (now >= scheduleOverdueStart(schedTargetMonToShow) && !schedDone);

        const row = card.querySelector(`.weekly-row[data-task-id="${TASK_SCHEDULE_ID}"][data-scope-key="${schedKey}"]`);
        if (row) setRowState(row, schedDone, schedOverdue);
      }

      // Backlog overdue starts Tuesday noon if not done
      if (showBacklog) {
        const blDone = !!state[backlogKey]?.[TASK_BACKLOG_ID];
        const blOverdue = (now >= backlogAngryStart(curWeekMon) && !blDone);

        const row = card.querySelector(`.weekly-row[data-task-id="${TASK_BACKLOG_ID}"][data-scope-key="${backlogKey}"]`);
        if (row) setRowState(row, blDone, blOverdue);
      }
    }

    // One delegated handler, survives rerenders
    slot.addEventListener("change", (e) => {
      const input = e.target.closest('input[data-action="toggle"]');
      if (!input) return;

      const taskId = input.dataset.taskId;
      const scopeKey = input.dataset.scopeKey;
      if (!taskId || !scopeKey) return;

      const store2 = getStore();
      let state = normalizeState(store2.load(STORAGE_KEY));
      pruneOld(state);

      ensureTask(state, scopeKey, taskId);
      state[scopeKey][taskId] = !!input.checked;

      store2.save(STORAGE_KEY, state);

      // Rerender based on new truth (also applies hide windows)
      rerender();
    });

    rerender();

    // Optional: keep it “live” for the Backlog noon cutoff + hide on Thu 00:00
    // (Cheap timer, low drama)
    setInterval(rerender, 60 * 1000);
  }

  window.PortalWidgets.Weekly = { init };
})();
