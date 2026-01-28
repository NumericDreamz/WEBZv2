(function () {
  const STORAGE_KEY = "portal_metrics_yearly_v2";

  const defaultConfig = {
    title: "Yearly Metrics",
    tasks: [
      { id: "annual_loto", label: "Annual LOTO Inspections", itemName: "Technician" },
      { id: "plan_for_zero", label: "Plan For Zero", itemName: "Employee" }
    ]
  };

  function yearKey(d) {
    return String(d.getFullYear());
  }

  function pruneYears(state, keep = 6) {
    if (!state || typeof state !== "object") return;
    const keys = Object.keys(state).sort();
    while (keys.length > keep) delete state[keys.shift()];
  }

  function ensureYear(state, y, tasks) {
    if (!state[y] || typeof state[y] !== "object") state[y] = { tasks: {} };
    if (!state[y].tasks || typeof state[y].tasks !== "object") state[y].tasks = {};

    tasks.forEach(t => {
      if (!state[y].tasks[t.id] || typeof state[y].tasks[t.id] !== "object") {
        state[y].tasks[t.id] = { locked: false, completed: false, people: {} };
      }
      const obj = state[y].tasks[t.id];
      if (typeof obj.locked !== "boolean") obj.locked = false;
      if (typeof obj.completed !== "boolean") obj.completed = false;
      if (!obj.people || typeof obj.people !== "object") obj.people = {};
    });
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
  }

  function nameKey(name) {
    return normalizeName(name).toLowerCase();
  }

  function escHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function encodePerson(name) {
    return encodeURIComponent(String(name));
  }

  function decodePerson(val) {
    try { return decodeURIComponent(String(val || "")); }
    catch { return String(val || ""); }
  }

  function allDone(taskObj) {
    const names = Object.keys(taskObj.people || {});
    if (names.length === 0) return false;
    return names.every(n => !!taskObj.people[n]);
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

  function buildTaskCard(taskDef, taskObj) {
    const locked = !!taskObj.locked;
    const names = Object.keys(taskObj.people || {});

    const items = names
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const done = !!taskObj.people[name];
        const cls = done ? "tech-btn tech-done" : "tech-btn tech-pending";

        const labelText = escHtml(name);
        const personAttr = encodePerson(name);

        const delBtn = locked
          ? ""
          : `<button type="button" class="tech-del" data-action="del-person" data-task="${escHtml(taskDef.id)}" data-person="${personAttr}" aria-label="Delete ${labelText}">−</button>`;

        return `
          <div class="tech-item">
            <button type="button" class="${cls}" data-action="toggle-person" data-task="${escHtml(taskDef.id)}" data-person="${personAttr}">${labelText}</button>
            ${delBtn}
          </div>
        `;
      })
      .join("");

    const emptyHintStyle = names.length ? "display:none" : "";
    const controlsStyle = locked ? "display:none" : "";

    return `
      <section class="metrics-card" data-widget="yearly-task" data-task="${escHtml(taskDef.id)}">
        <div class="yearly-task">
          <div class="yearly-title">${escHtml(taskDef.label)}</div>
          <div class="yearly-sub">
            Add ${escHtml(taskDef.itemName)}s with <b>+</b>, hit <b>SET</b> to lock, then click names as they complete.
          </div>
        </div>

        <div class="yearly-controls" style="${controlsStyle}">
          <button class="btn" type="button" data-action="add-person" data-task="${escHtml(taskDef.id)}" aria-label="Add ${escHtml(taskDef.itemName)}">+</button>
          <button class="btn subtle" type="button" data-action="lock-roster" data-task="${escHtml(taskDef.id)}">SET</button>
        </div>

        <div class="tech-grid">
          ${items}
        </div>

        <div class="muted-box" style="${emptyHintStyle}">
          No ${escHtml(taskDef.itemName)}s yet. Add them, then hit <b>SET</b> to lock the list.
        </div>
      </section>
    `;
  }

  function buildHTML(cfg, y, stateYear) {
    const taskCards = cfg.tasks
      .filter(t => !stateYear.tasks[t.id].completed) // hide completed tasks
      .map(t => buildTaskCard(t, stateYear.tasks[t.id]))
      .join("");

    return `
      <section class="metrics-card" data-widget="yearly">
        <div class="widget-head">
          <h2>${escHtml(cfg.title)}</h2>
          <div class="daily-progress">${escHtml(y)}</div>
        </div>

        <div class="yearly-stack">
          ${taskCards || `<div class="muted-box">All yearly tasks complete. Go enjoy your rare moment of peace.</div>`}
        </div>
      </section>
    `;
  }

  function init(slotId, config = {}) {
    const slot = document.getElementById(slotId);
    if (!slot) return;

    // prevent double-init (reloading modules, accidental init twice, etc.)
    if (slot.dataset.yearlyInited === "1") return;
    slot.dataset.yearlyInited = "1";

    const store = getStore();

    const cfg = {
      ...defaultConfig,
      ...config,
      tasks: (config.tasks || defaultConfig.tasks).slice()
    };

    const now = new Date();
    const y = yearKey(now);

    let state = store.load(STORAGE_KEY);
    if (!state || typeof state !== "object") state = {};

    pruneYears(state, 6);
    ensureYear(state, y, cfg.tasks);

    function autoComplete() {
      cfg.tasks.forEach(t => {
        const obj = state[y].tasks[t.id];
        if (!obj.completed && obj.locked && allDone(obj)) obj.completed = true;
      });
    }

    function rerender() {
      autoComplete();
      pruneYears(state, 6);
      store.save(STORAGE_KEY, state);

      const allComplete = cfg.tasks.every(t => !!state[y].tasks[t.id].completed);
      if (allComplete) {
        slot.innerHTML = "";
        return;
      }

      slot.innerHTML = buildHTML(cfg, y, state[y]);
    }

    rerender();

    // Stable listener on slot survives rerenders
    slot.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const widget = slot.querySelector('[data-widget="yearly"]');
      if (!widget) return;

      const action = btn.dataset.action;
      const taskId = btn.dataset.task;

      if (!taskId || !state[y]?.tasks?.[taskId]) return;
      const taskObj = state[y].tasks[taskId];
      const taskDef = cfg.tasks.find(t => t.id === taskId);
      if (!taskDef) return;

      // Add person
      if (action === "add-person") {
        if (taskObj.locked) return;

        const raw = prompt(`${taskDef.itemName} name:`);
        const name = normalizeName(raw);
        if (!name) return;

        const existingKeys = Object.keys(taskObj.people).map(nameKey);
        if (existingKeys.includes(nameKey(name))) {
          alert("That name is already on the list.");
          return;
        }

        taskObj.people[name] = false;
        rerender();
        return;
      }

      // Delete person (only before lock)
      if (action === "del-person") {
        if (taskObj.locked) return;

        const personEncoded = btn.dataset.person;
        const person = normalizeName(decodePerson(personEncoded));
        if (!person) return;

        // Find actual key match (case/spacing safe)
        const keys = Object.keys(taskObj.people);
        const hit = keys.find(k => nameKey(k) === nameKey(person));
        if (hit) {
          delete taskObj.people[hit];
          rerender();
        }
        return;
      }

      // Lock roster
      if (action === "lock-roster") {
        if (taskObj.locked) return;

        const count = Object.keys(taskObj.people).length;
        if (count === 0) {
          alert(`Add at least one ${taskDef.itemName} before hitting SET.`);
          return;
        }

        taskObj.locked = true;
        rerender();
        return;
      }

      // Toggle person completion
      if (action === "toggle-person") {
        const personEncoded = btn.dataset.person;
        const person = normalizeName(decodePerson(personEncoded));
        if (!person) return;

        const keys = Object.keys(taskObj.people);
        const hit = keys.find(k => nameKey(k) === nameKey(person));
        if (!hit) return;

        taskObj.people[hit] = !taskObj.people[hit];
        rerender();
        return;
      }
    });
  }

  window.PortalWidgets = window.PortalWidgets || {};
  window.PortalWidgets.Yearly = { init };
})();
