(function () {
  function bind(root) {
    if (!root || root.dataset.bound === "true") return;
    root.dataset.bound = "true";

    const chips = root.querySelectorAll(".skill-chip");
    const input = root.querySelector("#skill-q, .skill-q");
    const rows = root.querySelectorAll("tbody tr");
    const countEl = root.querySelector("#skill-count, .skill-count");
    const total = rows.length;
    let cat = "all";

    function apply() {
      const q = (input && input.value ? input.value : "").trim().toLowerCase();
      let shown = 0;
      rows.forEach((row) => {
        const catOk = cat === "all" || row.dataset.cat === cat;
        const text = row.dataset.text || row.textContent.toLowerCase();
        const qOk = !q || text.includes(q);
        const on = catOk && qOk;
        row.hidden = !on;
        if (on) shown += 1;
      });
      if (countEl) countEl.textContent = String(shown);
      chips.forEach((chip) => {
        chip.classList.toggle("is-on", chip.dataset.cat === cat);
      });
    }

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        cat = chip.dataset.cat || "all";
        apply();
      });
    });
    if (input) input.addEventListener("input", apply);
  }

  function scan() {
    document.querySelectorAll("#skill-catalog-root, #skill-dir-root").forEach(bind);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }

  let t;
  new MutationObserver(() => {
    window.clearTimeout(t);
    t = window.setTimeout(scan, 80);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
