// js/config.js
// Central environment + persistence config.
// This file is intentionally loaded FIRST.

(function () {
  "use strict";

  const STORE_KEY = "ats_portal_dataset_mode_v1";

  // Build channel (this repo branch).
  // In MAIN, set to "stable". In BETA, set to "beta".
  const BUILD_CHANNEL = "beta";

  // Remote endpoints + IDs per dataset.
  // NOTE: You can (and probably should) deploy a separate Apps Script Web App for BETA later.
  const DATASETS = {
    stable: {
      key: "stable",
      label: "LSW Dashboard",
      dashboardId: "ats-portal",
      webAppUrl: "https://script.google.com/macros/s/AKfycbzdytDOr7q5IhVn-WroARALOGX7lwXK3fBc2zb6Zi63e1h3_jSQ-0PJ9Zv4HQH1DFo/exec",
      token: "h0wD0T_T_3l1TtLcR0C0D1L3"
    },
    beta: {
      key: "beta",
      label: "BETA",
      dashboardId: "ats-portal-beta",
      webAppUrl: "https://script.google.com/macros/s/AKfycbyf79-nYORAVa70YqcT6UT-Cf7r4CjZis-xq9sjQP7kBIeRG9sfjZ_bazxxOtI5tRcv/exec",
      token: "h0wD0T_T_3l1TtLcR0C0D1L3"
    }
  };

  function defaultDatasetKey() {
    return (BUILD_CHANNEL === "beta") ? "beta" : "stable";
  }

  function normalizeKey(k) {
    k = (k || "").toString().trim().toLowerCase();
    return DATASETS[k] ? k : "";
  }

  function getDatasetKey() {
    const fromStore = normalizeKey(localStorage.getItem(STORE_KEY));
    return fromStore || defaultDatasetKey();
  }

  function setDatasetKey(k) {
    const nk = normalizeKey(k);
    if (!nk) return false;
    localStorage.setItem(STORE_KEY, nk);
    return true;
  }

  function getRemoteConfig() {
    const key = getDatasetKey();
    const ds = DATASETS[key] || DATASETS[defaultDatasetKey()];
    return {
      datasetKey: ds.key,
      label: ds.label,
      dashboardId: ds.dashboardId,
      webAppUrl: ds.webAppUrl,
      token: ds.token,
      buildChannel: BUILD_CHANNEL
    };
  }

  window.PortalApp = window.PortalApp || {};
  window.PortalApp.Env = {
    buildChannel: BUILD_CHANNEL,
    datasets: DATASETS,
    getDatasetKey,
    setDatasetKey,
    getRemoteConfig
  };

  // Back-compat globals (older code reads these).
  const cfg = getRemoteConfig();
  window.PORTALSTATE_WEBAPP_URL = cfg.webAppUrl;
  window.PORTALSTATE_TOKEN = cfg.token;
  window.PORTALSTATE_DASHBOARD_ID = cfg.dashboardId;
  window.PORTALSTATE_DATASET = cfg.datasetKey;
})();
