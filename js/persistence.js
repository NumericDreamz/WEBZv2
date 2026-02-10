(function () {
  "use strict";

  console.log("[Portal] persistence.js build 2026-02-09_01");

  const REMOTE = {
    url: "https://script.google.com/macros/s/AKfycbzdytDOr7q5IhVn-WroARALOGX7lwXK3fBc2zb6Zi63e1h3_jSQ-0PJ9Zv4HQH1DFo/exec",
    dashboardId: "ats-portal",
    token: "h0wD0T_T_3l1TtLcR0C0D1L3",
    timeoutMs: 8000
  };

  // ---------------------------------------------------------
  // Expose remote config for other widgets (Backlog, etc.)
  // config.js can override these if it loads earlier.
  // ---------------------------------------------------------
  try {
    window.PORTALSTATE_WEBAPP_URL = window.PORTALSTATE_WEBAPP_URL || REMOTE.url;
    window.PORTALSTATE_TOKEN = window.PORTALSTATE_TOKEN || REMOTE.token;
    window.PORTALSTATE_DASHBOARD_ID = window.PORTALSTATE_DASHBOARD_ID || REMOTE.dashboardId;

    // Also mirror to localStorage for “dumb” widgets that only look there
    localStorage.setItem("PORTALSTATE_WEBAPP_URL", window.PORTALSTATE_WEBAPP_URL);
    localStorage.setItem("PORTALSTATE_TOKEN", window.PORTALSTATE_TOKEN);
    localStorage.setItem("PORTALSTATE_DASHBOARD_ID", window.PORTALSTATE_DASHBOARD_ID);
  } catch (_) {
    // If localStorage is blocked, whatever. We'll still have window vars.
  }

  function getConfig() {
    return {
      webAppUrl: window.PORTALSTATE_WEBAPP_URL || REMOTE.url,
      token: window.PORTALSTATE_TOKEN || REMOTE.token,
      dashboardId: window.PORTALSTATE_DASHBOARD_ID || REMOTE.dashboardId,
      timeoutMs: REMOTE.timeoutMs
    };
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
    const cfg = getConfig();
    const url =
      `${cfg.webAppUrl}?action=get` +
      `&dashboardId=${encodeURIComponent(cfg.dashboardId)}` +
      `&token=${encodeURIComponent(cfg.token)}` +
      `&_=${Date.now()}`; // cache buster

    const res = await jsonpGet(url, cfg.timeoutMs);
    return res;
  }

  async function setState(stateObj) {
    const cfg = getConfig();
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

      // Apps Script returns JSON: { ok:true }
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
