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

  Migration:
    - Pulls legacy state from: portal_recent_tasks_v1
    - Writes normalized state into: portal_recent_tasks_v2
    - Runs once (tracked in state._migratedFromV1)

  Storage:
    STORAGE_KEY: portal_recent_tasks_v2
    State: { items: [{ id, text, createdAt, completed, completedAt }], _migratedFromV1?: true }

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
  const LEGACY_KEY_V1 = "portal_recent_tasks_v1";

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

  function normalizeText(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }

  function startOfDay(ts = Date.now()) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function msUntilNextMidnight(now = new Date()) {
    const next = new Date(now);
    next.setHours(24, 0, 0, 50); // small buffer after midnight
    return Math.max(250, next.getTime() - now.getTime());
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function hash36(str) {
    // small deterministic hash, good enough for stable IDs
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  function stableIdFrom(text, createdAt) {
    const t = normalizeText(text).toLowerCase();
    const c = Number(createdAt) || 0;
    return `legacy_${hash36(t)}_${Math.floor(c / 1000)}`;
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

  function safeParse(raw) {
    try {
      const v = JSON.parse(raw);
      return (v && typeof v === "object") ? v : null;
    } catch {
      return null;
    }
  }

  /* ========================================================= */
  /* ================== State Normalization ================== */
  /* ========================================================= */
  function normalizeItem(it) {
    // Accept many legacy shapes (objects, strings, etc.)
    if (it == null) return null;

    if (typeof it === "string") {
      const t = normalizeText(it);
      if (!t) return null;
      const now = Date.now();
      return {
        id: stableIdFrom(t, now),
        text: t,
        createdAt: now,
        completed: false,
        completedAt: null
      };
    }

    if (typeof it !== "object") return null;

    const text = normalizeText(it.text ?? it.title ?? it.task ?? it.label ?? "");
    if (!text) return null;

    const createdAt = Number(it.createdAt ?? it.created ?? it.ts ?? Date.now());
    const completed = !!(it.completed ?? it.done ?? false);

    let completedAt = it.completedAt ?? it.doneAt ?? null;
    completedAt = (completedAt == null) ? null : Number(completedAt);

    const ca = Number.isFinite(createdAt) ? createdAt : Date.now();
    const id = String(it.id ?? stableIdFrom(text, ca) ?? uid());

    return {
      id,
      text,
      createdAt: ca,
      completed,
      completedAt: completed
        ? (Number.isFinite(completedAt) ? completedAt : Date.now())
        : null
    };
  }

  function normalizeState(raw) {
    // Accept:
    // - { items: [...] }
    // - legacy [] (array directly)
    // - garbage -> empty
    const obj = (raw && typeof raw === "object") ? raw : {};
    const arr = Array.isArray(obj.items)
      ? obj.items
      : (Array.isArray(raw) ? raw : []);

    const items = arr.map(normalizeItem).filter(Boolean);

    return {
      items,
      _migratedFromV1: !!obj._migratedFromV1
    };
  }

  function prune(state) {
    if (!state || !Array.isArray(state.items)) return;
    if (state.items.length > MAX_ITEMS) {
      state.items = state.items.slice(0, MAX_ITEMS); // newest first
    }
  }

  function mergeItems(dst, src) {
    // Dedupe by id, prefer "more complete" record
    const map = new Map();
    dst.forEach(it => map.set(it.id, it));

    src.forEach(it => {
      const cur = map.get(it.id);
      if (!cur) {
        map.set(it.id, it);
        return;
      }

      // Merge: keep earliest createdAt, and keep completion if either is completed
      cur.createdAt = Math.min(cur.createdAt || it.createdAt, it.createdAt);
      cur.text = cur.text || it.text;

      const curDone = !!cur.completed;
      const itDone = !!it.completed;

      if (!curDone && itDone) {
        cur.completed = true;
        cur.completedAt = it.completedAt || Date.now();
      }
      if (curDone && !Number.isFinite(cur.completedAt) && Number.isFinite(it.completedAt)) {
        cur.completedAt = it.completedAt;
      }
    });

    // Return newest-first list
    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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

    // Keep ordering newest-first
    state.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    prune(state);
    return state.items.length !== before;
  }

  /* ========================================================= */
  /* ====================== Migration ======================== */
  /* ========================================================= */
  function loadLegacyV1(store) {
    // Try store.load first (in case it exists in master), then raw localStorage.
    const fromStore = store.load(LEGACY_KEY_V1);
    if (fromStore) return fromStore;

    const raw = localStorage.getItem(LEGACY_KEY_V1);
    if (!raw) return null;

    return safeParse(raw);
  }

  function migrateIfNeeded(store, state) {
    if (state._migratedFromV1) return false;

    const legacyRaw = loadLegacyV1(store);
    if (!legacyRaw) {
      state._migratedFromV1 = true;
      return true;
    }

    const legacyState = normalizeState(legacyRaw);

    if (legacyState.items.length) {
      state.items = mergeItems(state.items, legacyState.items);
    }

    state._migratedFromV1 = true;
    prune(state);
    return true;
  }

  /* ========================================================= */
  /* =================== Render / Template =================== */
  /* ========================================================= */
  function buildHTML(state, now) {
    const nowTs = now.getTime();

    const rows = state.items
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) // newest first
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
        <div class="rt-modal-backdrop" data-role="rt-modal" aria-hidden="true">
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

      // Load v2 state
      let state = normalizeState(store.load(STORAGE_KEY));

      // Migrate from v1 once
      const didMigrate = migrateIfNeeded(store, state);

      // Apply rollover rules immediately
      rollover(state, Date.now());

      // Save v2
      prune(state);
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
        modal.setAttribute("aria-hidden", "false");
        input.value = "";
        setTimeout(() => input.focus(), 0);
      }

      function closeModal() {
        const modal = slot.querySelector('[data-role="rt-modal"]');
        if (!modal) return;
        modal.classList.remove("rt-open");
        modal.setAttribute("aria-hidden", "true");
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

      /* ========================================================= */
      /* ======================= Events ========================== */
      /* ========================================================= */

      // Clicks (add/open/close/modal + backdrop)
      slot.addEventListener("click", (e) => {
        // Backdrop click closes only if you clicked the backdrop itself
        const backdrop = slot.querySelector('[data-role="rt-modal"]');
        if (backdrop && e.target === backdrop && backdrop.classList.contains("rt-open")) {
          closeModal();
          return;
        }

        const btn = e.target.closest("button");
        if (!btn) return;

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

          const text = normalizeText(input.value);
          if (!text) return;

          state.items.unshift({
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
        const backdrop = slot.querySelector('[data-role="rt-modal"]');
        if (!backdrop || !backdrop.classList.contains("rt-open")) return;

        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
          return;
        }

        if (e.key === "Enter") {
          const input = slot.querySelector('[data-role="rt-input"]');
          if (!input) return;

          const text = normalizeText(input.value);
          if (!text) return;

          state.items.unshift({
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
