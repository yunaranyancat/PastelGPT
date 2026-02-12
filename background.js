importScripts("colors.js");

const MENU_PREFIX = "pastelgpt_tag_";
const MENU_CLEAR = "pastelgpt_clear";
const MENU_CONTEXTS = ["link"];

let tagWriteChain = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  try { await chrome.contextMenus.removeAll(); } catch (_) {}

  chrome.contextMenus.create({
    id: "pastelgpt_root",
    title: "Tag",
    contexts: MENU_CONTEXTS
  });

  for (const c of COLORS) {
    chrome.contextMenus.create({
      id: MENU_PREFIX + c.id,
      parentId: "pastelgpt_root",
      title: `${c.emoji} ${c.label}`,
      contexts: MENU_CONTEXTS
    });
  }

  chrome.contextMenus.create({
    id: MENU_CLEAR,
    parentId: "pastelgpt_root",
    title: "\u2B1C Clear tag",
    contexts: MENU_CONTEXTS
  });
});

function enqueueTagMutation(mutateTags) {
  tagWriteChain = tagWriteChain
    .catch(() => {})
    .then(async () => {
      const { tags = {} } = await chrome.storage.local.get(["tags"]);
      mutateTags(tags);
      await chrome.storage.local.set({ tags });
    });

  return tagWriteChain;
}

async function setTag(conversationId, colorId) {
  if (!conversationId) return false;
  if (colorId && !COLORS_BY_ID[colorId]) return false;

  await enqueueTagMutation((tags) => {
    if (!colorId) delete tags[conversationId];
    else tags[conversationId] = colorId;
  });

  return true;
}

async function clearAllTags() {
  await enqueueTagMutation((tags) => {
    for (const conversationId of Object.keys(tags)) {
      delete tags[conversationId];
    }
  });
}

async function notifyActiveTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PASTELGPT_REFRESH" });
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PASTELGPT_SET_TAG") {
    setTag(msg.conversationId, msg.colorId)
      .then(async (ok) => {
        if (!ok) {
          return { ok: false, error: "Invalid conversation or color" };
        }
        if (sender?.tab?.id != null) await notifyActiveTab(sender.tab.id);
        return { ok: true };
      })
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (msg?.type === "PASTELGPT_CLEAR_ALL_TAGS") {
    clearAllTags()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  if (tabId == null) return;

  const conversationId = extractConversationId(info.linkUrl);
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
