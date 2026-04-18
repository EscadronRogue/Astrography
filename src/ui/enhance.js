/* Astrography UI enhancements — sidebar filter search.
   No theme switcher: Observatory is the only theme.
   Does not touch application logic; decorates the DOM only.
*/
(function () {
  function buildFilterSearch() {
    const sidebar = document.querySelector(".sidebar");
    const form = document.getElementById("filters-form");
    if (!sidebar || !form || sidebar.querySelector(".ag-filter-search")) return;

    const wrap = document.createElement("div");
    wrap.className = "ag-filter-search";
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search filters…";
    input.setAttribute("aria-label", "Search filters");
    wrap.appendChild(input);
    const kbd = document.createElement("kbd");
    kbd.textContent = "/";
    wrap.appendChild(kbd);

    sidebar.insertBefore(wrap, form);

    function runSearch(q) {
      q = (q || "").trim().toLowerCase();
      const fieldsets = form.querySelectorAll("fieldset");
      const sectionLabels = form.querySelectorAll(".ag-section");
      // Hide section labels during active search
      sectionLabels.forEach(s => s.classList.toggle("ag-hidden", !!q));

      fieldsets.forEach(fs => {
        let anyVisible = false;
        const legend = fs.querySelector("legend");
        const legendText = legend ? legend.textContent.toLowerCase() : "";
        const items = fs.querySelectorAll(".filter-item");
        const subheads = fs.querySelectorAll(".filter-subhead");

        if (!q) {
          fs.classList.remove("ag-hidden");
          items.forEach(i => i.classList.remove("ag-hidden"));
          subheads.forEach(s => s.classList.remove("ag-hidden"));
          fs.querySelectorAll(".stellar-class-subcategory")
            .forEach(s => s.classList.remove("ag-hidden"));
          return;
        }

        items.forEach(item => {
          const t = item.textContent.toLowerCase();
          const match = t.includes(q) || legendText.includes(q);
          item.classList.toggle("ag-hidden", !match);
          if (match) anyVisible = true;
        });

        subheads.forEach(s => s.classList.toggle("ag-hidden", true));

        fs.querySelectorAll(".stellar-class-subcategory").forEach(sub => {
          const t = sub.textContent.toLowerCase();
          const match = t.includes(q) || legendText.includes(q);
          sub.classList.toggle("ag-hidden", !match);
          if (match) anyVisible = true;
        });

        if (legendText.includes(q)) anyVisible = true;
        fs.classList.toggle("ag-hidden", !anyVisible);

        if (anyVisible && legend && !legend.classList.contains("active")) {
          legend.classList.add("active");
        }
      });
    }

    input.addEventListener("input", e => runSearch(e.target.value));
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { input.value = ""; runSearch(""); input.blur(); }
    });

    window.addEventListener("keydown", e => {
      if (e.key === "/" && document.activeElement !== input &&
          !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) {
        e.preventDefault();
        const sidebarEl = document.querySelector(".sidebar");
        if (sidebarEl && !sidebarEl.classList.contains("open")) {
          const toggle = document.getElementById("menu-toggle");
          if (toggle) toggle.click();
        }
        input.focus();
      }
    });
  }

  // Dynamic fieldsets injected by buildSidebar.js land at the end of the
  // form. Move them into the Features / View slots we left in the markup
  // so the final order matches the information architecture:
  //   View: … Globe Surface, Planes
  //   Features (new section): Constellations, Dust Clouds, Dust Cloud Density
  // Keyed by the first id found inside each dynamic fieldset — legend text
  // alone is fragile if names ever change.
  const RELOCATIONS = {
    "ag-slot-view": [
      "globe-opaque-surface",        // Globe Surface
      "show-galactic-plane"          // Planes
    ],
    "ag-slot-features": [
      "show-constellation-boundaries", // Constellations
      "dust-cloud-aquila",             // Dust Clouds
      "dust-density-aquila"            // Dust Cloud Density
    ]
  };

  function relocateFieldsets() {
    const form = document.getElementById("filters-form");
    if (!form) return false;
    let moved = 0, needed = 0;
    for (const [slotId, anchors] of Object.entries(RELOCATIONS)) {
      const slot = document.getElementById(slotId);
      if (!slot) continue;
      for (const anchorId of anchors) {
        needed++;
        // Already moved?
        if (slot.querySelector("#" + CSS.escape(anchorId))) { moved++; continue; }
        const el = document.getElementById(anchorId);
        if (!el) continue;
        const fs = el.closest("fieldset");
        if (fs) { slot.appendChild(fs); moved++; }
      }
    }
    return moved === needed;
  }

  function boot() {
    // Force Observatory; no switcher UI.
    document.documentElement.setAttribute("data-theme", "observatory");
    buildFilterSearch();

    // Keep trying until all dynamic fieldsets have been relocated. They're
    // appended asynchronously inside buildSidebar() → load{Constellation…}.
    if (!relocateFieldsets()) {
      const form = document.getElementById("filters-form");
      if (form) {
        const obs = new MutationObserver(() => {
          if (relocateFieldsets()) obs.disconnect();
        });
        obs.observe(form, { childList: true });
        // Safety timeout.
        setTimeout(() => obs.disconnect(), 8000);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  // Re-run once filters have been populated by the app (stellar class items
  // are injected later).
  setTimeout(buildFilterSearch, 800);
})();
