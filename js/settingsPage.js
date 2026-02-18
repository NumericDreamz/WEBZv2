(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function getEnv() {
    return (window.PortalApp && window.PortalApp.Env) ? window.PortalApp.Env : null;
  }

  function getDatasetKeyFallback() {
    const k = localStorage.getItem("ats_portal_dataset_mode_v1");
    return (k === "beta" || k === "stable") ? k : "";
  }

  function applyEnvMarker(label) {
    const marker = document.getElementById("atsEnvMarker");
    if (!marker) return;

    const text = (label || "").toString().trim();
    if (!text) {
      marker.innerHTML = "";
      marker.style.display = "none";
      return;
    }

    marker.style.display = "block";
    marker.innerHTML = `
      <div class="ats-env-marker__line"></div>
      <div class="ats-env-marker__label">${escapeHtml(text)}</div>
      <div class="ats-env-marker__line"></div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortUrl(u) {
    try {
      const url = new URL(u);
      return url.host + url.pathname.replace(/\/+$/, "");
    } catch (_) {
      return (u || "").toString().slice(0, 60);
    }
  }

  function datasetLocalKeys(datasetKey) {
    return {
      master: `ats_portal_state_v1:${datasetKey}`,
      cache: `portal_state_cache_v1:${datasetKey}`,
      lastSync: `ats_portal_last_sync_date_v1:${datasetKey}`
    };
  }

  // =========================
  // Theme toggle
  // =========================

  const THEME_KEY = "ats_portal_theme_mode_v1";

  function getThemeMode() {
    const v = (localStorage.getItem(THEME_KEY) || "").toString().trim().toLowerCase();
    return (v === "light" || v === "dark") ? v : "dark";
  }

  function applyTheme(mode) {
    const m = (mode === "light") ? "light" : "dark";

    try { localStorage.setItem(THEME_KEY, m); } catch (_) {}

    // If nav.js already exposed Theme, use it (it also updates theme-color).
    const api = window.PortalApp && window.PortalApp.Theme;
    if (api && typeof api.set === "function") {
      api.set(m);
    } else {
      document.documentElement.setAttribute("data-theme", m);
    }

    const label = $("themeLabel");
    if (label) label.textContent = (m === "dark") ? "Dark" : "Light";
  }

  function initThemeToggle() {
    const t = $("themeDark");
    if (!t) return;

    const mode = getThemeMode();
    t.checked = (mode === "dark");
    applyTheme(mode);

    t.addEventListener("change", () => {
      applyTheme(t.checked ? "dark" : "light");
    });
  }

  // =========================
  // Display metrics
  // =========================

  function hasClipboard() {
    return !!(navigator.clipboard && navigator.clipboard.writeText);
  }

  function mediaYesNo(q) {
    try { return window.matchMedia(q).matches ? "YES" : "no"; } catch (_) { return "n/a"; }
  }

  function orientationText() {
    try {
      const o = screen.orientation;
      if (o && o.type) return o.type + (typeof o.angle === "number" ? ` (${o.angle}°)` : "");
    } catch (_) {}

    try {
      return window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
    } catch (_) {
      return "unknown";
    }
  }

  function buildDisplayMetricsText() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const vv = window.visualViewport;
    const vvText = vv
      ? `${Math.round(vv.width)} x ${Math.round(vv.height)}  (scale ${Number(vv.scale || 1).toFixed(2)})`
      : "n/a";

    const dpr = window.devicePixelRatio || 1;

    const sw = (screen && typeof screen.width === "number") ? screen.width : 0;
    const sh = (screen && typeof screen.height === "number") ? screen.height : 0;

    const aw = (screen && typeof screen.availWidth === "number") ? screen.availWidth : 0;
    const ah = (screen && typeof screen.availHeight === "number") ? screen.availHeight : 0;

    const physW = sw ? Math.round(sw * dpr) : 0;
    const physH = sh ? Math.round(sh * dpr) : 0;

    const bps = [2000, 1500, 1200, 1000, 800, 700, 600, 520]
      .map(n => `<=${n}: ${mediaYesNo(`(max-width: ${n}px)`)}`)
      .join("  ");

    const info = [
      `Viewport:        ${vw} x ${vh}  (CSS px)`,
      `Visual viewport: ${vvText}`,
      `Screen:          ${sw} x ${sh}  (CSS px)`,
      `Screen (avail):  ${aw} x ${ah}  (CSS px)`,
      `DevicePixelRatio:${dpr}`,
      `Approx physical: ${physW} x ${physH}  (device px)`,
      `Orientation:     ${orientationText()}`,
      `Hover:           ${mediaYesNo("(hover: hover)")}   (none: ${mediaYesNo("(hover: none)")})`,
      `Pointer:         fine ${mediaYesNo("(pointer: fine)")}   coarse ${mediaYesNo("(pointer: coarse)")}`,
      `Breakpoints:     ${bps}`,
      ``,
      `Tip: Use "Viewport" for CSS breakpoints. Phones report smaller CSS widths than their hardware pixels.`
    ];

    return info.join("\n");
  }

  function initDisplayMetricsPanel() {
    const dump = $("displayMetrics");
    if (!dump) return;

    const copyBtn = $("copyMetrics");
    if (copyBtn) {
      copyBtn.style.display = hasClipboard() ? "inline-block" : "none";
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(dump.textContent || "");
          copyBtn.textContent = "Copied";
          setTimeout(() => { copyBtn.textContent = "Copy Metrics"; }, 900);
        } catch (_) {
          try {
            const range = document.createRange();
            range.selectNodeContents(dump);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
      });
    }

    let raf = 0;
    const update = () => { dump.textContent = buildDisplayMetricsText(); };
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });

    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", schedule, { passive: true });
        window.visualViewport.addEventListener("scroll", schedule, { passive: true });
      }
    } catch (_) {}
  }

  async function clearDeviceCaches() {
    // Cache Storage (service worker caches)
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (_) {}

    // Unregister service workers (so they don't resurrect old caches)
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
    } catch (_) {}
  }

  function init() {
    const env = getEnv();

    const cfg = (env && typeof env.getRemoteConfig === "function") ? env.getRemoteConfig() : {
      datasetKey: getDatasetKeyFallback() || "stable",
      label: (getDatasetKeyFallback() === "beta") ? "BETA" : "LSW Dashboard",
      dashboardId: window.PORTALSTATE_DASHBOARD_ID || "ats-portal",
      webAppUrl: window.PORTALSTATE_WEBAPP_URL || "",
      buildChannel: env?.buildChannel || ""
    };

    $("envBuild").textContent = cfg.buildChannel || "unknown";
    $("envDataset").textContent = cfg.datasetKey || "unknown";
    $("envDashboardId").textContent = cfg.dashboardId || "unknown";
    $("envUrl").textContent = shortUrl(cfg.webAppUrl || "");

    // Preselect radios
    const stable = $("dsStable");
    const beta = $("dsBeta");
    if (cfg.datasetKey === "beta") beta.checked = true;
    else stable.checked = true;

    applyEnvMarker(cfg.label);

    initThemeToggle();
    initDisplayMetricsPanel();

    $("applyDataset").addEventListener("click", () => {
      const selected = beta.checked ? "beta" : "stable";

      // Tiny safety catch: selecting STABLE while running a beta build can clobber real data.
      if (cfg.buildChannel === "beta" && selected === "stable") {
        const ok = confirm("You're running the BETA build. Pointing it at STABLE data can overwrite your real dashboard state. Continue?");
        if (!ok) return;
      }

      if (env && typeof env.setDatasetKey === "function") {
        env.setDatasetKey(selected);
      } else {
        localStorage.setItem("ats_portal_dataset_mode_v1", selected);
      }

      location.reload();
    });

    $("clearLocal").addEventListener("click", async () => {
      const selected = beta.checked ? "beta" : "stable";
      const keys = datasetLocalKeys(selected);

      const ok = confirm(`Clear local cache for "${selected}" on this device? This does NOT delete the sheet data.\n\nNote: This also clears the PWA cache so stale CSS/JS stops haunting you.`);
      if (!ok) return;

      try { localStorage.removeItem(keys.master); } catch (_) {}
      try { localStorage.removeItem(keys.cache); } catch (_) {}
      try { localStorage.removeItem(keys.lastSync); } catch (_) {}

      // Also clear legacy master if we're nuking stable and it exists (older builds)
      if (selected === "stable") {
        try { localStorage.removeItem("ats_portal_state_v1"); } catch (_) {}
        try { localStorage.removeItem("portal_state_cache_v1"); } catch (_) {}
      }

      await clearDeviceCaches();

      // Force a clean reload
      const url = new URL(location.href);
      url.searchParams.set("v", Date.now().toString());
      location.replace(url.toString());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
