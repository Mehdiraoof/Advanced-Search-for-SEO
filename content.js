chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "highlight") {
    const searchItems = message.terms.map(t => t.toLowerCase().trim());

    // ✅ Inject highlight styles
    const style = document.createElement("style");
    style.textContent = `
      mark.seo-highlight {
        background-color: #ffde5c !important;
        color: #333 !important;
        font-weight: bold;
        border-radius: 2px;
        padding: 1px 2px;
      }
    `;
    document.head.appendChild(style);

    // ✅ Traverse all text nodes on the page
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walk.nextNode()) {
      textNodes.push(walk.currentNode);
    }

    textNodes.forEach(node => {
      const parent = node.parentNode;
      if (!parent || node.nodeValue.trim() === "") return;

      let html = node.nodeValue;

      searchItems.forEach(term => {
        const safeTerm = term.replace(/[.+^${}()|[\]\\]/g, '\\$&'); // escape special regex chars
        const regex = new RegExp(`(${safeTerm})`, "gi");
        html = html.replace(regex, '<mark class="seo-highlight">$1</mark>');
      });

      if (html !== node.nodeValue) {
        const span = document.createElement("span");
        span.innerHTML = html;
        parent.replaceChild(span, node);
      }
    });

    sendResponse({ status: "highlighted" });
  }
});
