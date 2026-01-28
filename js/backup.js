window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  const MASTER_KEY = "ats_portal_state_v1";

  // Compatibility key: your earlier console scripts + some persistence setups used this
  const REMOTE_CACHE_KEY = "portal_state_cache_v1";

  // Debounce remote writes so we don't hammer Apps Script
  const PUSH_DEBOUNCE_MS = 700;
  let pushTimer = null;

  function safeParse(raw) {
    try {
      const v = JSON.parse(raw);
      return (v && typeof v === "object") ? v : {};
    } catch {
      return {};
    }
  }

  function mirrorRemoteCache(master) {
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(master || {}));
    } catch (_) {}
  }

  function readMaster() {
    const raw = localStorage.getItem(MASTER_KEY);
    const master = raw ? safeParse(raw) : {};

    // Migrate legacy keys into master once (so backup captures everything)
    let changed = false;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === MASTER_KEY) continue;

      const looksLikeOurs =
        k.startsWith("portal_metrics_") ||
        k.startsWith("metrics_") ||
        k.includes("_metrics_");

      if (!looksLikeOurs) continue;
      if (master[k] !== undefined) continue;

      const legacyRaw = localStorage.getItem(k);
      if (!legacyRaw) continue;

      master[k] = safeParse(legacyRaw);
      changed = true;
    }

    if (changed) localStorage.setItem(MASTER_KEY, JSON.stringify(master));
    mirrorRemoteCache(master);
    return master;
  }

  function writeMaster(master) {
    localStorage.setItem(MASTER_KEY, JSON.stringify(master || {}));
    mirrorRemoteCache(master);
  }

  async function pushNow(master) {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.setState !== "function") {
      return { ok: false, reason: "PortalApp.Persistence.setState missing" };
    }

    // mirror first in case persistence.js reads REMOTE_CACHE_KEY internally
    mirrorRemoteCache(master);

    try {
      const res = await p.setState(master);
      return res || { ok: true };
    } catch (e) {
      console.warn("[Portal] Remote push failed:", e);
      return { ok: false, reason: "push_failed", error: String(e) };
    }
  }

  function schedulePush(master) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow(master); }, PUSH_DEBOUNCE_MS);
  }

  async function pullNow() {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.getState !== "function") {
      return { ok: false, reason: "PortalApp.Persistence.getState missing" };
    }

    try {
      const remote = await p.getState();
      if (!remote || typeof remote !== "object") return { ok: true, state: null };

      writeMaster(remote);
      return { ok: true, state: remote };
    } catch (e) {
      console.warn("[Portal] Remote pull failed:", e);
      return { ok: false, reason: "pull_failed", error: String(e) };
    }
  }

  function load(key) {
    const master = readMaster();
    return master[key] ?? {};
  }

  function save(key, val) {
    const master = readMaster();
    master[key] = val;
    writeMaster(master);

    // Auto-push on every change
    schedulePush(master);
  }

  function exportAll() {
    const master = readMaster();
    return JSON.stringify(master, null, 2);
  }

  function importAll(jsonText) {
    const obj = safeParse(jsonText);
    if (!obj || typeof obj !== "object") throw new Error("Backup file is not valid JSON.");
    writeMaster(obj);
    schedulePush(obj);
  }

  // app.js calls this
  async function init() {
    const pulled = await pullNow();

    // If remote is empty but local has state, push local up for first-time setup
    if (pulled?.ok && !pulled?.state) {
      const local = readMaster();
      if (Object.keys(local).length) await pushNow(local);
    }

    return pulled;
  }

  async function forcePush() {
    const master = readMaster();
    return pushNow(master);
  }

  async function forcePull() {
    return pullNow();
  }

  return { load, save, exportAll, importAll, init, forcePush, forcePull };
})();
