/* ========================================================= */
/* ===================== weekly.js (Widget) ================= */
/* ========================================================= */
/*
  Purpose:
    Weekly tasks with time-based visibility + “Complete” collapse UI.

  Tasks:
    1) Payroll
       - Shows every Wednesday starting 00:00 (local)
       - If completed: collapses green and disappears at next midnight
       - If not completed by Thursday 00:00: angry flashing until completed
       - If you missed last week and it exists in state: it stays visible (angry) until you complete it

    2) Make next week’s schedule
       - Targets NEXT week (next Monday)
       - Shows Wed 00:00 through Fri 23:59 (collapsed if complete)
       - Sat 00:00+ flashes angry only if not done
       - If completed, stays collapsed until midnight, then disappears
       - If previous target exists, overdue, and not done, show that one

    3) Update Backlog
       - Shows Tue 00:00 through Wed 23:59 (disappears Thu 00:00 no matter what)
       - If not done by Tue 12:00, flashes angry
       - Collapses to “Backlog” when complete

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

  const TASK_PAYROLL_ID  = "payroll";
  const TASK_SCHEDULE_ID = "make_next_week_schedule";
  const TASK_BACKLOG_ID  = "update_backlog";

  const DONE_AT_SUFFIX = "__doneAt";

  const defaultConfig = {
    title: "Weekly",
    tasks: [
      { id: TASK_PAYROLL_ID,  label: "Payroll",                shortLabel: "Payroll" },
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

  // Payroll is tied to CURRENT week (Wed start)
  function payrollWeekWednesday(curWeekMon) {
    const d = addDays(curWeekMon, 2); // Wednesday
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function payrollShowStart(payrollWed) {
    const d = new Date(payrollWed);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function payrollOverdueStart(payrollWed) {
    const d = addDays(payrollWed, 1); // Thursday 00:00
    d.setHours(0, 0, 0, 0);
    return d;
  }

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
    let removed = 0;
    while (keys.length > keep) {
      delete state[keys.shift()];
      removed++;
    }
    return removed > 0;
  }

  function ensureKey(state, k) {
    if (!state[k] || typeof state[k] !== "object") {
      state[k] = {};
      return true;
    }
    return false;
  }

  function ensureTask(state, k, taskId) {
    let changed = ensureKey(state, k);
    if (typeof state[k][taskId] !== "boolean") {
      state[k][taskId] = false;
      changed = true;
    }
    return changed;
  }

  /* ========================================================= */
  /* =================== Template / Render =================== */
  /* ========================================================= */
  function buildRow(taskDef, scopeKey, rowClass) {
    const id = taskDef.id;
    const label = taskDef.label;

    return `
      <div class="toggle-row ${esc(rowClass)}" data-task-id="${esc(id)}" data-scope-key="${esc(scopeKey)}" data-full="${esc(label)}" data-short="${esc(taskDef.shortLabel || label)}">
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

    row.classList.remove("weekly-overdue", "payroll-overdue", "is-complete");

    if (input) input.checked = !!done;

    if (done) {
      row.classList.add("is-complete");
      if (titleEl) titleEl.textContent = row.dataset.short || row.dataset.full || "";
      return;
    }

    if (titleEl) titleEl.textContent = row.dataset.full || "";

    if (overdue) {
      // payroll uses its own class so the flashing rule applies
      if (row.classList.contains("payroll-row")) row.classList.add("payroll-overdue");
      else row.classList.add("weekly-overdue");
    }
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

    // Build task list, but always ensure payroll exists (even if config overrides tasks)
    const baseTasks = (config.tasks || defaultConfig.tasks).slice();
    if (!baseTasks.some(t => t.id === TASK_PAYROLL_ID)) {
      baseTasks.unshift({ id: TASK_PAYROLL_ID, label: "Payroll", shortLabel: "Payroll" });
    }

    const cfg = {
      ...defaultConfig,
      ...config,
      tasks: baseTasks
    };

    function rerender() {
      const now = new Date();
      const nowMs = now.getTime();

      let state = normalizeState(store.load(STORAGE_KEY));
      let dirty = pruneOld(state);

      /* ================= Context ================= */
      const curWeekMon = mondayOfWeek(now);
      const weekLabel = labelForWeek(curWeekMon);

      /* ================= Payroll ================= */
      const payrollDef = cfg.tasks.find(t => t.id === TASK_PAYROLL_ID) || defaultConfig.tasks[0];

      const payrollWed = payrollWeekWednesday(curWeekMon);
      const payrollKey = dateKey(payrollWed);

      const prevPayrollWed = addDays(payrollWed, -7);
      const prevPayrollKey = dateKey(prevPayrollWed);

      const prevPayrollExists = Object.prototype.hasOwnProperty.call(state, prevPayrollKey);
      const prevPayrollDone = prevPayrollExists ? !!state[prevPayrollKey]?.[TASK_PAYROLL_ID] : true;
      const prevPayrollExpired = prevPayrollExists && prevPayrollDone && isExpired(state, prevPayrollKey, TASK_PAYROLL_ID, nowMs);

      let payrollWedToShow = null;

      // If last week's payroll exists and isn't expired (done-but-not-expired OR not-done), keep showing it.
      if (prevPayrollExists && (!prevPayrollDone || (prevPayrollDone && !prevPayrollExpired))) {
        payrollWedToShow = prevPayrollWed;
      } else {
        // Show current payroll starting Wednesday 00:00
        if (now >= payrollShowStart(payrollWed)) {
          dirty = ensureTask(state, payrollKey, TASK_PAYROLL_ID) || dirty;

          const curDone = !!state[payrollKey]?.[TASK_PAYROLL_ID];
          if (curDone && !state[payrollKey]?.[doneAtKey(TASK_PAYROLL_ID)]) {
            state[payrollKey][doneAtKey(TASK_PAYROLL_ID)] = nowMs;
            dirty = true;
          }

          const curExpired = curDone && isExpired(state, payrollKey, TASK_PAYROLL_ID, nowMs);
          if (!curExpired) payrollWedToShow = payrollWed;
        }
      }

      /* ================= Schedule ================= */
      const curTargetMon = targetWeekMonday(now);
      const curTargetKey = dateKey(curTargetMon);

      const prevTargetMon = addDays(curTargetMon, -7);
      const prevTargetKey = dateKey(prevTargetMon);

      const schedDef = cfg.tasks.find(t => t.id === TASK_SCHEDULE_ID) || defaultConfig.tasks[1];

      const prevSchedExists = Object.prototype.hasOwnProperty.call(state, prevTargetKey);
      const prevSchedDone = prevSchedExists ? !!state[prevTargetKey]?.[TASK_SCHEDULE_ID] : true;
      const prevSchedIsOverdue = now >= scheduleOverdueStart(prevTargetMon);
      const prevSchedExpired = prevSchedExists && prevSchedDone && isExpired(state, prevTargetKey, TASK_SCHEDULE_ID, nowMs);

      let schedTargetMonToShow = null;

      // If previous exists, overdue, and not done: show it angry.
      // If done: show it collapsed until midnight, then let it vanish.
      if (prevSchedExists && prevSchedIsOverdue && (!prevSchedDone || (prevSchedDone && !prevSchedExpired))) {
        schedTargetMonToShow = prevTargetMon;
      } else {
        const avail = scheduleAvailableStart(curTargetMon);
        const od = scheduleOverdueStart(curTargetMon);

        // Only create the current schedule record once we're in its window.
        const inAnyWindow = (now >= avail);
        if (inAnyWindow) {
          dirty = ensureTask(state, curTargetKey, TASK_SCHEDULE_ID) || dirty;

          const curDone = !!state[curTargetKey]?.[TASK_SCHEDULE_ID];
          if (curDone && !state[curTargetKey]?.[doneAtKey(TASK_SCHEDULE_ID)]) {
            state[curTargetKey][doneAtKey(TASK_SCHEDULE_ID)] = nowMs;
            dirty = true;
          }

          const curExpired = curDone && isExpired(state, curTargetKey, TASK_SCHEDULE_ID, nowMs);

          const inPreDueWindow = (now >= avail && now < od); // Wed–Fri
          const inOverdueWindow = (now >= od && (!curDone || (curDone && !curExpired))); // Sat+

          if ((inPreDueWindow && (!curDone || (curDone && !curExpired))) || inOverdueWindow) {
            schedTargetMonToShow = curTargetMon;
          }
        }
      }

      /* ================= Backlog ================= */
      const backlogKey = dateKey(curWeekMon);
      const blDef = cfg.tasks.find(t => t.id === TASK_BACKLOG_ID) || defaultConfig.tasks[2];

      const blShowStart = backlogShowStart(curWeekMon);
      const blHideStart = backlogHideStart(curWeekMon);

      const showBacklog = (now >= blShowStart && now < blHideStart);

      if (showBacklog) {
        dirty = ensureTask(state, backlogKey, TASK_BACKLOG_ID) || dirty;

        const blDone = !!state[backlogKey]?.[TASK_BACKLOG_ID];
        if (blDone && !state[backlogKey]?.[doneAtKey(TASK_BACKLOG_ID)]) {
          state[backlogKey][doneAtKey(TASK_BACKLOG_ID)] = nowMs;
          dirty = true;
        }
      }

      if (dirty) store.save(STORAGE_KEY, state);

      /* ================= Build Rows ================= */
      const rows = [];

      // Payroll row
      if (payrollWedToShow) {
        const key = dateKey(payrollWedToShow);
        dirty = ensureTask(state, key, TASK_PAYROLL_ID) || dirty;

        const done = !!state[key]?.[TASK_PAYROLL_ID];
        const expired = done && isExpired(state, key, TASK_PAYROLL_ID, nowMs);
        if (!expired) rows.push(buildRow(payrollDef, key, "payroll-row"));
      }

      // Schedule row
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);
        dirty = ensureTask(state, schedKey, TASK_SCHEDULE_ID) || dirty;

        const done = !!state[schedKey]?.[TASK_SCHEDULE_ID];
        const expired = done && isExpired(state, schedKey, TASK_SCHEDULE_ID, nowMs);
        if (!expired) rows.push(buildRow(schedDef, schedKey, "weekly-row"));
      }

      // Backlog row
      if (showBacklog) {
        rows.push(buildRow(blDef, backlogKey, "weekly-row"));
      }

      if (!rows.length) {
        slot.innerHTML = "";
        return;
      }

      slot.innerHTML = buildHTML(cfg, weekLabel, rows.join(""));

      const card = slot.querySelector('[data-widget="weekly"]');
      if (!card) return;

      /* ================= Apply Row State ================= */

      // Payroll
      if (payrollWedToShow) {
        const key = dateKey(payrollWedToShow);
        const done = !!state[key]?.[TASK_PAYROLL_ID];
        const overdue = (now >= payrollOverdueStart(payrollWedToShow) && !done);

        const row = card.querySelector(`.toggle-row[data-task-id="${TASK_PAYROLL_ID}"][data-scope-key="${key}"]`);
        if (row) setRowState(row, done, overdue);
      }

      // Schedule
      if (schedTargetMonToShow) {
        const schedKey = dateKey(schedTargetMonToShow);
        const done = !!state[schedKey]?.[TASK_SCHEDULE_ID];
        const overdue = (now >= scheduleOverdueStart(schedTargetMonToShow) && !done);

        const row = card.querySelector(`.toggle-row[data-task-id="${TASK_SCHEDULE_ID}"][data-scope-key="${schedKey}"]`);
        if (row) setRowState(row, done, overdue);
      }

      // Backlog
      if (showBacklog) {
        const done = !!state[backlogKey]?.[TASK_BACKLOG_ID];
        const overdue = (now >= backlogAngryStart(curWeekMon) && !done);

        const row = card.querySelector(`.toggle-row[data-task-id="${TASK_BACKLOG_ID}"][data-scope-key="${backlogKey}"]`);
        if (row) setRowState(row, done, overdue);
      }

      // If we dirtied state while building rows (rare), persist once.
      if (dirty) store.save(STORAGE_KEY, state);
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

    // Keep it time-aware (Wed/Thu rollover + noon cutoff + midnight disappear)
    setInterval(rerender, 60 * 1000);
  }

  window.PortalWidgets.Weekly = { init };
})();
