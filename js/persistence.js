(function () {
  const REMOTE = {
    url: "https://script.google.com/macros/s/AKfycbzdytDOr7q5IhVn-WroARALOGX7lwXK3fBc2zb6Zi63e1h3_jSQ-0PJ9Zv4HQH1DFo/exec",
    dashboardId: "ats-portal",          // any unique string
    token: "h0wD0T#T#3l1TtLcR0C0D1L3",
    debounceMs: 800
  };

  function jsonpGetState() {
    return new Promise((resolve) => {
      const cbName = "__portal_state_cb_" + Math.random().toString(16).slice(2);
      window[cbName] = (data) => {
        try { resolve(data); }
        finally {
          delete window[cbName];
          script.remove();
        }
      };

      const src =
        `${REMOTE.url}?action=get` +
        `&dashboardId=${encodeURIComponent(REMOTE.dashboardId)}` +
        `&token=${encodeURIComponent(REMOTE.token)}` +
        `&callback=${encodeURIComponent(cbName)}`;

      const script = document.createElement("script");
      script.src = src;
      script.onerror = () => {
        delete window[cbName];
        script.remove();
        resolve({ ok:false, error:"Network/blocked" });
      };
      document.head.appendChild(script);
    });
  }

  let saveTimer = null;
  function postState(stateObj) {
    // form-urlencoded avoids preflight headaches most of the time
    const body =
      "action=set" +
      `&dashboardId=${encodeURIComponent(REMOTE.dashboardId)}` +
      `&token=${encodeURIComponent(REMOTE.token)}` +
      `&payload=${encodeURIComponent(JSON.stringify(stateObj || {}))}`;

    // fire-and-forget; we don't need to read the response
    return fetch(REMOTE.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    }).catch(() => {});
  }

  function debounceSave(stateObj) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => postState(stateObj), REMOTE.debounceMs);
  }

  // Wrap your existing Storage so widgets don't need rewriting
  const LOCAL_KEY = "portal_state_cache_v1";

  const Storage = {
    async init() {
      // 1) load local immediately (fast UI)
      let local = {};
      try { local = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch {}

      // 2) then load remote and merge (remote wins)
      const remote = await jsonpGetState();
      if (remote && remote.ok && remote.state) {
        const merged = { ...local, ...remote.state };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
        return merged;
      }

      return local;
    },

    load(key) {
      // widgets call Storage.load(STORAGE_KEY). We'll store a single object and return subkeys.
      let all = {};
      try { all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch {}
      return all[key];
    },

    save(key, value) {
      let all = {};
      try { all = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch {}
      all[key] = value;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      debounceSave(all); // push whole state blob
    }
  };

  window.PortalApp = window.PortalApp || {};
  window.PortalApp.Storage = Storage;
})();
