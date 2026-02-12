const COLOR_MAP = globalThis.PASTELGPT_COLORS_BY_ID;
const extractConversationIdFromHref = (href) => globalThis.PASTELGPT_extractConversationId(href, location.origin);

const TINTS = {
  off:       null,
  cherry:    "rgba(255, 107, 107, 0.10)",
  banana:    "rgba(255, 212, 59,  0.10)",
  matcha:    "rgba(105, 219, 124, 0.10)",
  blueberry: "rgba(116, 192, 252, 0.10)",
  grape:     "rgba(218, 119, 242, 0.10)",
};
const MANAGED_ITEM_ATTR = "data-pastelgpt-managed";
const CONTEXT_INVALIDATED_MSG = "Extension context invalidated";

let refreshHintShown = false;

function findChatSidebarNav() {
  const candidates = Array.from(document.querySelectorAll("nav, aside"));
  for (const el of candidates) {
    const links = el.querySelectorAll('a[href*="/c/"]');
    if (links.length >= 3) return el;
  }
  const anyLink = document.querySelector('a[href*="/c/"]');
  return anyLink ? anyLink.closest("nav, aside") : null;
}

function getItemElementFromLink(link) {
  return link.closest("li") || link.closest('[role="listitem"]') || link;
}

async function loadAll() {
  const { tags = {}, settings = {} } = await chrome.storage.local.get(["tags", "settings"]);
  return { tags, settings };
}

function applyTagToLink(link, colorId) {
  if (!link) return;
  const c = colorId && COLOR_MAP[colorId] ? COLOR_MAP[colorId] : null;

  if (!c) {
    link.classList.remove("pastelgpt-tagged");
    link.style.removeProperty("--pastelgpt-tag-color");
    link.dataset.pastelgptTag = "";
    return;
  }

  link.classList.add("pastelgpt-tagged");
  link.style.setProperty("--pastelgpt-tag-color", c.hex);
  link.dataset.pastelgptTag = colorId;
}

function applyFilterToLink(link, shouldShow) {
  const item = getItemElementFromLink(link);
  if (!item) return;
  item.setAttribute(MANAGED_ITEM_ATTR, "1");
  item.classList.toggle("pastelgpt-hidden", !shouldShow);
}

function clearManagedFilters() {
  for (const item of document.querySelectorAll(`[${MANAGED_ITEM_ATTR}="1"]`)) {
    item.classList.remove("pastelgpt-hidden");
    item.removeAttribute(MANAGED_ITEM_ATTR);
  }
}

function isExtensionContextInvalidated(error) {
  const message = String(error?.message || error || "");
  return message.includes(CONTEXT_INVALIDATED_MSG);
}

function showRefreshHint() {
  if (refreshHintShown) return;
  refreshHintShown = true;

  const host = document.body || document.documentElement;
  if (!host) return;

  const hint = document.createElement("div");
  hint.className = "pastelgpt-refresh-hint";
  hint.textContent = "PastelGPT was updated. Refresh this tab to continue tagging.";
  hint.setAttribute("role", "status");
  hint.style.position = "fixed";
  hint.style.right = "16px";
  hint.style.bottom = "16px";
  hint.style.zIndex = "2147483647";
  hint.style.padding = "10px 12px";
  hint.style.borderRadius = "10px";
  hint.style.background = "rgba(20,20,20,0.94)";
  hint.style.border = "1px solid rgba(255,255,255,0.18)";
  hint.style.color = "rgba(255,255,255,0.96)";
  hint.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  hint.style.boxShadow = "0 10px 24px rgba(0,0,0,0.35)";
  hint.style.maxWidth = "300px";

  host.appendChild(hint);
}

function applyPageTint(tintKey) {
  const tint = TINTS[tintKey] ?? null;
  if (!tint) {
    document.body.classList.remove("pastelgpt-page-tinted");
    document.body.style.removeProperty("--pastelgpt-page-tint-color");
    return;
  }
  document.body.classList.add("pastelgpt-page-tinted");
  document.body.style.setProperty("--pastelgpt-page-tint-color", tint);
}

