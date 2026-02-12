/* ========================================================= */
/* =============== tier1Briefing.js (Widget) =============== */
/* ========================================================= */
/*
  Tier 1 Briefing:
    Persistent scratchpad for Tier 1 meeting briefing items.

  Behavior:
    - Incomplete items show a toggle switch.
    - Completed items show the green "Complete" pill.
    - At midnight (local time):
        - Remove items completed before today (derez).

  Storage:
    STORAGE_KEY: portal_tier1_briefing_v1
    State: { items: [{ id, text, createdAt, completed, completedAt }] }
*/

(function () {
  "use strict";

  console.log("[Tier1Briefing] build 2026-02-12_02");

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_tier1_briefing_v1";
  const MAX_ITEMS = 200;

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
        try { return JSON.parse(localStorage.getItem(key) || "null"); }
        catch { return null; }
      },
      save(key, val) {
        localStorage.setItem(key, JSON.stringify(val || {}));
      }
    };
  }

  function getStore() {
    return window.PortalApp?.Storage || getFallbackStore();
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

    const createdAt = Number(it.createdAt ?? it.created ?? it.ts ?? Date.now());
    const completed = !!(it.completed ?? it.done ?? false);

    let completedAt = it.completedAt ?? it.doneAt ?? null;
    completedAt = (completedAt == null) ? null : Number(completedAt);

    const ca = Number.isFinite(createdAt) ? createdAt : Date.now();
    const id = String(it.id ?? uid());

    return {
      id,
      text,
      createdAt: ca,
      completed,
      completedAt: completed ? (Number.isFinite(completedAt) ? completedAt : Date.now()) : null
    };
  }

  function normalizeState(raw) {
    const obj = (raw && typeof raw === "object") ? raw : {};
    const arr = Array.isArray(obj.items) ? obj.items : (Array.isArray(raw) ? raw : []);
    return { items: arr.map(normalizeItem).filter(Boolean) };
  }

  function prune(state) {
    if (!state || !Array.isArray(state.items)) return;
    state.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (state.items.length > MAX_ITEMS) state.items = state.items.slice(0, MAX_ITEMS);
  }

  function rollover(state, nowTs) {
    const sod = startOfDay(nowTs);
    const before = state.items.length;

    state.items = state.items.filter((it) => {
      if (!it.completed) return true;
      if (!Number.isFinite(it.completedAt)) return true;
      return it.completedAt >= sod; // keep only completed today
    });

    prune(state);
    return state.items.length !== before;
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
    init(slotId) {
      const slot = document.getElementById(slotId);
      if (!slot) return;

      if (slot.dataset.tier1Inited === "1") return;
      slot.dataset.tier1Inited = "1";

      const store = getStore();

      // Load immediately
      let state = normalizeState(store.load(STORAGE_KEY));
      prune(state);

      // Apply rollover immediately (so old completed items don't linger)
      rollover(state, Date.now());
      store.save(STORAGE_KEY, state);

      render(slot, state);

      function saveAndRender() {
        prune(state);
        store.save(STORAGE_KEY, state);
        render(slot, state);
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

      // Midnight derez timer
      let midnightTimer = null;
      function scheduleMidnightTick() {
        if (midnightTimer) clearTimeout(midnightTimer);
        midnightTimer = setTimeout(() => {
          const did = rollover(state, Date.now());
          if (did) store.save(STORAGE_KEY, state);
          render(slot, state);
          scheduleMidnightTick();
        }, msUntilNextMidnight(new Date()));
      }
      scheduleMidnightTick();

      // Clicks
      slot.addEventListener("click", (e) => {
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

      // Enter/Escape
      slot.addEventListener("keydown", (e) => {
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
