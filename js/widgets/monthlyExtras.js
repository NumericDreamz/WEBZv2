
/* ========================================================= */
/* ============== monthlyExtras.js (Addon Rows) ============= */
/* ========================================================= */
/*
  Injects two "standard toggles" into the Monthly widget:
    - Eyes For Safety
    - Pulse Survey

  Resets automatically when the month changes.

  Storage:
    portal_monthly_extras_v1
    { monthKey: "YYYY-MM", items: { eyes: {completed, completedAt}, pulse: {completed, completedAt} } }
*/

(function () {
  "use strict";

  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_monthly_extras_v1";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
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

  // Proper HTML escape for plain text
  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureState(raw) {
    const mk = monthKey();
    let state = (raw && typeof raw === "object") ? raw : {};

    // New month: reset both toggles
    if (state.monthKey !== mk) {
      state = {
        monthKey: mk,
        items: {
          eyes: { completed: false, completedAt: null },
          pulse: { completed: false, completedAt: null }
        }
      };
      return state;
    }

    // Normalize items object
    state.items = (state.items && typeof state.items === "object") ? state.items : {};

    state.items.eyes =
      (state.items.eyes && typeof state.items.eyes === "object")
        ? state.items.eyes
        : { completed: false, completedAt: null };

    state.items.pulse =
      (state.items.pulse && typeof state.items.pulse === "object")
        ? state.items.pulse
        : { completed: false, completedAt: null };

    state.items.eyes.completed = !!state.items.eyes.completed;
    state.items.pulse.completed = !!state.items.pulse.completed;

    return state;
  }

  function pickInsertionHost(slot) {
    const card = slot.querySelector(".metrics-card") || slot.firstElementChild;
    if (!card) return slot;

    const list =
      card.querySelector(".recent-list") ||
      card.querySelector(".toggle-list") ||
      card.querySelector(".metrics-list") ||
      card;

    return list || slot;
  }

  function rowHTML(id, label, completed) {
    const right = completed
      ? `
        <div class="status-pill status-good" aria-label="Complete">
          <span class="status-dot"></span>
          <span class="status-text">Complete</span>
        </div>
      `
      : `
        <label class="switch" aria-label="Mark complete: ${esc(label)}">
          <input type="checkbox" data-action="monthly-extra-toggle" data-id="${esc(id)}">
          <span class="slider"></span>
        </label>
      `;

    return `
      <div class="toggle-row rt-row" data-extra="${esc(id)}">
        <div class="toggle-left">
          <div class="toggle-title">${esc(label)}</div>
        </div>
        <div class="toggle-right rt-right">
          ${right}
        </div>
      </div>
    `;
  }

  function blockHTML(state) {
    return `
      <div data-role="monthly-extras-wrap" style="margin-top: 10px;">
