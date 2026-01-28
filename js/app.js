(function () {
  async function boot() {
    // If persistence.js is loaded, pull remote state first.
    // If it's not loaded, this does nothing and your dashboard behaves like before.
    try {
      if (window.PortalApp && PortalApp.Storage && typeof PortalApp.Storage.init === "function") {
        await PortalApp.Storage.init();
      }
    } catch (err) {
      console.warn("[Portal] Storage.init failed (falling back to local only):", err);
    }

    // Monthly on the left (keep your config intact)
    window.PortalWidgets.Monthly.init("monthly-metrics-slot", {
      metrics: [
        { id: "loto_obs", label: "LOTO Observations", target: 4 },
        { id: "care_convos", label: "Care Conversations", target: 5 },

        // Recognition points tracker
        { id: "recognition", type: "recognition", label: "Recognition", allotment: 140 }
      ]
    });

    window.PortalWidgets.Daily.init("daily-metrics-slot");
    window.PortalWidgets.Weekly.init("weekly-metrics-slot");
    window.PortalWidgets.Yearly.init("yearly-metrics-slot");
    window.PortalWidgets.RecentTasks.init("recent-tasks-slot");

    window.PortalBackup?.initBackupUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { boot(); });
  } else {
    boot();
  }
})();
