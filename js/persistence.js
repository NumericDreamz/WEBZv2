(function () {
  "use strict";

  console.log("[Portal] persistence.js build 2026-01-30_01");

  const REMOTE = {
    url: "https://script.google.com/macros/s/AKfycbzdytDOr7q5IhVn-WroARALOGX7lwXK3fBc2zb6Zi63e1h3_jSQ-0PJ9Zv4HQH1DFo/exec",
    dashboardId: "ats-portal",
    token: "h0wD0T_T_3l1TtLcR0C0D1L3",
    timeoutMs: 8000
  };

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
    const url =
      `${REMOTE.url}?action=get` +
      `&dashboardId=${encodeURIComponent(REMOTE.dashboardId)}` +
      `&token=${encodeURIComponent(REMOTE.token)}` +
      `&_=${Date.now()}`; // cache buster

    const res = await jsonpGet(url, REMOTE.timeoutMs);
    return res;
  }

  async function setState(stateObj) {
    const body =
      "action=set" +
      `&dashboardId=${encodeURIComponent(REMOTE.dashboardId)}` +
      `&token=${encodeURIComponent(REMOTE.token)}` +
      `&payload=${encodeURIComponent(JSON.stringify(stateObj || {}))}`;

    try {
      const r = await fetch(REMOTE.url, {
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
  window.PortalApp.Persistence = { getState, setState };
})();
