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
        - Any still-pending tasks created before midnight become OVERDUE (flashing) until completed.

  Storage:
    STORAGE_KEY: portal_recent_tasks_v2
    State: { items: [{ id, text, createdAt, completed, completedAt }], _migratedFromV1?: true }

  Notes:
    - Supports sync OR async Storage.load/save (Promises).
    - Robust timestamp parsing for Google Sheets / Apps Script strings.
    - Avoids overwriting remote state with empty state during first paint/hydration.
*/

(function () {
  "use strict";

  console.log("[RecentTasks] build 2026-01-30_01");

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
    next.setHours(24, 0, 0, 50); // tiny buffer after midnight
    return Math.max(250, next.getTime() - now.getTime());
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function hash36(str) {
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

  function stableIdFromTextOnly(text) {
    const t = normalizeText(text).toLowerCase();
    return `t_${hash36(t)}`;
  }

  function isThenable(v) {
    return v && (typeof v === "object" || typeof v === "function") && typeof v.then === "function";
  }

  function safeParse(raw) {
    try {
      const v = JSON.parse(raw);
      return (v && typeof v === "object") ? v : null;
    } catch {
      return null;
    }
  }

  function maybeParseJSON(v) {
    if (typeof v !== "string") return v;
    const parsed = safeParse(v);
    return parsed ?? v;
  }

  function toBool(v) {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      return s === "true" || s === "yes" || s === "y" || s === "1" || s === "done" || s === "complete";
    }
    return false;
  }

  function toMs(v, fallback = null) {
    if (v == null) return fallback;

    if (typeof v === "number" && Number.isFinite(v)) return v;

    if (v instanceof Date) {
      const t = v.getTime();
      return Number.isFinite(t) ? t : fallback;
    }

    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return fallback;

      // Numeric string
      if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : fallback;
      }

      // ISO / locale date string
      const p = Date.parse(s);
      return Number.isNaN(p) ? fallback : p;
    }

    return fallback;
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

  async function storeLoad(store, key) {
    try {
      let v = store.load(key);
      if (isThenable(v)) v = await v;
      return maybeParseJSON(v);
    } catch {
      return null;
    }
  }

  async function storeSave(store, key, val) {
    try {
      const r = store.save(key, val);
      if (isThenable(r)) await r;
    } catch {
      // keep UI alive even if persistence is acting feral
    }
  }

  /* ========================================================= */
  /* ================== State Normalization ================== */
  /* ========================================================= */
  function normalizeItem(it) {
    if (it == null) return null;

    // string-only legacy
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

    const createdAtRaw =
      it.createdAt ?? it.created ?? it.ts ?? it.timeCreated ?? it.created_on ?? it.createdOn ?? null;

    const completedRaw =
      it.completed ?? it.done ?? it.isComplete ?? it.complete ?? it.status ?? false;

    const completedAtRaw =
      it.completedAt ?? it.doneAt ?? it.timeCompleted ?? it.completed_on ?? it.completedOn ?? null;

    let createdAt = toMs(createdAtRaw, null);
    const completed = toBool(completedRaw);
    let completedAt = toMs(completedAtRaw, null);

    // Prefer stability. If createdAt is missing/unparseable, use 0 (epoch) so it doesn't reshuffle as "now" every load.
    if (!Number.isFinite(createdAt)) createdAt = 0;

    // If completed but timestamp missing, keep null (rollover will use createdAt as fallback when deciding what to clear).
    if (completed && !Number.isFinite(completedAt)) completedAt = null;
    if (!completed) completedAt = null;

    const id =
      (it.id != null && String(it.id)) ||
      (createdAt > 0 ? stableIdFrom(text, createdAt) : stableIdFromTextOnly(text));

    return {
      id,
      text,
      createdAt,
      completed,
      completedAt
    };
  }

  function normalizeState(raw) {
    // Accept:
    // - { items: [...] }
    // - legacy [] (array directly)
    // - stringified JSON
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
    state.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (state.items.length > MAX_ITEMS) {
      state.items = state.items.slice(0, MAX_ITEMS);
    }
  }

  function mergeItems(dst, src) {
    const map = new Map();
    dst.forEach(it => map.set(it.id, it));

    src.forEach(it => {
      const cur = map.get(it.id);
      if (!cur) {
        map.set(it.id, it);
        return;
      }

      // earliest createdAt wins, non-empty text wins
      cur.createdAt = Math.min(cur.createdAt || it.createdAt || 0, it.createdAt || 0) || (cur.createdAt || it.createdAt || 0);
      cur.text = cur.text || it.text;

      const curDone = !!cur.completed;
      const itDone = !!it.completed;

      if (!curDone && itDone) {
        cur.completed = true;
        cur.completedAt = it.completedAt ?? null;
      }

      // if either has a valid completedAt, keep it
      if (cur.completed && !Number.isFinite(cur.completedAt) && Number.isFinite(it.completedAt)) {
        cur.completedAt = it.completedAt;
      }
    });

    return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  /* ========================================================= */
  /* ================= Midnight Rollover ===================== */
  /* ========================================================= */
  function isOverdue(item, nowTs) {
    return !item.completed && (item.createdAt || 0) < startOfDay(nowTs);
  }

  function rollover(state, nowTs) {
    const sod = startOfDay(nowTs);
    const before = state.items.length;

    state.items = state.items.filter((it) => {
      if (!it.completed) return true;

      // Effective completion time:
      // - prefer completedAt if valid
      // - else fall back to createdAt (useful when remote data omitted completedAt)
      const eff = Number.isFinite(it.completedAt)
        ? it.completedAt
        : (Number.isFinite(it.createdAt) ? it.createdAt : NaN);

      // If we still can't decide, keep it (better than deleting unexpectedly)
      if (!Number.isFinite(eff)) return true;

      // Clear anything completed before today's midnight
      return eff >= sod;
    });

    prune(state);
    return state.items.length !== before;
  }

  /* ========================================================= */
  /* ====================== Migration ======================== */
  /* ========================================================= */
  async function loadLegacyV1(store) {
    const fromStore = await storeLoad(store, LEGACY_KEY_V1);
    if (fromStore) return fromStore;

    const raw = localStorage.getItem(LEGACY_KEY_V1);
    if (!raw) return null;

    return safeParse(raw);
  }

  async function migrateIfNeeded(store, state) {
    if (state._migratedFromV1) return false;

    const legacyRaw = await loadLegacyV1(store);
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
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
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
            <button class="btn" type="button" data-action="open-add" aria-label="Add task">+</button>
          </div>
        </div>

        <div class="recent-list">
          ${rows || empty}
        </div>

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

      if (slot.dataset.recentInited === "1") return;
      slot.dataset.recentInited = "1";

      const store = getStore();

      let state = { items: [], _migratedFromV1: false };
      let ready = false;

      let midnightTimer = null;
      let saveTimer = null;

      function queueSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          prune(state);
          storeSave(store, STORAGE_KEY, state);
        }, 250);
      }

      function saveAndRender() {
        prune(state);
        render(slot, state);
        queueSave();
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
          render(slot, state);
          if (changed) queueSave();
          scheduleMidnightTick();
        }, msUntilNextMidnight(new Date()));
      }

      // Events
      slot.addEventListener("click", (e) => {
        if (!ready) return;

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
        }
      });

      slot.addEventListener("keydown", (e) => {
        if (!ready) return;

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

      slot.addEventListener("change", (e) => {
        if (!ready) return;

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

      // Initial render so UI isn't blank
      render(slot, state);

      // Boot (async-safe)
      (async () => {
        const rawV2 = await storeLoad(store, STORAGE_KEY);
        const hadExistingV2 = rawV2 != null;

        state = normalizeState(rawV2);

        let mutated = false;
        mutated = (await migrateIfNeeded(store, state)) || mutated;
        mutated = rollover(state, Date.now()) || mutated;
        prune(state);

        // Key behavior: do NOT auto-save empty state when nothing actually loaded.
        // That’s how remote data gets wiped during hydration or partial init.
        if (hadExistingV2 || mutated || state.items.length) {
          await storeSave(store, STORAGE_KEY, state);
        }

        render(slot, state);
        ready = true;
        scheduleMidnightTick();
      })();
    }
  };
})();
