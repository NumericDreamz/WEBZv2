(function () {
  const LAST_SYNC_KEY = "ats_portal_last_sync_date_v1";

  function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // NEW: YYMMDD-HHMM.json  (24-hour time)
  function filename() {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yy}${mm}${dd}-${hh}${mi}.json`;
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

  function updateSyncUI() {
    const btn = document.getElementById("sync-now");
    if (!btn) return;

    const last = localStorage.getItem(LAST_SYNC_KEY);
    const today = localDateKey();
    const good = (last === today);

    btn.classList.toggle("sync-good", good);
    btn.classList.toggle("sync-stale", !good);
  }

  function getStore() {
    const s = window.PortalApp && window.PortalApp.Storage;
    if (!s) return null;
    if (typeof s.exportAll !== "function") return null;
    if (typeof s.importAll !== "function") return null;
    return s;
  }

  function initSyncUI() {
    // If you left the extra span in HTML, hide it.
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
      syncBtn.addEventListener("click", (e) => {
        // Shift+Click = import; normal click = export
        if (e.shiftKey) {
          syncFile.click();
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
