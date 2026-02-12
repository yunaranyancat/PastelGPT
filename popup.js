const AVAILABLE_COLORS = globalThis.PASTELGPT_COLORS;

const DEFAULT_SETTINGS = {
  showUntagged: true,
  enabledColors: AVAILABLE_COLORS.map((c) => c.id),
  tint: "off",
};

const COLOR_ID_SET = new Set(AVAILABLE_COLORS.map((c) => c.id));
const TINT_OPTIONS = new Set(["off", "cherry", "banana", "matcha", "blueberry", "grape"]);

let saveChain = Promise.resolve();

function normalizeSettings(settings = {}) {
  const enabledColors = Array.isArray(settings.enabledColors)
    ? settings.enabledColors.filter((id) => COLOR_ID_SET.has(id))
    : [...DEFAULT_SETTINGS.enabledColors];

  return {
    showUntagged: typeof settings.showUntagged === "boolean"
      ? settings.showUntagged
      : DEFAULT_SETTINGS.showUntagged,
    enabledColors: enabledColors.length > 0 ? enabledColors : [...DEFAULT_SETTINGS.enabledColors],
    tint: typeof settings.tint === "string" && TINT_OPTIONS.has(settings.tint)
      ? settings.tint
      : DEFAULT_SETTINGS.tint,
  };
}

async function load() {
  const { settings = {} } = await chrome.storage.local.get(["settings"]);
  return { settings: normalizeSettings(settings) };
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "PASTELGPT_REFRESH" }); } catch (_) {}
  }
}

function queueSave(settings) {
  const snapshot = normalizeSettings(settings);
  saveChain = saveChain
    .then(async () => {
      await chrome.storage.local.set({ settings: snapshot });
      await refreshActiveTab();
    })
    .catch((error) => {
      console.error("[PastelGPT] Failed to save settings", error);
    });

  return saveChain;
}

async function clearAllTags() {
  try {
    const result = await chrome.runtime.sendMessage({ type: "PASTELGPT_CLEAR_ALL_TAGS" });
    if (result?.ok) return;
  } catch (_) {}

  await chrome.storage.local.set({ tags: {} });
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}

document.addEventListener("DOMContentLoaded", async () => {
  const { settings } = await load();

  const colorsGrid = document.getElementById("colorsGrid");
  const showUntagged = document.getElementById("showUntagged");
  const tintSelect = document.getElementById("tintSelect");
  const resetTintBtn = document.getElementById("resetTintBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");

  if (!colorsGrid || !showUntagged || !tintSelect || !resetTintBtn || !resetAllBtn) {
    console.warn("[PastelGPT] popup.html is missing expected elements", {
      colorsGrid: !!colorsGrid,
      showUntagged: !!showUntagged,
      tintSelect: !!tintSelect,
      resetTintBtn: !!resetTintBtn,
      resetAllBtn: !!resetAllBtn,
    });
    return;
  }

  showUntagged.checked = settings.showUntagged;
  tintSelect.value = settings.tint;

  for (const c of AVAILABLE_COLORS) {
    const checkbox = el("input", { type: "checkbox", "data-color": c.id });
    checkbox.checked = settings.enabledColors.includes(c.id);

    checkbox.addEventListener("change", async () => {
      const enabled = new Set(settings.enabledColors);

      if (checkbox.checked) {
        enabled.add(c.id);
      } else {
        enabled.delete(c.id);
        if (enabled.size === 0) {
          checkbox.checked = true;
          return;
        }
      }

      settings.enabledColors = Array.from(enabled);
      await queueSave(settings);
    });

    const item = el("label", { class: "color-item" }, [
      checkbox,
      el("span", { class: "dot", style: `--dot:${c.hex}` }),
      el("span", {}, [c.label])
    ]);

    colorsGrid.appendChild(item);
  }

  showUntagged.addEventListener("change", async () => {
    settings.showUntagged = showUntagged.checked;
    await queueSave(settings);
  });

  tintSelect.addEventListener("change", async () => {
    settings.tint = tintSelect.value;
    await queueSave(settings);
  });

  resetTintBtn.addEventListener("click", async () => {
    settings.tint = "off";
    tintSelect.value = settings.tint;
    await queueSave(settings);
  });

  resetAllBtn.addEventListener("click", async () => {
    const fresh = normalizeSettings(DEFAULT_SETTINGS);

    await Promise.all([
      queueSave(fresh),
      clearAllTags(),
    ]);

    settings.showUntagged = fresh.showUntagged;
    settings.enabledColors = [...fresh.enabledColors];
    settings.tint = fresh.tint;

    showUntagged.checked = settings.showUntagged;
    tintSelect.value = settings.tint;
    for (const input of colorsGrid.querySelectorAll('input[type="checkbox"][data-color]')) {
      const color = input.getAttribute("data-color");
      input.checked = settings.enabledColors.includes(color);
    }
  });
});
