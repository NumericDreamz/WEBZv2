(function () {
  async function boot() {
    try {
      const store = window.PortalApp && window.PortalApp.Storage;

      // Pull remote state first if available (but NEVER block rendering)
      if (store && typeof store.init === "function") {
        try {
          await store.init();
        } catch (err) {
          console.warn("[Portal] Storage.init failed (continuing local-only):", err);
        }
      }

      if (!window.PortalWidgets) {
        console.error("[Portal] PortalWidgets missing. Scripts not loaded?");
        return;
      }

      // Monthly on the left
      window.PortalWidgets.Monthly?.init("monthly-metrics-slot", {
        metrics: [
          { id: "loto_obs", label: "LOTO Observations", target: 4 },
          { id: "care_convos", label: "Care Conversations", target: 5 },
          { id: "recognition", type: "recognition", label: "Recognition", allotment: 150 }
        ]
      });

      window.PortalWidgets.Daily?.init("daily-metrics-slot");
      window.PortalWidgets.Weekly?.init("weekly-metrics-slot");
      window.PortalWidgets.Yearly?.init("yearly-metrics-slot");
      window.PortalWidgets.RecentTasks?.init("recent-tasks-slot");
      window.PortalWidgets.Tier1Briefing?.init("tier1-briefing-slot");

      // ✅ Backlog widget (fills #backlogList inside your existing section)
      window.PortalWidgets.Backlog?.init("backlogList", { limit: 50 });

      console.log("[Portal] boot complete");
    } catch (err) {
      console.error("[Portal] boot crashed:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
