(function () {
  window.PortalWidgets = window.PortalWidgets || {};

  const STORE_KEY = "portal_recent_tasks_v1";
  const MAX_ITEMS = 50;

  function nowId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadState() {
    const raw = window.PortalApp?.Storage?.load(STORE_KEY);
    if (raw && typeof raw === "object" && Array.isArray(raw.items)) return raw;
    return { items: [] };
  }

  function saveState(state) {
    window.PortalApp?.Storage?.save(STORE_KEY, state);
  }

  function template() {
    return `
      <section class="metrics-card recent-tasks">
        <div class="recent-header">
          <h2>Recent Tasks</h2>
          <button class="btn subtle recent-plus" type="button" title="Add task" aria-label="Add task">+</button>
        </div>

        <ul class="recent-list"></ul>
        <div class="muted-box recent-empty" style="margin-top:10px;" hidden>
          No tasks. Either you’re crushing it or you forgot everything. Probably the second one.
        </div>

        <!-- Modal -->
        <div class="rt-modal-backdrop" aria-hidden="true">
          <div class="rt-modal" role="dialog" aria-modal="true" aria-labelledby="rt-modal-title">
            <div class="rt-modal-head">
              <div class="rt-modal-title" id="rt-modal-title">Add task</div>
              <button class="btn subtle rt-close" type="button" aria-label="Close">×</button>
            </div>

            <input class="rt-input" type="text" placeholder="Type a task…" />

            <div class="rt-modal-actions">
              <button class="btn subtle rt-add" type="button">Add</button>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function render(host, state) {
    const list = host.querySelector(".recent-list");
    const empty = host.querySelector(".recent-empty");

    const items = [...state.items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    list.innerHTML = items.map(item => `
      <li class="recent-item" data-id="${esc(item.id)}">
        <button class="recent-done" type="button" title="Done" aria-label="Mark done">✓</button>
        <div class="recent-text">${esc(item.text)}</div>
      </li>
    `).join("");
  }

  window.PortalWidgets.RecentTasks = {
    init: function (slotId) {
      const host = document.getElementById(slotId);
      if (!host) return;
      if (host.dataset.inited === "1") return;
      host.dataset.inited = "1";

      host.innerHTML = template();

      const state = loadState();

      const plusBtn = host.querySelector(".recent-plus");
      const backdrop = host.querySelector(".rt-modal-backdrop");
      const modal = host.querySelector(".rt-modal");
      const input = host.querySelector(".rt-input");
      const addBtn = host.querySelector(".rt-add");
      const closeBtn = host.querySelector(".rt-close");

      function openModal() {
        backdrop.classList.add("rt-open");
        backdrop.setAttribute("aria-hidden", "false");
        input.value = "";
        setTimeout(() => input.focus(), 0);
      }

      function closeModal() {
        backdrop.classList.remove("rt-open");
        backdrop.setAttribute("aria-hidden", "true");
        input.value = "";
      }

      function addTask() {
        const text = (input.value || "").trim();
        if (!text) return;

        state.items.unshift({ id: nowId(), text, createdAt: Date.now() });
        if (state.items.length > MAX_ITEMS) state.items = state.items.slice(0, MAX_ITEMS);

        saveState(state);
        render(host, state);
        closeModal();
      }

      // Open only when + clicked
      plusBtn.addEventListener("click", openModal);

      // Close controls
      closeBtn.addEventListener("click", closeModal);

      // Click outside the modal closes it
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) closeModal();
      });

      // Prevent clicks inside modal from bubbling to backdrop
      modal.addEventListener("click", (e) => e.stopPropagation());

      // Keyboard
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addTask();
        if (e.key === "Escape") closeModal();
      });

      addBtn.addEventListener("click", addTask);

      // Done button deletes task
      host.addEventListener("click", (e) => {
        const done = e.target.closest(".recent-done");
        if (!done) return;

        const li = done.closest(".recent-item");
        const id = li?.dataset?.id;
        if (!id) return;

        state.items = state.items.filter(x => x.id !== id);
        saveState(state);
        render(host, state);
      });

      render(host, state);
      // Ensure modal starts closed
      closeModal();
    }
  };
})();
