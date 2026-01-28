window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  const MASTER_KEY = "ats_portal_state_v1";
  const REMOTE_CACHE_KEY = "portal_state_cache_v1"; // keep in sync with persistence.js/console tests

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

  function mirrorToRemoteCache(master) {
    // This makes your old console POST + any persistence.js that reads this key still work.
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(master || {}));
    } catch (_) {}
  }

  function readMaster() {
    const raw = localStorage.getItem(MASTER_KEY);
    const master = raw ? safeParse(raw) : {};

    // Migrate legacy keys into master once
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

    // Keep cache key mirrored too
    if (changed) {
      localStorage.setItem(MASTER_KEY, JSON.stringify(master));
    }
    mirrorToRemoteCache(master);

    return master;
  }

  function writeMaster(master) {
    localStorage.setItem(MASTER_KEY, JSON.stringify(master || {}));
    mirrorToRemoteCache(master);
  }

  async function pushNow(master) {
    const p = window.PortalApp?.Persistence;

    // If persistence.js isn't wired, nothing remote will happen.
    if (!p || typeof p.setState !== "function") return { ok: false, reason: "no_persistence" };

    // Some versions of persistence.js might ignore args and read from REMOTE_CACHE_KEY,
    // so we mirror first (already done in writeMaster/save).
    try {
      const res = await p.setState(master);
      return res || { ok: true };
    } catch (e) {
      console.warn("Remote push failed:", e);
      return { ok: false, reason: "push_failed", error: String(e) };
    }
  }

  function schedulePush(master) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow(master); }, PUSH_DEBOUNCE_MS);
  }

  // Pull remote state and overwrite local master (remote becomes source of truth)
  async function bootstrap() {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.getState !== "function") return { ok: false, reason: "no_persistence" };

    try {
      const remote = await p.getState();
      if (!remote || typeof remote !== "object") return { ok: true, state: null };

      writeMaster(remote);
      return { ok: true, state: remote };
    } catch (e) {
      console.warn("Remote pull failed:", e);
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

    // If you import, push it up too
    schedulePush(obj);
  }

  // Handy manual controls (you can wire these to SYNC button if you want)
  async function forcePush() {
    const master = readMaster();
    return pushNow(master);
  }

  async function forcePull() {
    return bootstrap();
  }

  return { load, save, exportAll, importAll, bootstrap, forcePush, forcePull };
})();
