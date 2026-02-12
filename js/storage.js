window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  "use strict";

  console.log("[Portal] storage.js build 2026-02-12_02");

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

    if (!master[META_KEY] || typeof master[META_KEY] !== "object") {
      master[META_KEY] = {};
    }

    const meta = master[META_KEY];

    if (typeof meta.updatedAt !== "number" || !Number.isFinite(meta.updatedAt)) meta.updatedAt = 0;
    if (!meta.deviceId) meta.deviceId = uid();

    if (!meta.keys || typeof meta.keys !== "object") meta.keys = {};
    return master;
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

    // Migrate legacy portal_* keys into master once (so backup captures everything)
    let changed = false;
    const meta = master[META_KEY];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === MASTER_KEY || k === REMOTE_CACHE_KEY) continue;

      const looksLikeOurs =
        k.startsWith("portal_") ||
        k.startsWith("metrics_") ||
        k.includes("_metrics_");

      if (!looksLikeOurs) continue;
      if (Object.prototype.hasOwnProperty.call(master, k)) continue;

      const legacyRaw = localStorage.getItem(k);
      if (!legacyRaw) continue;

      master[k] = safeParse(legacyRaw);

      // Give migrated keys a timestamp that won't beat real saves
      if (!meta.keys[k]) meta.keys[k] = { updatedAt: 0, deviceId: meta.deviceId };

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

  function keyStamp(master, key) {
    try {
      const meta = master && master[META_KEY];
      const ks = meta && meta.keys && meta.keys[key];
      const t = ks && typeof ks.updatedAt === "number" ? ks.updatedAt : 0;

      // Back-compat: if key has no stamp, fall back to global meta.updatedAt
      if (Number.isFinite(t) && t > 0) return t;

      const g = meta && typeof meta.updatedAt === "number" ? meta.updatedAt : 0;
      return Number.isFinite(g) ? g : 0;
    } catch {
      return 0;
    }
  }

  function setKeyStamp(master, key, t, deviceId) {
    master = ensureMeta(master);
    const meta = master[META_KEY];
    if (!meta.keys || typeof meta.keys !== "object") meta.keys = {};
    meta.keys[key] = { updatedAt: t, deviceId: deviceId || meta.deviceId };
  }

  function mergeMasters(local, remote) {
    local = ensureMeta(local || {});
    remote = ensureMeta(remote || {});

    const merged = {};
    merged[META_KEY] = {
      updatedAt: 0,
      deviceId: local[META_KEY].deviceId, // this device
      keys: {}
    };

    const localKeys = Object.keys(local).filter(k => k !== META_KEY);
    const remoteKeys = Object.keys(remote).filter(k => k !== META_KEY);

    const allKeys = new Set([...localKeys, ...remoteKeys]);

    let needsPush = false;

    for (const k of allKeys) {
      const lt = keyStamp(local, k);
      const rt = keyStamp(remote, k);

      const lHas = Object.prototype.hasOwnProperty.call(local, k);
      const rHas = Object.prototype.hasOwnProperty.call(remote, k);

      // If one side doesn't have it, take the other (but don't let "undefined" delete stuff).
      if (lHas && !rHas) {
        merged[k] = local[k];
        setKeyStamp(merged, k, lt || local[META_KEY].updatedAt || 0, local[META_KEY].deviceId);
        needsPush = true;
        continue;
      }
      if (!lHas && rHas) {
        merged[k] = remote[k];
        setKeyStamp(merged, k, rt || remote[META_KEY].updatedAt || 0, remote[META_KEY].deviceId);
        continue;
      }

      // Both have it: newer key-stamp wins.
      if (rt > lt) {
        merged[k] = remote[k];
        setKeyStamp(merged, k, rt, remote[META_KEY].deviceId);
        continue;
      }
      if (lt > rt) {
        merged[k] = local[k];
        setKeyStamp(merged, k, lt, local[META_KEY].deviceId);
        needsPush = true;
        continue;
      }

      // Tie: prefer remote to converge (but only if it actually has something).
      // If remote is null/undefined and local has data, keep local.
      const rv = remote[k];
      const lv = local[k];

      const remoteEmpty = (rv == null);
      const localEmpty = (lv == null);

      if (!remoteEmpty || localEmpty) {
        merged[k] = rv;
        setKeyStamp(merged, k, rt, remote[META_KEY].deviceId);
      } else {
        merged[k] = lv;
        setKeyStamp(merged, k, lt, local[META_KEY].deviceId);
        needsPush = true;
      }
    }

    // Global meta.updatedAt = max key timestamp we ended up with
    let maxT = 0;
    const mk = merged[META_KEY].keys;
    for (const k of Object.keys(mk)) {
      const t = mk[k] && typeof mk[k].updatedAt === "number" ? mk[k].updatedAt : 0;
      if (t > maxT) maxT = t;
    }
    merged[META_KEY].updatedAt = maxT || Date.now();

    return { merged, needsPush };
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

  function load(key) {
    const master = readMaster();
    return Object.prototype.hasOwnProperty.call(master, key) ? master[key] : null;
  }

  function save(key, val) {
    const master = readMaster();
    const now = Date.now();

    master[key] = val;

    master[META_KEY].updatedAt = now;
    setKeyStamp(master, key, now, master[META_KEY].deviceId);

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

    const now = Date.now();
    obj[META_KEY].updatedAt = now;

    // Stamp all keys so imported backup wins consistently
    for (const k of Object.keys(obj)) {
      if (k === META_KEY) continue;
      setKeyStamp(obj, k, now, obj[META_KEY].deviceId);
    }

    writeMaster(obj);
    schedulePush(obj);
  }

  async function init() {
    const local = readMaster();
    const pulled = await fetchRemote();

    // Remote empty: push local up for first-time setup
    if (pulled?.ok && !pulled?.state) {
      if (Object.keys(local).length) await pushNow(local);
      return pulled;
    }

    // Remote has data: merge per key (fixes cross-device stomping)
    if (pulled?.ok && pulled.state) {
      const { merged, needsPush } = mergeMasters(local, pulled.state);
      writeMaster(merged);

      if (needsPush) {
        await pushNow(merged);
      }

      return { ok: true, state: merged };
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
      const { merged, needsPush } = mergeMasters(local, pulled.state);
      writeMaster(merged);
      if (needsPush) await pushNow(merged);
    }

    return pulled;
  }

  return { load, save, exportAll, importAll, init, forcePush, forcePull };
})();
