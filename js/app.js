(function () {
  function boot() {
    // Monthly on the left
    window.PortalWidgets.Monthly.init("monthly-metrics-slot", {
      metrics: [
        { id: "loto_obs", label: "LOTO Observations", target: 4 },
        { id: "care_convos", label: "Care Conversations", target: 5 },

        // NEW: Recognition points tracker
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
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
