importScripts("colors.js");
const COLORS = globalThis.PASTELGPT_COLORS;
const extractConversationIdFromUrl = globalThis.PASTELGPT_extractConversationId;

const MENU_PREFIX = "pastelgpt_tag_";
const MENU_CLEAR = "pastelgpt_clear";

const lastTargetByTab = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.contextMenus.removeAll(); } catch (_) {}

  chrome.contextMenus.create({
    id: "pastelgpt_root",
    title: "Tag",
    contexts: ["page", "link"]
  });

  for (const c of COLORS) {
    chrome.contextMenus.create({
      id: MENU_PREFIX + c.id,
      parentId: "pastelgpt_root",
      title: `${c.emoji} ${c.label}`,
      contexts: ["page", "link"]
    });
  }

  chrome.contextMenus.create({
    id: MENU_CLEAR,
    parentId: "pastelgpt_root",
    title: "⬜ Clear tag",
    contexts: ["page", "link"]
  });
});

async function getState() {
  const { tags = {} } = await chrome.storage.local.get(["tags"]);
  return { tags };
}

async function setTag(conversationId, colorId) {
  const { tags } = await getState();
  if (!conversationId) return;
  if (!colorId) delete tags[conversationId];
  else tags[conversationId] = colorId;
  await chrome.storage.local.set({ tags });
}

async function notifyActiveTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PASTELGPT_REFRESH" });
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PASTELGPT_SET_TARGET" && sender?.tab?.id != null) {
    lastTargetByTab.set(sender.tab.id, msg.conversationId || "");
    sendResponse({ ok: true });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  if (tabId == null) return;

  const convFromLink = extractConversationIdFromUrl(info.linkUrl);
  const conversationId = convFromLink || lastTargetByTab.get(tabId) || "";

  if (!conversationId) return;

  if (info.menuItemId === MENU_CLEAR) {
    await setTag(conversationId, "");
    await notifyActiveTab(tabId);
    return;
  }

  if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(MENU_PREFIX)) {
    const colorId = info.menuItemId.slice(MENU_PREFIX.length);
    await setTag(conversationId, colorId);
    await notifyActiveTab(tabId);
  }
});
