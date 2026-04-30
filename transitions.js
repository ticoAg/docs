(function () {
  const selector = [
    "mdx-content card",
    "mdx-content callout",
    "mdx-content accordion",
    "mdx-content frame",
    "mdx-content steps",
    "mdx-content code-group",
  ].join(",");

  const reveal = () => {
    const elements = document.querySelectorAll(selector);
    const pending = [];

    elements.forEach((element, index) => {
      if (element.dataset.transitionMounted === "true") {
        return;
      }

      element.dataset.transitionMounted = "true";
      element.dataset.open = "false";
      element.classList.add("t-panel-slide");
      element.style.transitionDelay = `${Math.min(index * 22, 132)}ms`;
      pending.push(element);
    });

    if (pending.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      pending.forEach((element) => {
        element.dataset.open = "true";
      });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reveal, { once: true });
  } else {
    reveal();
  }

  let timeoutId;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(reveal, 60);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
