(function () {
  "use strict";

  console.log("[Portal] persistence.js build 2026-02-09_02");

  // ---------------------------------------------------------
  // Canonical config source:
  //   js/config.js should set:
  //     window.PORTALSTATE_WEBAPP_URL
  //     window.PORTALSTATE_TOKEN
  //     window.PORTALSTATE_DASHBOARD_ID (optional)
  //
  // This file does NOT hardcode secrets anymore.
  // ---------------------------------------------------------

  const DEFAULTS = {
    dashboardId: "ats-portal",
    timeoutMs: 8000
  };

  function getConfig() {
    const webAppUrl = (window.PORTALSTATE_WEBAPP_URL || "").toString().trim();
    const token = (window.PORTALSTATE_TOKEN || "").toString().trim();
    const dashboardId = (window.PORTALSTATE_DASHBOARD_ID || DEFAULTS.dashboardId).toString().trim();

    return {
      webAppUrl,
      token,
      dashboardId,
      timeoutMs: DEFAULTS.timeoutMs
    };
  }

  function ensureConfigOrThrow() {
    const cfg = getConfig();
    if (!cfg.webAppUrl || !cfg.token) {
      const msg = "[Portal] Missing PORTALSTATE_WEBAPP_URL / PORTALSTATE_TOKEN. Check js/config.js + script load order.";
      console.error(msg, cfg);
      throw new Error(msg);
    }
    return cfg;
  }

  function jsonpGet(url, timeoutMs) {
    return new Promise((resolve) => {
      const cbName = "__portal_jsonp_cb_" + Math.random().toString(16).slice(2);
      let done = false;

      function finish(payload) {
        if (done) return;
        done = true;
        try { delete window[cbName]; } catch (_) {}
        try { script.remove(); } catch (_) {}
        resolve(payload);
      }

      const script = document.createElement("script");
      window[cbName] = (data) => finish(data);

      const timer = setTimeout(() => {
        clearTimeout(timer);
        finish({ ok: false, error: "timeout" });
      }, timeoutMs);

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + encodeURIComponent(cbName);
      script.onerror = () => {
        clearTimeout(timer);
        finish({ ok: false, error: "network/blocked" });
      };

      document.head.appendChild(script);
    });
  }

  async function getState() {
    const cfg = ensureConfigOrThrow();

    const url =
      `${cfg.webAppUrl}?action=get` +
      `&dashboardId=${encodeURIComponent(cfg.dashboardId)}` +
      `&token=${encodeURIComponent(cfg.token)}` +
      `&_=${Date.now()}`; // cache buster

    return await jsonpGet(url, cfg.timeoutMs);
  }

  async function setState(stateObj) {
    const cfg = ensureConfigOrThrow();

    const body =
      "action=set" +
      `&dashboardId=${encodeURIComponent(cfg.dashboardId)}` +
      `&token=${encodeURIComponent(cfg.token)}` +
      `&payload=${encodeURIComponent(JSON.stringify(stateObj || {}))}`;

    try {
      const r = await fetch(cfg.webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body
      });

      let data = null;
      try { data = await r.json(); } catch (_) {}
      return data || { ok: r.ok };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  window.PortalApp = window.PortalApp || {};
  window.PortalApp.Persistence = { getState, setState, getConfig };
})();
