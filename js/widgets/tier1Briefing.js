/* ========================================================= */
/* =============== tier1Briefing.js (Widget) =============== */
/* ========================================================= */
/*
  Tier 1 Briefing:
    A persistent scratchpad for items to brief in Tier 1 meetings.

  Differences vs Recent Tasks:
    - No overdue logic (no angry flashing).
    - No midnight rollover cleanup. Items can live for days/weeks.

  Storage:
    STORAGE_KEY: portal_tier1_briefing_v1
    State: { items: [{ id, text, createdAt, completed, completedAt }] }
*/

(function () {
  "use strict";

  console.log("[Tier1Briefing] build 2026-02-06_01");

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_tier1_briefing_v1";
  const MAX_ITEMS = 80;

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

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
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

      if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        return Number.isFinite(n) ? n : fallback;
      }

      const p = Date.parse(s);
      return Number.isNaN(p) ? fallback : p;
    }

    return fallback;
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
      // if persistence fails, UI still works locally
    }
  }

  function normalizeItem(it) {
    if (it == null) return null;

    if (typeof it === "string") {
      const t = normalizeText(it);
      if (!t) return null;
      const now = Date.now();
      return { id: uid(), text: t, createdAt: now, completed: false, completedAt: null };
    }

    if (typeof it !== "object") return null;

    const text = normalizeText(it.text ?? it.title ?? it.task ?? it.label ?? "");
    if (!text) return null;

    const createdAt = toMs(it.createdAt ?? it.created ?? it.ts ?? null, Date.now());
    const completed = toBool(it.completed ?? it.done ?? it.isComplete ?? false);
    const completedAt = completed ? toMs(it.completedAt ?? it.doneAt ?? null, null) : null;

    const id = (it.id != null && String(it.id)) || uid();

    return { id, text, createdAt, completed, completedAt };
  }

  function normalizeState(raw) {
    const obj = (raw && typeof raw === "object") ? raw : {};
    const arr = Array.isArray(obj.items) ? obj.items : (Array.isArray(raw) ? raw : []);
    const items = arr.map(normalizeItem).filter(Boolean);
    return { items };
  }

  function prune(state) {
    if (!state || !Array.isArray(state.items)) return;
    state.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (state.items.length > MAX_ITEMS) state.items = state.items.slice(0, MAX_ITEMS);
  }

  function buildHTML(state) {
    const rows = state.items
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((it) => {
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
          <div class="toggle-row rt-row" data-id="${escAttr(it.id)}">
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
        No briefing items. Add one with <b>+</b>.
      </div>
    `;

    return `
      <section class="metrics-card recent-tasks" data-widget="tier1-briefing">
        <div class="widget-head recent-header">
          <h2>Tier 1 Briefing</h2>
          <div class="rt-head-right">
            <button class="btn" type="button" data-action="open-add" aria-label="Add briefing item">+</button>
          </div>
        </div>

        <div class="recent-list">
          ${rows || empty}
        </div>

        <div class="rt-modal-backdrop" data-role="t1-modal" aria-hidden="true">
          <div class="rt-modal" role="dialog" aria-modal="true" aria-label="Add briefing item">
            <div class="rt-modal-head">
              <div class="rt-modal-title">Add a briefing item</div>
              <button class="btn subtle" type="button" data-action="close-modal">Close</button>
            </div>

            <input class="rt-input" type="text" data-role="t1-input" placeholder="Type the item…" />

            <div class="rt-modal-actions">
              <button class="btn subtle" type="button" data-action="close-modal">Cancel</button>
              <button class="btn subtle" type="button" data-action="add-item">Add</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render(slot, state) {
    slot.innerHTML = buildHTML(state);
  }

  window.PortalWidgets.Tier1Briefing = {
    init: function (slotId) {
      const slot = document.getElementById(slotId);
      if (!slot) return;

      if (slot.dataset.tier1Inited === "1") return;
      slot.dataset.tier1Inited = "1";

      const store = getStore();

      let state = { items: [] };
      let ready = false;
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
        const modal = slot.querySelector('[data-role="t1-modal"]');
        const input = slot.querySelector('[data-role="t1-input"]');
        if (!modal || !input) return;
        modal.classList.add("rt-open");
        modal.setAttribute("aria-hidden", "false");
        input.value = "";
        setTimeout(() => input.focus(), 0);
      }

      function closeModal() {
        const modal = slot.querySelector('[data-role="t1-modal"]');
        if (!modal) return;
        modal.classList.remove("rt-open");
        modal.setAttribute("aria-hidden", "true");
      }

      slot.addEventListener("click", (e) => {
        if (!ready) return;

        const backdrop = slot.querySelector('[data-role="t1-modal"]');
        if (backdrop && e.target === backdrop && backdrop.classList.contains("rt-open")) {
          closeModal();
          return;
        }

        const btn = e.target.closest("button");
        if (!btn) return;

        const action = btn.dataset.action;

        if (action === "open-add") return void openModal();
        if (action === "close-modal") return void closeModal();

        if (action === "add-item") {
          const input = slot.querySelector('[data-role="t1-input"]');
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

        const backdrop = slot.querySelector('[data-role="t1-modal"]');
        if (!backdrop || !backdrop.classList.contains("rt-open")) return;

        if (e.key === "Escape") {
          e.preventDefault();
          closeModal();
          return;
        }

        if (e.key === "Enter") {
          const input = slot.querySelector('[data-role="t1-input"]');
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

      render(slot, state);

      (async () => {
        const raw = await storeLoad(store, STORAGE_KEY);
        const hadExisting = raw != null;

        state = normalizeState(raw);
        prune(state);

        if (hadExisting || state.items.length) {
          await storeSave(store, STORAGE_KEY, state);
        }

        render(slot, state);
        ready = true;
      })();
    }
  };
})();