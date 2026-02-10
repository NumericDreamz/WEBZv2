window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  "use strict";

  console.log("[Portal] storage.js build 2026-02-09_01");

  const MASTER_KEY = "ats_portal_state_v1";
  const REMOTE_CACHE_KEY = "portal_state_cache_v1";
  const META_KEY = "__meta";

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

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function ensureMeta(master) {
    if (!master || typeof master !== "object") master = {};
    if (!master[META_KEY] || typeof master[META_KEY] !== "object") master[META_KEY] = {};
    if (typeof master[META_KEY].updatedAt !== "number") master[META_KEY].updatedAt = 0;
    if (!master[META_KEY].deviceId) master[META_KEY].deviceId = uid();
    return master;
  }

  function metaUpdatedAt(obj) {
    try {
      const t = obj && obj[META_KEY] && typeof obj[META_KEY].updatedAt === "number" ? obj[META_KEY].updatedAt : 0;
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }

  function mirrorRemoteCache(master) {
    try {
      localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(master || {}));
    } catch (_) {}
  }

  function readMaster() {
    const raw = localStorage.getItem(MASTER_KEY);
    let master = raw ? safeParse(raw) : {};
    master = ensureMeta(master);

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

    if (changed) {
      localStorage.setItem(MASTER_KEY, JSON.stringify(master));
    }

    mirrorRemoteCache(master);
    return master;
  }

  function writeMaster(master) {
    const m = ensureMeta(master || {});
    localStorage.setItem(MASTER_KEY, JSON.stringify(m));
    mirrorRemoteCache(m);
  }

  // Canonical config accessor.
  // Does NOT store secrets here. It just reads what config.js (or Persistence) already set.
  function getConfig() {
    const p = window.PortalApp?.Persistence;
    const pcfg = (p && typeof p.getConfig === "function") ? p.getConfig() : null;

    const webAppUrl =
      (window.PORTALSTATE_WEBAPP_URL || window.GSCRIPT_WEBAPP_URL || pcfg?.webAppUrl || pcfg?.url || "").toString().trim();

    const token =
      (window.PORTALSTATE_TOKEN || window.GSCRIPT_TOKEN || pcfg?.token || pcfg?.secret || "").toString().trim();

    const dashboardId =
      (window.PORTALSTATE_DASHBOARD_ID || pcfg?.dashboardId || "ats-portal").toString().trim();

    return { webAppUrl, token, dashboardId };
  }

  async function pushNow(master) {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.setState !== "function") {
      return { ok: false, reason: "PortalApp.Persistence.setState missing" };
    }

    mirrorRemoteCache(master);

    try {
      const res = await p.setState(master);
      return res || { ok: true };
    } catch (e) {
      return { ok: false, reason: "push_failed", error: String(e) };
    }
  }

  function schedulePush(master) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushNow(master).catch((e) => console.warn("[Portal] Remote push failed:", e));
    }, PUSH_DEBOUNCE_MS);
  }

  async function fetchRemote() {
    const p = window.PortalApp?.Persistence;
    if (!p || typeof p.getState !== "function") {
      return { ok: false, reason: "PortalApp.Persistence.getState missing" };
    }

    try {
      const res = await p.getState();
      if (res && res.ok && res.state && typeof res.state === "object") {
        return { ok: true, state: ensureMeta(res.state) };
      }
      if (res && res.ok && !res.state) return { ok: true, state: null };
      return { ok: false, reason: "pull_failed", error: res?.error || "unknown" };
    } catch (e) {
      return { ok: false, reason: "pull_failed", error: String(e) };
    }
  }

  function chooseWinner(local, remote) {
    const lt = metaUpdatedAt(local);
    const rt = metaUpdatedAt(remote);

    // Only let remote overwrite if it is strictly newer.
    // If equal or remote missing meta, keep local.
    return (rt > lt) ? remote : local;
  }

  function load(key) {
    const master = readMaster();
    return (Object.prototype.hasOwnProperty.call(master, key)) ? master[key] : null;
  }

  function save(key, val) {
    const master = readMaster();
    master[key] = val;
    master[META_KEY].updatedAt = Date.now();
    writeMaster(master);
    schedulePush(master);
  }

  function exportAll() {
    const master = readMaster();
    return JSON.stringify(master, null, 2);
  }

  function importAll(jsonText) {
    const obj = ensureMeta(safeParse(jsonText));
    if (!obj || typeof obj !== "object") throw new Error("Backup file is not valid JSON.");
    obj[META_KEY].updatedAt = Date.now();
    writeMaster(obj);
    schedulePush(obj);
  }

  // app.js calls this
  async function init() {
    const local = readMaster();
    const pulled = await fetchRemote();

    // Remote empty: push local up for first-time setup
    if (pulled?.ok && !pulled?.state) {
      if (Object.keys(local).length) await pushNow(local);
      return pulled;
    }

    // Remote has data: pick the newest (by meta.updatedAt)
    if (pulled?.ok && pulled.state) {
      const remote = pulled.state;
      const winner = chooseWinner(local, remote);
      writeMaster(winner);

      // If local was newer, push it up so remote stops resurrecting zombies.
      if (winner === local && metaUpdatedAt(local) > metaUpdatedAt(remote)) {
        await pushNow(local);
      }

      return { ok: true, state: winner };
    }

    return pulled;
  }

  async function forcePush() {
    const master = readMaster();
    return pushNow(master);
  }

  async function forcePull() {
    const local = readMaster();
    const pulled = await fetchRemote();
    if (pulled?.ok && pulled.state) {
      const winner = chooseWinner(local, pulled.state);
      writeMaster(winner);
      if (winner === local && metaUpdatedAt(local) > metaUpdatedAt(pulled.state)) {
        await pushNow(local);
      }
    }
    return pulled;
  }

  return { load, save, exportAll, importAll, init, forcePush, forcePull, getConfig };
})();
