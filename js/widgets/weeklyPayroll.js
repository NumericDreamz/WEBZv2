
/* ========================================================= */
/* ============== weeklyPayroll.js (Addon Row) ============== */
/* ========================================================= */
/*
  Injects a Payroll reminder row into the Weekly widget.

  Rules:
    - Appears starting Wednesday (cycle anchored to most recent Wed 00:00).
    - If incomplete after midnight (Thu 00:00), becomes "angry" (overdue).
    - On completion: collapses green.
    - At midnight after completion day: disappears until next Wednesday cycle.

  Storage:
    portal_weekly_payroll_v1
    { cycleKey: "YYYY-MM-DD", completed: boolean, completedAt: number|null }
*/

(function () {
  "use strict";

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_weekly_payroll_v1";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function ymd(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

  function getFallbackStore() {
    return {
      load(key) {
        try {
          return JSON.parse(localStorage.getItem(key) || "null");
        } catch {
          return null;
        }
      },
      save(key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function getStore() {
    return window.PortalApp?.Storage || getFallbackStore();
  }

  // JS: 0=Sun,1=Mon,2=Tue,3=Wed...
  function getCycleStartWednesday(now = new Date()) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const delta = (day - 3 + 7) % 7; // days since Wed
    d.setDate(d.getDate() - delta);
    return d;
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyleOnce() {
    if (document.getElementById("weekly-payroll-style")) return;
    const css = `
      .payroll-row-wrap { margin-top: 10px; }
      .payroll-collapsed { opacity: 0.95; }

      /* Overdue payroll: reuse the aggressive weekly overdue look */
      .payroll-row.payroll-overdue {
        border-color: #ff3b3b;
        box-shadow: 0 0 0 2px rgba(255, 59, 59, .28) inset,
                    0 0 18px rgba(255, 0, 0, .18);
        animation: weeklyRage 0.65s infinite;
      }
      .payroll-row.payroll-overdue .slider {
        background: #5a0000;
        border-color: #ff3b3b;
      }
      .payroll-row.payroll-overdue .slider:before {
        background: #ffd1d1;
      }
    `;
    const style = document.createElement("style");
    style.id = "weekly-payroll-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildRowHTML(state, now) {
    const nowTs = now.getTime();
    const cycleStart = getCycleStartWednesday(now);
    const cycleKey = ymd(cycleStart);

    if (!state || typeof state !== "object") state = {};

    // Reset for a new cycle
    if (state.cycleKey !== cycleKey) {
      state.cycleKey = cycleKey;
      state.completed = false;
      state.completedAt = null;
    }

    const completed = !!state.completed;
    const completedAt = Number(state.completedAt || 0) || null;

    // If completed, only show the green collapsed row on the completion day.
    // After midnight rolls, it vanishes until next cycle.
    if (completed && completedAt && startOfDay(completedAt) < startOfDay(nowTs)) {
      return { html: "", visible: false };
    }

    // Overdue if it's after Wednesday ends (Thu 00:00+) and not completed
    const overdue = !completed && (nowTs >= (cycleStart.getTime() + 24 * 60 * 60 * 1000));

    const rowCls = [
      "toggle-row",
      "rt-row",
      "payroll-row",
      overdue ? "rt-overdue payroll-overdue" : "",
      completed ? "payroll-collapsed" : ""
    ].filter(Boolean).join(" ");

    const right = completed
      ? `
        <div class="status-pill status-good" aria-label="Complete">
          <span class="status-dot"></span>
          <span class="status-text">Complete</span>
        </div>
      `
      : `
        <label class="switch" aria-label="Mark complete: Payroll">
          <input type="checkbox" data-action="payroll-toggle">
          <span class="slider"></span>
        </label>
      `;

    const html = `
      <div class="payroll-row-wrap" data-role="payroll-wrap">
        <div class="${rowCls}">
          <div class="toggle-left">
            <div class="toggle-title">${esc("Payroll")}</div>
          </div>
          <div class="toggle-right rt-right">
            ${right}
          </div>
        </div>
      </div>
    `;

    return { html, visible: true };
  }

  function pickInsertionHost(slot) {
    const card = slot.querySelector(".metrics-card") || slot.firstElementChild;
    if (!card) return slot;

    const list =
      card.querySelector(".recent-list")   ||
      card.querySelector(".toggle-list")   ||
      card.querySelector(".metrics-list")  ||
      card;

    return list || slot;
  }

  window.PortalWidgets.WeeklyPayroll = {
    init(slotId) {
      ensureStyleOnce();

      const slot = document.getElementById(slotId);
      if (!slot) return;

      if (slot.dataset.weeklyPayrollInited === "1") return;
      slot.dataset.weeklyPayrollInited = "1";

      const store = getStore();

      let state = store.load(STORAGE_KEY) || {};
      if (typeof state !== "object" || state == null) state = {};

      let host = null;
      let midnightTimer = null;

      function save() {
        store.save(STORAGE_KEY, state);
      }

      function render() {
        host = pickInsertionHost(slot);

        const prev = slot.querySelector('[data-role="payroll-wrap"]');
        if (prev) prev.remove();

        const now = new Date();
        const built = buildRowHTML(state, now);

        if (!built.visible) {
          save();
          return;
        }

        const wrap = document.createElement("div");
        wrap.innerHTML = built.html;
        const node = wrap.firstElementChild;
        if (!node) return;

        host.appendChild(node);
        save();
      }

      function scheduleMidnight() {
        if (midnightTimer) clearTimeout(midnightTimer);
        midnightTimer = setTimeout(() => {
          render();
          scheduleMidnight();
        }, msUntilNextMidnight(new Date()));
      }

      const obs = new MutationObserver(() => {
        setTimeout(render, 0);
      });
      obs.observe(slot, { childList: true, subtree: true });

      slot.addEventListener("change", (e) => {
        const input = e.target.closest('input[data-action="payroll-toggle"]');
        if (!input) return;

        state.completed = !!input.checked;
        state.completedAt = state.completed ? Date.now() : null;
        render();
      });

      render();
      scheduleMidnight();
    }
  };
})();
