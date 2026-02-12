const COLORS = [
  { id: "red",    label: "Red",    hex: "#FF6B6B", emoji: "\u{1F534}" },
  { id: "orange", label: "Orange", hex: "#FFA94D", emoji: "\u{1F7E0}" },
  { id: "yellow", label: "Yellow", hex: "#FFD43B", emoji: "\u{1F7E1}" },
  { id: "green",  label: "Green",  hex: "#69DB7C", emoji: "\u{1F7E2}" },
  { id: "blue",   label: "Blue",   hex: "#74C0FC", emoji: "\u{1F535}" },
  { id: "indigo", label: "Indigo", hex: "#8C7AE6", emoji: "\u{1F7E3}" },
  { id: "violet", label: "Violet", hex: "#DA77F2", emoji: "\u{1F49C}" },
];

const COLORS_BY_ID = Object.fromEntries(
  COLORS.map((c) => [c.id, { label: c.label, hex: c.hex, emoji: c.emoji }])
);

const COLOR_IDS = COLORS.map((c) => c.id);

function extractConversationId(url, base) {
  if (!url) return "";
  try {
    const u = new URL(url, base);
    const m1 = u.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
    if (m1) return m1[1];
    const m2 = u.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    if (m2) return m2[1];
  } catch (_) {}
  return "";
}

if (typeof globalThis !== "undefined") {
  globalThis.PASTELGPT_COLORS = COLORS;
  globalThis.PASTELGPT_COLORS_BY_ID = COLORS_BY_ID;
  globalThis.PASTELGPT_COLOR_IDS = COLOR_IDS;
  globalThis.PASTELGPT_extractConversationId = extractConversationId;
}
