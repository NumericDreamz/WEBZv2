window.PortalApp = window.PortalApp || {};

PortalApp.Storage = (function () {
  const MASTER_KEY = "ats_portal_state_v1";

  function safeParse(raw) {
    try {
      const v = JSON.parse(raw);
      return (v && typeof v === "object") ? v : {};
    } catch {
      return {};
    }
  }

  function readMaster() {
    const raw = localStorage.getItem(MASTER_KEY);
    const master = raw ? safeParse(raw) : {};

    // Migrate legacy keys into master once (so backup captures everything)
    // This grabs anything that looks like our widgets.
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
      // leave legacy key in place (safe), but master becomes source of truth
    }

    localStorage.setItem(MASTER_KEY, JSON.stringify(master));
    return master;
  }

  function writeMaster(master) {
    localStorage.setItem(MASTER_KEY, JSON.stringify(master));
  }

  function load(key) {
    const master = readMaster();
    return master[key] ?? {};
  }

  function save(key, val) {
    const master = readMaster();
    master[key] = val;
    writeMaster(master);
  }

  function exportAll() {
    const master = readMaster();
    return JSON.stringify(master, null, 2);
  }

  function importAll(jsonText) {
    const obj = safeParse(jsonText);
    if (!obj || typeof obj !== "object") throw new Error("Backup file is not valid JSON.");
    writeMaster(obj);
  }

  return { load, save, exportAll, importAll };
})();
