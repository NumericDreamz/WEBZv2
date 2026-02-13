(function () {
  function getDatasetKey() {
    try {
      const env = window.PortalApp && window.PortalApp.Env;
      if (env && typeof env.getDatasetKey === "function") return env.getDatasetKey();
    } catch (_) {}
    const k = (window.PORTALSTATE_DATASET || "").toString().trim().toLowerCase();
    return k || "stable";
  }

  const DATASET_KEY = getDatasetKey();
  const LAST_SYNC_KEY = `ats_portal_last_sync_date_v1:${DATASET_KEY}`;

  function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // YYMMDD-HHMM-[dataset].json
  function filename() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yy}${mm}${dd}-${hh}${mi}-${DATASET_KEY}.json`;
  }

  function download(text, name) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function markSyncedToday() {
    localStorage.setItem(LAST_SYNC_KEY, localDateKey());
  }

  function setButtonState(btn, mode) {
    btn.classList.toggle("sync-good", mode === "good");
    btn.classList.toggle("sync-stale", mode === "stale");
    btn.classList.toggle("sync-busy", mode === "busy");
  }

  function updateSyncUI() {
    const btn = document.getElementById("sync-now");
    if (!btn) return;

    const last = localStorage.getItem(LAST_SYNC_KEY);
    const today = localDateKey();
    const good = (last === today);

    setButtonState(btn, good ? "good" : "stale");
  }

  function getStore() {
    const s = window.PortalApp && window.PortalApp.Storage;
    if (!s) return null;
    if (typeof s.exportAll !== "function") return null;
    if (typeof s.importAll !== "function") return null;
    return s;
  }

  function initSyncUI() {
    const syncText = document.getElementById("sync-text");
    if (syncText) syncText.style.display = "none";

    const store = getStore();
    if (!store) {
      setTimeout(initSyncUI, 50);
      return;
    }

    const syncBtn = document.getElementById("sync-now");
    const syncFile = document.getElementById("sync-file");
    if (!syncBtn || !syncFile) return;

    if (syncBtn.dataset.bound !== "1") {
      syncBtn.dataset.bound = "1";

      syncBtn.addEventListener("click", async (e) => {
        if (e.shiftKey) {
          syncFile.click();
          return;
        }

        if (e.ctrlKey || e.metaKey) {
          const json = store.exportAll();
          download(json, filename());
          markSyncedToday();
          updateSyncUI();
          return;
        }

        if (e.altKey) {
          if (typeof store.forcePull !== "function") return;

          setButtonState(syncBtn, "busy");
          const res = await store.forcePull();
          markSyncedToday();
          updateSyncUI();

          if (res?.ok) location.reload();
          return;
        }

        if (typeof store.forcePush === "function") {
          setButtonState(syncBtn, "busy");
          const res = await store.forcePush();
          markSyncedToday();
          updateSyncUI();

          if (!res?.ok) {
            const json = store.exportAll();
            download(json, filename());
          }

          return;
        }

        const json = store.exportAll();
        download(json, filename());
        markSyncedToday();
        updateSyncUI();
      });
    }

    if (syncFile.dataset.bound !== "1") {
      syncFile.dataset.bound = "1";

      syncFile.addEventListener("change", async () => {
        const file = syncFile.files && syncFile.files[0];
        if (!file) return;

        try {
          const text = await file.text();
          store.importAll(text);
          markSyncedToday();
          updateSyncUI();
          location.reload();
        } catch (e) {
          alert(String(e.message || e));
        } finally {
          syncFile.value = "";
        }
      });
    }

    updateSyncUI();
    setInterval(updateSyncUI, 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSyncUI);
  } else {
    initSyncUI();
  }

  window.PortalBackup = { initBackupUI: initSyncUI };
})();
