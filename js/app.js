(function () {
  async function boot() {
    try {
      // Always use window-qualified refs. No magic globals.
      const store = window.PortalApp && window.PortalApp.Storage;

      // Pull remote state first if available (but NEVER block rendering)
      if (store && typeof store.init === "function") {
        try {
          await store.init();
        } catch (err) {
          console.warn("[Portal] Storage.init failed (continuing local-only):", err);
        }
      }

      // Sanity: ensure widgets exist
      if (!window.PortalWidgets) {
        console.error("[Portal] PortalWidgets missing. Scripts not loaded?");
        return;
      }

      // Monthly on the left
      window.PortalWidgets.Monthly?.init("monthly-metrics-slot", {
        metrics: [
          { id: "loto_obs", label: "LOTO Observations", target: 4 },
          { id: "care_convos", label: "Care Conversations", target: 5 },
          { id: "recognition", type: "recognition", label: "Recognition", allotment: 140 }
        ]
      });

      window.PortalWidgets.Daily?.init("daily-metrics-slot");
      window.PortalWidgets.Weekly?.init("weekly-metrics-slot");
      window.PortalWidgets.Yearly?.init("yearly-metrics-slot");
      window.PortalWidgets.RecentTasks?.init("recent-tasks-slot");

      console.log("[Portal] boot complete");
    } catch (err) {
      console.error("[Portal] boot crashed:", err);
    }
  }

  // With defer scripts, DOM is parsed before this runs, but this is safe either way.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

