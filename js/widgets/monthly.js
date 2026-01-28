(function () {
  window.PortalWidgets = window.PortalWidgets || {};

  const STORAGE_KEY = "portal_monthly_metrics_v2";

  function monthKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function daysInMonth(d) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function loadState() {
    try {
      const raw = window.PortalApp?.Storage?.load(STORAGE_KEY);
      if (raw && typeof raw === "object") return raw;
    } catch (_) {}
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try {
      if (window.PortalApp?.Storage?.save) {
        window.PortalApp.Storage.save(STORAGE_KEY, state);
        return;
      }
    } catch (_) {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function pruneOldMonths(state, keep = 12) {
    const keys = Object.keys(state).sort();
    while (keys.length > keep) {
      delete state[keys.shift()];
    }
  }

  function ensureMonth(state, key) {
    if (!state[key]) state[key] = {};
    return state[key];
  }

  function getVal(state, key, id) {
    const m = ensureMonth(state, key);
    if (typeof m[id] !== "number") m[id] = 0;
    return m[id];
  }

  function setVal(state, key, id, val) {
    const m = ensureMonth(state, key);
    m[id] = val;
  }

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function monthTitle(now) {
    const monthName = now.toLocaleString(undefined, { month: "long" });
    return `Monthly Metrics - ${monthName}`;
  }

  function render(host, cfg, state, now) {
    const key = monthKey(now);
    const metrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];

    const htmlParts = [];
    htmlParts.push(`
      <section class="metrics-card" id="monthly-metrics">
        <div class="widget-head">
          <h2>${esc(monthTitle(now))}</h2>
          <button class="btn subtle" type="button" data-mm-action="reset">Reset</button>
        </div>
    `);

    for (const m of metrics) {
      const id = m.id;
      if (!id) continue;

      if (m.type === "recognition") {
        const allot = Number(m.allotment || 0) || 0;
        const used = clamp(getVal(state, key, id), 0, allot || 999999);

        const pctUsed = allot ? Math.round((used / allot) * 100) : 0;

        const dim = daysInMonth(now);
        const day = now.getDate();
        const monthPct = Math.round((day / dim) * 100);
        const monthShort = now.toLocaleString(undefined, { month: "short" });

        htmlParts.push(`
          <div class="metric-row recognition" data-metric-id="${esc(id)}" data-allotment="${esc(allot)}">
            <div class="recog-head">
              <div class="recog-title">${esc(m.label || "Recognition")}</div>
              <div class="recog-right">
                <div class="recog-points"><span data-role="recog-used">${used}</span>/${allot}</div>
                <button class="btn" type="button" data-action="recog-edit" aria-label="Update Recognition points">+</button>
              </div>
            </div>

            <div class="bar-row">
              <div class="bar-label">Total</div>
              <div class="bar-track points">
                <div class="bar-fill points" style="width:${pctUsed}%;"></div>
              </div>
              <div class="bar-pct"><span data-role="recog-pct">${pctUsed}</span>%</div>
            </div>

            <div class="bar-row">
              <div class="bar-label">${esc(monthShort)}</div>
              <div class="bar-track month">
                <div class="bar-fill month" style="width:${monthPct}%;"></div>
              </div>
              <div class="bar-pct">${monthPct}%</div>
            </div>
          </div>
        `);

        continue;
      }

      // default counter metric (LOTO, Care, etc.)
      const target = Number(m.target || 0);
      const val = getVal(state, key, id);
      const good = target ? val >= target : false;

      htmlParts.push(`
        <div class="metric-row" data-metric-id="${esc(id)}" data-target="${esc(target)}">
          <div class="metric-top">
            <div class="metric-left">
              <div class="metric-title">${esc(m.label || id)}</div>
              <div class="metric-subtitle">Target: <span class="target-val">${target}</span> / month</div>
            </div>

            <div class="status-pill ${good ? "status-good" : "status-bad"}" aria-live="polite">
              <span class="status-dot"></span>
              <span class="status-text">${good ? "On track" : "Behind"}</span>
            </div>
          </div>

          <div class="counter counter-anchored">
            <button class="btn" type="button" data-action="dec" aria-label="Decrease ${esc(m.label || id)}">−</button>
            <div class="count" data-role="count">${val}</div>
            <button class="btn" type="button" data-action="inc" aria-label="Increase ${esc(m.label || id)}">+</button>
          </div>
        </div>
      `);
    }

    htmlParts.push(`</section>`);
    host.innerHTML = htmlParts.join("");
  }

  window.PortalWidgets.Monthly = {
    init: function (slotId, cfg) {
      const host = document.getElementById(slotId);
      if (!host) return;

      const now = new Date();
      const key = monthKey(now);

      const state = loadState();
      pruneOldMonths(state);
      ensureMonth(state, key);

      render(host, cfg || {}, state, now);

      // One event handler for the whole card
      host.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        const reset = btn.dataset.mmAction === "reset";
        if (reset) {
          const metrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];
          for (const m of metrics) {
            if (m?.id) setVal(state, key, m.id, 0);
          }
          saveState(state);
          render(host, cfg || {}, state, new Date());
          return;
        }

        const row = e.target.closest(".metric-row");
        if (!row) return;

        const metricId = row.dataset.metricId;
        if (!metricId) return;

        // Recognition edit
        if (btn.dataset.action === "recog-edit") {
  	const allot = Number(row.dataset.allotment || 0) || 0;
  	const current = getVal(state, key, metricId);

  	const raw = prompt(`Add Recognition points (remaining ${Math.max(0, allot - current)}):`, "10");
 	 if (raw === null) return;

	  const add = Number(String(raw).trim());
  	if (!Number.isFinite(add)) return;

  	const next = clamp(current + Math.round(add), 0, allot);
  	setVal(state, key, metricId, next);

  	saveState(state);
  	render(host, cfg || {}, state, new Date());
  	return;
	}


        // Standard counter inc/dec
        const action = btn.dataset.action;
        if (!action) return;

        const target = Number(row.dataset.target || 0);
        const current = getVal(state, key, metricId);
        let next = current;

        if (action === "inc") next = current + 1;
        if (action === "dec") next = Math.max(0, current - 1);

        setVal(state, key, metricId, next);
        saveState(state);
        render(host, cfg || {}, state, new Date());
      });
    }
  };
})();
