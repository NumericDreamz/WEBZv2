/* ========================================================= */
/* ===================== weekly.js (Widget) ================= */
/* ========================================================= */
/*
  Purpose:
    Weekly tasks with time-based visibility + “Complete” collapse UI.

  Tasks:
    1) Make next week’s schedule
       - Targets NEXT week (next Monday)
       - Shows Wed 00:00 through Fri 23:59 (collapsed if complete)
       - Sat 00:00+ flashes angry only if not done
       - If completed, stays collapsed until midnight, then disappears
       - If previous target exists, overdue, and not done, show that one

    2) Update Backlog
       - Shows Tue 00:00 through Wed 23:59 (disappears Thu 00:00 no matter what)
       - If not done by Tue 12:00, flashes angry
       - Collapses to “Backlog” when complete

  Title:
    "Weekly"

  Storage:
    STORAGE_KEY: portal_metrics_weekly_v2
    State:
      state["YYYY-MM-DD"][taskId] = boolean
      state["YYYY-MM-DD"][taskId + "__doneAt"] = ms timestamp
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

  const DONE_AT_SUFFIX = "__doneAt";

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

  function doneAtKey(taskId) {
    return `${taskId}${DONE_AT_SUFFIX}`;
  }

  function nextMidnightMs(ts) {
    const d = new Date(Number(ts) || 0);
    if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return 0;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function isExpired(state, scopeKey, taskId, nowMs) {
    const ts = Number(state?.[scopeKey]?.[doneAtKey(taskId)] || 0);
    if (!ts) return false;
    const nm = nextMidnightMs(ts);
    if (!nm) return false;
    return nowMs >= nm;
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

    if (titleEl) titleEl.textContent = row.dataset.full || "";
    if (overdue) row.classList.add("weekly-overdue");
  }

  /* ========================================================= */
  /* =========================== Init ======================== */
  /* ========================================================= */
  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

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
      const nowMs = now.getTime();

      let state = normalizeState(store.load(STORAGE_KEY));
      pruneOld(state);

      /* ================= Schedule Context ================= */
      const curTargetMon = targetWeekMonday(now);
      const curTargetKey = dateKey(curTargetMon);

      const prevTargetMon = addDays(curTargetMon, -7);
      const prevTargetKey = dateKey(prevTargetMon);

      const schedDef = cfg.tasks.find(t => t.id === TASK_SCHEDULE_ID) || defaultConfig.tasks[0];

      // Only consider previous schedule if it already exists
      const prevExists = Object.prototype.hasOwnProperty.call(state, prevTargetKey);

      // Don't create fake previous entries
      const prevDone = prevExists ? !!state[prevTargetKey]?.[TASK_SCHEDULE_ID] : true;
      const prevIsOverdue = now >= scheduleOverdueStart(prevTargetMon);
      const prevExpired = prevExists && prevDone && isExpired(state, prevTargetKey, TASK_SCHEDULE_ID, nowMs);

      let schedTargetMonToShow = null;

      // If previous exists, overdue, and not done, show that angry one.
      // If it IS done, show it collapsed until midnight, then let it vanish.
      if (prevExists && prevIsOverdue && (!prevDone || (prevDone && !prevExpired))) {
        schedTargetMonToShow = prevTargetMon;
      } else {
        // Ensure current entry exists so we can correctly determine "done"
        ensureTask(state, curTargetKey, TASK_SCHEDULE_ID);

        const avail = scheduleAvailableStart(curTargetMon);
        const od = scheduleOverdueStart(curTargetMon);

        const curDone = !!state[curTargetKey]?.[TASK_SCHEDULE_ID];

        // If done but no doneAt yet (older state), stamp it now so midnight cleanup works.
        if (curDone && !state[curTargetKey]?.[doneAtKey(TASK_SCHEDULE_ID)]) {
          state[curTargetKey][doneAtKey(TASK_SCHEDULE_ID)] = nowMs;
        }

        const curExpired = curDone && isExpired(state, curTargetKey, TASK_SCHEDULE_ID, nowMs);

        const inPreDueWindow = (now >= avail && now < od); // Wed–Fri
        const inOverdueWindow = (now >= od && (!curDone || (curDone && !curExpired))); // Sat+ if not done OR done-but-not-expired

        if ((inPreDueWindow && (!curDone || (curDone && !curExpired))) || inOverdueWindow) {
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

        const blDone = !!state[backlogKey]?.[TASK_BACKLOG_ID];
        if (blDone && !state[backlogKey]?.[doneAtKey(TASK_BACKLOG_ID)]) {
          state[backlogKey][doneAtKey(TASK_BACKLOG_ID)] = nowMs;
        }
      }

      store.save(STORAGE_KEY, state);

      /* ================= Build Rows ================= */
      const rows = [];

      const weekLabel = schedTargetMonToShow
        ? labelForWeek(schedTargetMonToShow)
        : labelForWeek(curWeekMon);

      // Schedule row (skip if it’s expired)
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);
        ensureTask(state, schedKey, TASK_SCHEDULE_ID);

        const schedDone = !!state[schedKey]?.[TASK_SCHEDULE_ID];
        const schedExpired = schedDone && isExpired(state, schedKey, TASK_SCHEDULE_ID, nowMs);

        if (!schedExpired) {
          rows.push(buildRow(schedDef, schedKey));
        }
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

      /* ================= Apply Row State ================= */

      // Schedule state
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);

        const schedDone = !!state[schedKey]?.[TASK_SCHEDULE_ID];
        const schedOverdue = (now >= scheduleOverdueStart(schedTargetMonToShow) && !schedDone);

        const row = card.querySelector(`.weekly-row[data-task-id="${TASK_SCHEDULE_ID}"][data-scope-key="${schedKey}"]`);
        if (row) setRowState(row, schedDone, schedOverdue);
      }

      // Backlog state
      if (showBacklog) {
        const blDone = !!state[backlogKey]?.[TASK_BACKLOG_ID];
        const blOverdue = (now >= backlogAngryStart(curWeekMon) && !blDone);

        const row = card.querySelector(`.weekly-row[data-task-id="${TASK_BACKLOG_ID}"][data-scope-key="${backlogKey}"]`);
        if (row) setRowState(row, blDone, blOverdue);
      }
    }

    // Delegated change handler
    slot.addEventListener("change", (e) => {
      const input = e.target.closest('input[data-action="toggle"]');
      if (!input) return;

      const taskId = input.dataset.taskId;
      const scopeKey = input.dataset.scopeKey;
      if (!taskId || !scopeKey) return;

      let state = normalizeState(store.load(STORAGE_KEY));
      pruneOld(state);

      ensureTask(state, scopeKey, taskId);

      const checked = !!input.checked;
      state[scopeKey][taskId] = checked;

      // Track completion time so we can derez at midnight.
      if (checked) {
        state[scopeKey][doneAtKey(taskId)] = Date.now();
      } else {
        delete state[scopeKey][doneAtKey(taskId)];
      }

      store.save(STORAGE_KEY, state);
      rerender();
    });

    rerender();

    // Keep it time-aware (noon cutoff + midnight disappear + Thu hide)
    setInterval(rerender, 60 * 1000);
  }

  window.PortalWidgets.Weekly = { init };
})();
