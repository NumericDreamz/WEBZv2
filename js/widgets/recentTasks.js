/* ========================================================= */
/* ================= recentTasks.js (Widget) =============== */
/* ========================================================= */
/*
  Purpose:
    Quick "Recent tasks" scratchpad with midnight rollover.

  Behavior:
    - Pending tasks show a toggle switch.
    - Completed tasks show the green "Complete" pill.
    - At midnight (local time):
        - Tasks completed before midnight are removed.
        - Any still-pending tasks become OVERDUE (angry flashing) until completed.

  Storage:
    STORAGE_KEY: portal_recent_tasks_v2
    State: { items: [{ id, text, createdAt, completed, completedAt }] }

  External deps:
    window.PortalApp.Storage (load/save) if available
*/

/* ========================================================= */
/* ================= Config / Globals ====================== */
/* ========================================================= */
(function () {
  "use strict";

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_recent_tasks_v2";
  const MAX_ITEMS = 60;

  /* ========================================================= */
  /* ======================= Utilities ======================= */
  /* ========================================================= */
  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escAttr(s) {
    return esc(String(s)).replaceAll("`", "&#096;");
  }

  function startOfDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function msUntilNextMidnight(now = new Date()) {
    const next = new Date(now);
    next.setHours(24, 0, 0, 50); // tiny buffer after midnight
    return Math.max(250, next.getTime() - now.getTime());
  }

  function uid() {
    // Good enough for a tiny widget. We're not launching rockets.
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function normalizeName(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
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

  /* ========================================================= */
  /* ================== State Normalization ================== */
  /* ========================================================= */
  function normalizeItem(it) {
    if (!it || typeof it !== "object") return null;

    const text =
      normalizeName(it.text ?? it.title ?? it.task ?? it.label ?? "");

    if (!text) return null;

    const createdAt = Number(it.createdAt ?? it.created ?? it.ts ?? Date.now());
    const completed = !!(it.completed ?? it.done ?? false);

    let completedAt = it.completedAt ?? it.doneAt ?? null;
    completedAt = (completedAt == null) ? null : Number(completedAt);

    return {
      id: String(it.id ?? uid()),
      text,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      completed,
      completedAt: completed
        ? (Number.isFinite(completedAt) ? completedAt : Date.now())
        : null
    };
  }

  function normalizeState(raw) {
    // Accept {items:[]} or legacy [] formats
    const obj = (raw && typeof raw === "object") ? raw : {};
    const arr = Array.isArray(obj.items)
      ? obj.items
      : (Array.isArray(raw) ? raw : []);

    const items = arr
      .map(normalizeItem)
      .filter(Boolean);

    return { items };
  }

  function prune(state) {
    if (!state || !Array.isArray(state.items)) return;
    if (state.items.length > MAX_ITEMS) {
      state.items = state.items.slice(state.items.length - MAX_ITEMS);
    }
  }

  /* ========================================================= */
  /* ================= Midnight Rollover ===================== */
  /* ========================================================= */
  function isOverdue(item, nowTs) {
    // If it existed before today's midnight and it's still not done, it's overdue.
    return !item.completed && item.createdAt < startOfDay(nowTs);
  }

  function rollover(state, nowTs) {
    const sod = startOfDay(nowTs);
    const before = state.items.length;

    // Remove items completed before today started (midnight)
    state.items = state.items.filter((it) => {
      if (!it.completed) return true;
      if (!Number.isFinite(it.completedAt)) return true;
      return it.completedAt >= sod;
    });

    prune(state);
    return state.items.length !== before;
  }

  /* ========================================================= */
  /* =================== Render / Template =================== */
  /* ========================================================= */
  function buildHTML(state, now) {
    const nowTs = now.getTime();

    const rows = state.items
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((it) => {
        const overdue = isOverdue(it, nowTs);
        const rowCls = `toggle-row rt-row${overdue ? " rt-overdue" : ""}`;
        const label = esc(it.text);

        const right = it.completed
          ? `
            <div class="status-pill status-good" aria-label="Complete">
              <span class="status-dot"></span>
              <span class="status-text">Complete</span>
            </div>
          `
          : `
            <label class="switch" aria-label="Mark complete: ${label}">
              <input type="checkbox" data-action="toggle" data-id="${escAttr(it.id)}">
              <span class="slider"></span>
            </label>
          `;

        return `
          <div class="${rowCls}" data-id="${escAttr(it.id)}">
            <div class="toggle-left">
              <div class="toggle-title">${label}</div>
            </div>
            <div class="toggle-right rt-right">
              ${right}
            </div>
          </div>
        `;
      })
      .join("");

    const empty = `
      <div class="muted-box" style="margin-top:10px;">
        No recent tasks. Add one with <b>+</b>.
      </div>
    `;

    return `
      <section class="metrics-card recent-tasks" data-widget="recent">
        <div class="widget-head recent-header">
          <h2>Recent</h2>
          <div class="rt-head-right">
            <div class="daily-progress">Clears @ midnight</div>
            <button class="btn" type="button" data-action="open-add" aria-label="Add task">+</button>
          </div>
        </div>

        <div class="recent-list">
          ${rows || empty}
        </div>

        <!-- Modal -->
        <div class="rt-modal-backdrop" data-role="rt-modal">
          <div class="rt-modal" role="dialog" aria-modal="true" aria-label="Add task">
            <div class="rt-modal-head">
              <div class="rt-modal-title">Add a task</div>
              <button class="btn subtle" type="button" data-action="close-modal">Close</button>
            </div>

            <input class="rt-input" type="text" data-role="rt-input" placeholder="Type the task…" />

            <div class="rt-modal-actions">
              <button class="btn subtle" type="button" data-action="close-modal">Cancel</button>
              <button class="btn subtle" type="button" data-action="add-task">Add</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render(slot, state) {
    slot.innerHTML = buildHTML(state, new Date());
  }

  /* ========================================================= */
  /* =========================== Init ======================== */
  /* ========================================================= */
  window.PortalWidgets.RecentTasks = {
    init: function (slotId) {
      const slot = document.getElementById(slotId);
      if (!slot) return;

      // Prevent double-init
      if (slot.dataset.recentInited === "1") return;
      slot.dataset.recentInited = "1";

      const store = getStore();

      let state = normalizeState(store.load(STORAGE_KEY));
      rollover(state, Date.now());
      store.save(STORAGE_KEY, state);

      render(slot, state);

      let midnightTimer = null;

      function saveAndRender() {
        prune(state);
        store.save(STORAGE_KEY, state);
        render(slot, state);
      }

      function openModal() {
        const modal = slot.querySelector('[data-role="rt-modal"]');
        const input = slot.querySelector('[data-role="rt-input"]');
        if (!modal || !input) return;
        modal.classList.add("rt-open");
        input.value = "";
        setTimeout(() => input.focus(), 0);
      }

      function closeModal() {
        const modal = slot.querySelector('[data-role="rt-modal"]');
        if (!modal) return;
        modal.classList.remove("rt-open");
      }

      function scheduleMidnightTick() {
        if (midnightTimer) clearTimeout(midnightTimer);
        midnightTimer = setTimeout(() => {
          const changed = rollover(state, Date.now());
          if (changed) store.save(STORAGE_KEY, state);
          render(slot, state);
          scheduleMidnightTick();
        }, msUntilNextMidnight(new Date()));
      }

      scheduleMidnightTick();

      // Clicks (add/open/close/modal)
      slot.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) {
          // Click backdrop to close
          const backdrop = e.target.closest(".rt-modal-backdrop");
          if (backdrop && backdrop.classList.contains("rt-open")) closeModal();
          return;
        }

        const action = btn.dataset.action;

        if (action === "open-add") {
          openModal();
          return;
        }

        if (action === "close-modal") {
          closeModal();
          return;
        }

        if (action === "add-task") {
          const input = slot.querySelector('[data-role="rt-input"]');
          if (!input) return;

          const text = normalizeName(input.value);
          if (!text) return;

          state.items.push({
            id: uid(),
            text,
            createdAt: Date.now(),
            completed: false,
            completedAt: null
          });

          closeModal();
          saveAndRender();
          return;
        }
      });

      // Enter/Escape in modal input
      slot.addEventListener("keydown", (e) => {
        const modal = slot.querySelector('[data-role="rt-modal"]');
        if (!modal || !modal.classList.contains("rt-open")) return;

        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
          return;
        }

        if (e.key === "Enter") {
          const input = slot.querySelector('[data-role="rt-input"]');
          if (!input) return;

          const text = normalizeName(input.value);
          if (!text) return;

          state.items.push({
            id: uid(),
            text,
            createdAt: Date.now(),
            completed: false,
            completedAt: null
          });

          e.preventDefault();
          closeModal();
          saveAndRender();
        }
      });

      // Toggle completion
      slot.addEventListener("change", (e) => {
        const input = e.target.closest('input[data-action="toggle"]');
        if (!input) return;

        const id = input.dataset.id;
        if (!id) return;

        const hit = state.items.find((x) => x.id === id);
        if (!hit) return;

        hit.completed = !!input.checked;
        hit.completedAt = hit.completed ? Date.now() : null;

        saveAndRender();
      });
    }
  };
})();
