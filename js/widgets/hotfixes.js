/* ========================================================= */
/* ===================== hotfixes.js ======================= */
/* ========================================================= */
/*
  Fixes:
    - Monthly: add Eyes For Safety + Pulse Survey as working "standard toggles"
      without inserting extra stray "Monthly" text.
    - Weekly: add Payroll reminder that:
        * Appears every Wednesday (and stays until completed or dismissed)
        * Turns angry + flashes if still incomplete after Wednesday ends
        * Collapses green on complete
        * Derez at midnight AFTER completion (dismisses for the rest of the cycle)
*/

(function () {
  "use strict";

  const MONTHLY_KEY = "portal_monthly_custom_toggles_v1";
  const PAYROLL_KEY = "portal_weekly_payroll_v1";

  const MONTHLY_ITEMS = [
    { id: "eyes_for_safety", label: "Eyes For Safety" },
    { id: "pulse_survey",    label: "Pulse Survey" }
  ];

  function getStore() {
    // Whatever your app currently exposes, we use it.
    if (window.PortalApp && window.PortalApp.Storage) return window.PortalApp.Storage;

    // Fallback: raw localStorage
    return {
      load(key) {
        try { return JSON.parse(localStorage.getItem(key) || "null"); }
        catch { return null; }
      },
      save(key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function startOfDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function msUntilNextMidnight(now = new Date()) {
    const next = new Date(now);
    next.setHours(24, 0, 0, 50);
    return Math.max(250, next.getTime() - now.getTime());
  }

  function monthKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function injectStylesOnce() {
    if (document.getElementById("hotfixes-style")) return;

    const css = `
      /* Payroll: guaranteed flashing when overdue */
      @keyframes payrollFlash {
        0%   { transform: translateZ(0); filter: brightness(1); }
        50%  { transform: translateZ(0); filter: brightness(1.45); }
        100% { transform: translateZ(0); filter: brightness(1); }
      }
      .payroll-overdue {
        animation: payrollFlash 0.9s infinite;
      }

      /* Slight spacing so injected rows feel native */
      .custom-injected-row {
        margin-top: 0;
      }
    `;

    const style = document.createElement("style");
    style.id = "hotfixes-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function findRowContainer(slot) {
    // Try to find the container that already holds toggle rows
    const existingRow = slot.querySelector(".toggle-row");
    if (existingRow && existingRow.parentElement) return existingRow.parentElement;

    // Common containers (best-effort)
    const candidates = [
      ".toggle-rows",
      ".toggle-list",
      ".metrics-list",
      ".recent-list",
      ".widget-body",
      "section"
    ];
    for (const sel of candidates) {
      const el = slot.querySelector(sel);
      if (el) return el;
    }

    // Worst case: use the slot itself
    return slot;
  }

  function removeStrayMonthlyDivider(slot) {
    // You complained about an extra "Monthly" text wedged between toggles.
    // Keep the real header (usually in .widget-head). Kill the stray one(s).
    const all = Array.from(slot.querySelectorAll("*"));
    for (const el of all) {
      const t = (el.textContent || "").trim();
      if (t !== "Monthly") continue;

      // If it's inside a widget head/header, it's probably legit.
      const inHeader = !!el.closest(".widget-head, .widget-header, header");
      if (inHeader) continue;

      // If it has children, it's probably structural, skip.
      if (el.children && el.children.length) continue;

      el.remove();
    }
  }

  /* ------------------------------ */
  /* Monthly custom toggles         */
  /* ------------------------------ */
  function loadMonthlyState(store) {
    const raw = store.load(MONTHLY_KEY);
    const curKey = monthKey();

    const state = (raw && typeof raw === "object") ? raw : {};
    if (state.monthKey !== curKey) {
      // New month: reset
      state.monthKey = curKey;
      state.items = {};
    }
    if (!state.items || typeof state.items !== "object") state.items = {};

    for (const it of MONTHLY_ITEMS) {
      const v = state.items[it.id] || {};
      state.items[it.id] = {
        completed: !!v.completed,
        completedAt: Number.isFinite(v.completedAt) ? v.completedAt : null
      };
    }

    return state;
  }

  function buildStandardRowHTML(id, label, completed, extraRowClass) {
    const safeLabel = esc(label);
    const rowCls = `toggle-row custom-injected-row ${extraRowClass || ""}`.trim();

    const right = completed
      ? `
        <div class="status-pill status-good" aria-label="Complete">
          <span class="status-dot"></span>
          <span class="status-text">Complete</span>
        </div>
      `
      : `
        <label class="switch" aria-label="Mark complete: ${safeLabel}">
          <input type="checkbox" data-action="hotfix-toggle" data-id="${esc(id)}">
          <span class="slider"></span>
        </label>
      `;

    return `
      <div class="${rowCls}" data-hotfix-row="${esc(id)}">
        <div class="toggle-left">
          <div class="toggle-title">${safeLabel}</div>
        </div>
        <div class="toggle-right">
          ${right}
        </div>
      </div>
    `;
  }

  function ensureMonthly(slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    removeStrayMonthlyDivider(slot);

    const store = getStore();
    const state = loadMonthlyState(store);

    // Remove any prior broken/injected versions of these rows so we don't duplicate.
    for (const it of MONTHLY_ITEMS) {
      const old = slot.querySelector(`[data-hotfix-row="${it.id}"]`);
      if (old) old.remove();

      // Also remove rows by label match (in case previous code used different markers)
      const rows = Array.from(slot.querySelectorAll(".toggle-row"));
      for (const r of rows) {
        const title = (r.querySelector(".toggle-title")?.textContent || "").trim();
        if (title === it.label && !r.hasAttribute("data-hotfix-row")) {
          r.remove();
        }
      }
    }

    const container = findRowContainer(slot);

    // Append our two toggles at the end of whatever list the Monthly widget uses.
    const frag = document.createElement("div");
    frag.innerHTML = MONTHLY_ITEMS.map((it) => {
      const v = state.items[it.id];
      return buildStandardRowHTML(it.id, it.label, v.completed, "");
    }).join("");

    // Stick them in a wrapper so we can keep track
    let wrap = slot.querySelector('[data-hotfix-wrap="monthly"]');
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.setAttribute("data-hotfix-wrap", "monthly");
      container.appendChild(wrap);
    }
    wrap.innerHTML = frag.innerHTML;

    // Save normalized state once (keeps remote consistent)
    store.save(MONTHLY_KEY, state);

    // Wire events once
    if (slot.dataset.hotfixMonthlyWired === "1") return;
    slot.dataset.hotfixMonthlyWired = "1";

    slot.addEventListener("change", (e) => {
      const input = e.target && e.target.closest && e.target.closest('input[data-action="hotfix-toggle"]');
      if (!input) return;

      const id = input.dataset.id;
      const hit = MONTHLY_ITEMS.find(x => x.id === id);
      if (!hit) return;

      const cur = loadMonthlyState(store);
      cur.items[id].completed = true;
      cur.items[id].completedAt = Date.now();
      store.save(MONTHLY_KEY, cur);

      // Re-render just monthly injection
      ensureMonthly(slotId);
    }, true); // capture: survive other handlers trying to be clever
  }

  /* ------------------------------ */
  /* Weekly Payroll reminder         */
  /* ------------------------------ */
  function getWeekStartMonday(d = new Date()) {
    // Monday-based week start at 00:00
    const x = new Date(d);
    const day = x.getDay(); // 0 Sun .. 6 Sat
    const mondayIndex = (day + 6) % 7; // Mon=0 .. Sun=6
    x.setDate(x.getDate() - mondayIndex);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function getThisWeekWednesdayStart(d = new Date()) {
    const ws = getWeekStartMonday(d);
    const wed = new Date(ws);
    wed.setDate(wed.getDate() + 2); // Monday + 2 = Wednesday
    wed.setHours(0, 0, 0, 0);
    return wed;
  }

  function payrollCycleKey(wedDate) {
    const y = wedDate.getFullYear();
    const m = String(wedDate.getMonth() + 1).padStart(2, "0");
    const da = String(wedDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`; // YYYY-MM-DD (Wednesday)
  }

  function loadPayrollState(store, cycleKey) {
    const raw = store.load(PAYROLL_KEY);
    const state = (raw && typeof raw === "object") ? raw : {};

    if (state.cycleKey !== cycleKey) {
      state.cycleKey = cycleKey;
      state.completed = false;
      state.completedAt = null;
      state.dismissed = false;
    }

    state.completed = !!state.completed;
    state.completedAt = Number.isFinite(state.completedAt) ? state.completedAt : null;
    state.dismissed = !!state.dismissed;

    // Midnight derez rule: if it was completed before today's midnight, dismiss it.
    if (state.completed && state.completedAt != null) {
      const sod = startOfDay(Date.now());
      if (state.completedAt < sod) {
        state.completed = false;   // it’s done, we’re just not nagging anymore this cycle
        state.completedAt = null;
        state.dismissed = true;
      }
    }

    return state;
  }

  function ensurePayroll(slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    const store = getStore();
    const now = new Date();
    const wedStart = getThisWeekWednesdayStart(now);
    const cycleKey = payrollCycleKey(wedStart);

    // Only show starting Wednesday of THIS week (Mon/Tue: hide)
    if (now.getTime() < wedStart.getTime()) {
      const wrap = slot.querySelector('[data-hotfix-wrap="payroll"]');
      if (wrap) wrap.remove();
      return;
    }

    const state = loadPayrollState(store, cycleKey);
    store.save(PAYROLL_KEY, state);

    // If dismissed for this cycle, don’t show it.
    if (state.dismissed) {
      const wrap = slot.querySelector('[data-hotfix-wrap="payroll"]');
      if (wrap) wrap.remove();
      return;
    }

    // Overdue if it’s after Wednesday ends (Thu 00:00+) and still incomplete
    const overdue = (!state.completed) && (now.getTime() >= (wedStart.getTime() + 24 * 60 * 60 * 1000));

    // Remove any prior broken/injected payroll rows by label match
    const rows = Array.from(slot.querySelectorAll(".toggle-row"));
    for (const r of rows) {
      const title = (r.querySelector(".toggle-title")?.textContent || "").trim();
      if (title === "Payroll" && !r.closest('[data-hotfix-wrap="payroll"]')) {
        r.remove();
      }
    }

    const container = findRowContainer(slot);

    let wrap = slot.querySelector('[data-hotfix-wrap="payroll"]');
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.setAttribute("data-hotfix-wrap", "payroll");
      container.insertBefore(wrap, container.firstChild); // put near top of Weekly
    }

    const extraClass = overdue ? "rt-overdue payroll-overdue" : "";
    wrap.innerHTML = buildStandardRowHTML("payroll", "Payroll", state.completed, extraClass);

    // Wire events once
    if (slot.dataset.hotfixPayrollWired !== "1") {
      slot.dataset.hotfixPayrollWired = "1";

      slot.addEventListener("change", (e) => {
        const input = e.target && e.target.closest && e.target.closest('input[data-action="hotfix-toggle"]');
        if (!input) return;

        const id = input.dataset.id;
        if (id !== "payroll") return;

        const cur = loadPayrollState(store, payrollCycleKey(getThisWeekWednesdayStart(new Date())));
        cur.completed = true;
        cur.completedAt = Date.now();
        cur.dismissed = false;
        store.save(PAYROLL_KEY, cur);

        ensurePayroll(slotId);
      }, true);
    }
  }

  function scheduleMidnight(slotMonthly, slotWeekly) {
    // one timer to rule them all
    if (document.documentElement.dataset.hotfixMidnight === "1") return;
    document.documentElement.dataset.hotfixMidnight = "1";

    let t = null;
    const tick = () => {
      // Re-apply midnight rules
      ensureMonthly(slotMonthly);
      ensurePayroll(slotWeekly);

      t = setTimeout(tick, msUntilNextMidnight(new Date()));
    };

    t = setTimeout(tick, msUntilNextMidnight(new Date()));
  }

  function boot() {
    injectStylesOnce();

    const monthlySlotId = "monthly-metrics-slot";
    const weeklySlotId = "weekly-metrics-slot";

    // Observe re-renders and re-inject as needed (without turning into a CPU space heater)
    const mo = new MutationObserver(() => {
      // micro-debounce
      clearTimeout(boot._r);
      boot._r = setTimeout(() => {
        ensureMonthly(monthlySlotId);
        ensurePayroll(weeklySlotId);
      }, 60);
    });

    const ms = document.getElementById(monthlySlotId);
    const ws = document.getElementById(weeklySlotId);

    if (ms) mo.observe(ms, { childList: true, subtree: true });
    if (ws) mo.observe(ws, { childList: true, subtree: true });

    ensureMonthly(monthlySlotId);
    ensurePayroll(weeklySlotId);
    scheduleMidnight(monthlySlotId, weeklySlotId);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();