async function render() {
  const { tags, settings } = await loadAll();
  let enabledColors = Array.isArray(settings?.enabledColors) ? settings.enabledColors : Object.keys(COLOR_MAP);
  if (enabledColors.length === 0) enabledColors = Object.keys(COLOR_MAP);
  const showUntagged = settings?.showUntagged ?? true;
  const tintKey = settings?.tint ?? "off";

  const nav = findChatSidebarNav();
  applyPageTint(tintKey);
  if (!nav) {
    clearManagedFilters();
    return;
  }

  const links = Array.from(nav.querySelectorAll('a[href*="/c/"]'));
  for (const link of links) {
    const convId = extractConversationIdFromHref(link.getAttribute("href"));
    if (!convId) continue;

    const colorId = tags[convId] || "";
    applyTagToLink(link, colorId);

    const isTagged = Boolean(colorId);
    const shouldShow = isTagged ? enabledColors.includes(colorId) : showUntagged;
    applyFilterToLink(link, shouldShow);
  }
}

let menuEl = null;
let menuConvId = "";
let menuOpen = false;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement("div");
  menuEl.className = "pastelgpt-menu";
  menuEl.style.display = "none";

  const makeItem = (label, dotColor, onClick, extraClass="") => {
    const item = document.createElement("div");
    item.className = "pastelgpt-menu-item " + extraClass;
    const dot = document.createElement("div");
    dot.className = "pastelgpt-menu-dot";
    if (dotColor) dot.style.setProperty("--dot", dotColor);
    else dot.style.setProperty("--dot", "rgba(255,255,255,0.25)");
    const text = document.createElement("div");
    text.textContent = label;
    item.appendChild(dot);
    item.appendChild(text);
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      await onClick();
      hideMenu();
    });
    return item;
  };

  for (const [id, c] of Object.entries(COLOR_MAP)) {
    menuEl.appendChild(makeItem(c.label, c.hex, async () => {
      await setTagForConversation(menuConvId, id);
    }));
  }

  const sep = document.createElement("div");
  sep.className = "pastelgpt-menu-sep";
  menuEl.appendChild(sep);

  menuEl.appendChild(makeItem("Clear tag", null, async () => {
    await setTagForConversation(menuConvId, "");
  }, "pastelgpt-menu-clear"));

  document.body.appendChild(menuEl);

  document.addEventListener("click", hideMenu, true);
  document.addEventListener("scroll", hideMenu, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  }, true);

  return menuEl;
}

function showMenu(x, y, convId) {
  ensureMenu();
  menuConvId = convId || "";
  if (!menuConvId) return;

  menuEl.style.display = "block";
  menuEl.style.left = "0px";
  menuEl.style.top = "0px";

  const rect = menuEl.getBoundingClientRect();
  let left = x;
  let top = y;

  const pad = 8;
  if (left + rect.width + pad > window.innerWidth) left = window.innerWidth - rect.width - pad;
  if (top + rect.height + pad > window.innerHeight) top = window.innerHeight - rect.height - pad;
  if (left < pad) left = pad;
  if (top < pad) top = pad;

  menuEl.style.left = left + "px";
  menuEl.style.top = top + "px";
  menuOpen = true;
}

function hideMenu() {
  if (!menuEl || !menuOpen) return;
  menuEl.style.display = "none";
  menuOpen = false;
}

async function setTagForConversation(conversationId, colorId) {
  if (!conversationId) return;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "PASTELGPT_SET_TAG",
      conversationId,
      colorId
    });
    if (!result?.ok) throw new Error(result?.error || "Failed to update tag");
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      showRefreshHint();
      return;
    }

    console.warn("[PastelGPT] Falling back to direct tag write", error);
    try {
      const { tags = {} } = await chrome.storage.local.get(["tags"]);
      if (!colorId) delete tags[conversationId];
      else tags[conversationId] = colorId;
      await chrome.storage.local.set({ tags });
    } catch (fallbackError) {
      console.warn("[PastelGPT] Direct tag write failed", fallbackError);
      return;
    }
  }
  await render();
}

document.addEventListener("contextmenu", (ev) => {
  const a = ev.target?.closest?.('a[href*="/c/"]');
  if (!a) return;

  const nav = findChatSidebarNav();
  if (nav && !nav.contains(a)) return;

  const convId = extractConversationIdFromHref(a.getAttribute("href"));
  if (!convId) return;

  ev.preventDefault();
  ev.stopPropagation();

  showMenu(ev.clientX, ev.clientY, convId);
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.tags || changes.settings) {
    render().catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PASTELGPT_REFRESH") {
    render().catch(() => {});
  }
});

const mo = new MutationObserver(() => {
  clearTimeout(window.__pastelgptRenderTimer);
  window.__pastelgptRenderTimer = setTimeout(() => render().catch(() => {}), 120);
});
mo.observe(document.documentElement, { childList: true, subtree: true });

render().catch(() => {});
