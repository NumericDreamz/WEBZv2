window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  "use strict";

  console.log("[Portal] storage.js build 2026-01-30_01");

  const MASTER_KEY = "ats_portal_state_v1";
  const REMOTE_CACHE_KEY = "portal_state_cache_v1";

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

    // Migrate legacy portal_* keys into master (one-time-ish)
    let changed = false;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === MASTER_KEY || k === REMOTE_CACHE_KEY) continue;

      const looksLikeOurs =
        k.startsWith("portal_") ||
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

    mirrorRemoteCache(master);

    const res = await p.setState(master);
    return res || { ok: true };
  }

  function schedulePush(master) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushNow(master).catch((e) => console.warn("[Portal] Remote push failed:", e));
    }, PUSH_DEBOUNCE_MS);
  }

  async function pullNow() {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.getState !== "function") {
      return { ok: false, reason: "PortalApp.Persistence.getState missing" };
    }

    const res = await p.getState();

    if (res && res.ok && res.state && typeof res.state === "object") {
      writeMaster(res.state);
      return { ok: true, state: res.state };
    }

    // Remote empty or failed; do not overwrite local
    if (res && res.ok && !res.state) return { ok: true, state: null };

    return { ok: false, reason: "pull_failed", error: res?.error || "unknown" };
  }

  function load(key) {
    const master = readMaster();
    return (Object.prototype.hasOwnProperty.call(master, key)) ? master[key] : null;
  }

  function save(key, val) {
    const master = readMaster();
    master[key] = val;
    writeMaster(master);
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

  async function init() {
    const pulled = await pullNow();

    // If remote is empty but local has state, push local up (first-time setup)
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
