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

    $("clearLocal").addEventListener("click", () => {
      const selected = beta.checked ? "beta" : "stable";
      const keys = datasetLocalKeys(selected);

      const ok = confirm(`Clear local cache for "${selected}" on this device? This does NOT delete the sheet data.`);
      if (!ok) return;

      try { localStorage.removeItem(keys.master); } catch (_) {}
      try { localStorage.removeItem(keys.cache); } catch (_) {}
      try { localStorage.removeItem(keys.lastSync); } catch (_) {}

      // Also clear legacy master if we're nuking stable and it exists (older builds)
      if (selected === "stable") {
        try { localStorage.removeItem("ats_portal_state_v1"); } catch (_) {}
        try { localStorage.removeItem("portal_state_cache_v1"); } catch (_) {}
      }

      location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
