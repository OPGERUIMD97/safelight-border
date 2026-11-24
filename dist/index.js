// Safelight Border v2.1.0
// A border around the photo, drawn inside the frame ("inside – fit"): the photo
// is scaled into the frame and the space around it becomes the border, so the
// photo keeps its size. Two processing stages, so the border shows in Develop,
// on thumbnails, in presets, in copy/paste and in every export:
//   safelight-border.fit    geometry: maps each frame point to the photo, and
//                           hands the photo / frame-line coverage on
//   safelight-border.paint  output-encode: paints the border and the line
// Controls follow the Framing module of darktable / Ansel.

const EXT = "safelight-border";
export const FIT_STAGE = `${EXT}.fit`;
export const PAINT_STAGE = `${EXT}.paint`;
const PANEL_ID = `${EXT}.panel`;

export const MODE_CONSTANT = 0; // equal border; the photo fills the window and is trimmed a little
export const MODE_WHOLE = 1;    // the whole photo shows; extra space goes where the position says

const K = {
  size: `${FIT_STAGE}.bSize`,
  mode: `${FIT_STAGE}.bMode`,
  offX: `${FIT_STAGE}.bOffX`,
  offY: `${FIT_STAGE}.bOffY`,
  line: `${FIT_STAGE}.bLine`,
  lineOff: `${FIT_STAGE}.bLineOff`,
  on: `${PAINT_STAGE}.bOn`,
  color: `${PAINT_STAGE}.bColor`,
  lineColor: `${PAINT_STAGE}.bLineColor`,
};
const ALL_KEYS = Object.values(K);

const DEFAULTS = {
  [K.size]: 0,
  [K.mode]: MODE_CONSTANT,
  [K.offX]: 0.5,
  [K.offY]: 0.5,
  [K.line]: 0,
  [K.lineOff]: 50,
  [K.on]: false,
  [K.color]: [1, 1, 1],
  [K.lineColor]: [0, 0, 0],
};

const POSITIONS = [
  { value: "0.5", label: "Center" },
  { value: "0.333333", label: "1/3" },
  { value: "0.375", label: "3/8" },
  { value: "0.625", label: "5/8" },
  { value: "0.666667", label: "2/3" },
];

// ── Layout maths (mirrors the GLSL below; used by the tests) ───────────────
// Frame coordinates f run 0..1 from the top left. aspect = frame width / height.
// Lengths are in frame-height units.
export function borderLayout({ aspect, size, mode, offX = 0.5, offY = 0.5 }) {
  const Ap = Math.max(aspect, 1e-4);
  const b = Math.min(Math.max(size, 0), 49) * 0.01 * Math.min(Ap, 1);
  const iw = Math.max(Ap - 2 * b, 1e-4);
  const ih = Math.max(1 - 2 * b, 1e-4);
  if (mode === MODE_WHOLE) {
    const k = Math.min(iw / Ap, ih);
    const w = { x: b + (iw - Ap * k) * offX, y: b + (ih - k) * offY, w: Ap * k, h: k };
    return { b, window: w, content: w };
  }
  const k = Math.max(iw / Ap, ih);
  return {
    b,
    window: { x: b, y: b, w: iw, h: ih },
    content: { x: b + (iw - Ap * k) * offX, y: b + (ih - k) * offY, w: Ap * k, h: k },
  };
}

export function mapPoint(layout, aspect, f) {
  const P = { x: f.x * aspect, y: f.y };
  const { window: w, content: c } = layout;
  return {
    q: { x: (P.x - c.x) / c.w, y: (P.y - c.y) / c.h },
    inside: P.x >= w.x && P.x <= w.x + w.w && P.y >= w.y && P.y <= w.y + w.h,
  };
}

export function lineBand(layout, lineSize, lineOffset) {
  const lw = Math.min(Math.max(lineSize, 0), 100) * 0.01 * layout.b;
  const t0 = Math.min(Math.max(lineOffset, 0), 100) * 0.01 * Math.max(layout.b - lw, 0);
  return { from: t0, to: t0 + lw };
}

// ── GLSL ───────────────────────────────────────────────────────────────────
// Geometry phase. srcUv arrives as the crop/transform's source position for
// this pixel, and viewUv is the pixel's place in the whole frame. The frame's
// pixel aspect comes from how srcUv moves across the frame. Border pixels keep
// an in-bounds srcUv (the paint stage covers them), so they still reach it.
export const FIT_GLSL = `
vec2 bF = viewUv;
vec2 bDsx = dFdx(srcUv);
vec2 bDsy = dFdy(srcUv);
float bDfx = dFdx(bF.x);
float bDfy = dFdy(bF.y);
vec2 bJx = abs(bDfx) > 1e-9 ? bDsx / bDfx : vec2(1.0, 0.0);
vec2 bJy = abs(bDfy) > 1e-9 ? bDsy / bDfy : vec2(0.0, 1.0);
float bA = max(uImageAspect, 1e-4);
float bLx = length(vec2(bJx.x * bA, bJx.y));
float bLy = length(vec2(bJy.x * bA, bJy.y));
float bAp = bLy > 1e-9 ? max(bLx / bLy, 1e-4) : 1.0;
vec2 bP = vec2(bF.x * bAp, bF.y);
float bAa = max(abs(bDfx) * bAp, abs(bDfy));
float bB = clamp(bSize, 0.0, 49.0) * 0.01 * min(bAp, 1.0);
vec2 bInner = max(vec2(bAp - 2.0 * bB, 1.0 - 2.0 * bB), vec2(1e-4));
vec2 bOff = clamp(vec2(bOffX, bOffY), 0.0, 1.0);
vec2 bWinO;
vec2 bWinS;
vec2 bConO;
vec2 bConS;
if (bMode > 0.5) {
  float bK = min(bInner.x / bAp, bInner.y);
  bWinS = vec2(bAp * bK, bK);
  bWinO = vec2(bB) + (bInner - bWinS) * bOff;
  bConO = bWinO;
  bConS = bWinS;
} else {
  float bK = max(bInner.x / bAp, bInner.y);
  bWinO = vec2(bB);
  bWinS = bInner;
  bConS = vec2(bAp * bK, bK);
  bConO = vec2(bB) + (bInner - bConS) * bOff;
}
vec2 bQ = (bP - bConO) / bConS;
vec2 bD = max(bWinO - bP, bP - (bWinO + bWinS));
float bDist = max(bD.x, bD.y);
float bPhoto = 1.0 - smoothstep(-0.5 * bAa, 0.5 * bAa, bDist);
float bLw = clamp(bLine, 0.0, 100.0) * 0.01 * bB;
float bT0 = clamp(bLineOff, 0.0, 100.0) * 0.01 * max(bB - bLw, 0.0);
float bLineCov = bLw > 0.0
  ? smoothstep(bT0 - 0.5 * bAa, bT0 + 0.5 * bAa, bDist) - smoothstep(bT0 + bLw - 0.5 * bAa, bT0 + bLw + 0.5 * bAa, bDist)
  : 0.0;
vec2 bQc = clamp(bQ, vec2(0.0005), vec2(0.9995));
vec2 bNew = srcUv + bJx * (bQc.x - bF.x) + bJy * (bQc.y - bF.y);
srcUv = bPhoto < 0.002 ? clamp(bNew, vec2(0.0005), vec2(0.9995)) : bNew;
`;

// Output-encode phase: c is the display-encoded colour, so the border and line
// colours land exactly as picked.
export const PAINT_GLSL = `
vec3 bEdge = mix(bColor, bLineColor, clamp(isv_slborder_line, 0.0, 1.0));
c = mix(bEdge, c, clamp(isv_slborder_photo, 0.0, 1.0));
`;

export const FIT_STAGE_DEF = {
  id: FIT_STAGE,
  name: "Border (fit)",
  phase: "geometry",
  priority: 1,
  glsl: FIT_GLSL,
  uniforms: [
    { key: "bSize", glslType: "float", default: 0, range: { min: 0, max: 49, step: 0.1 }, label: "Border size" },
    { key: "bMode", glslType: "float", default: MODE_CONSTANT, range: { min: 0, max: 1, step: 1 }, label: "Aspect" },
    { key: "bOffX", glslType: "float", default: 0.5, range: { min: 0, max: 1, step: 0.01 }, label: "Horizontal offset" },
    { key: "bOffY", glslType: "float", default: 0.5, range: { min: 0, max: 1, step: 0.01 }, label: "Vertical offset" },
    { key: "bLine", glslType: "float", default: 0, range: { min: 0, max: 100, step: 0.5 }, label: "Frame line size" },
    { key: "bLineOff", glslType: "float", default: 50, range: { min: 0, max: 100, step: 0.5 }, label: "Frame line offset" },
  ],
  produces: [
    { name: "slborder_photo", glslType: "float", producer: "bPhoto" },
    { name: "slborder_line", glslType: "float", producer: "bLineCov" },
  ],
  dormantWhen: { bSize: 0 },
};

export const PAINT_STAGE_DEF = {
  id: PAINT_STAGE,
  name: "Border (paint)",
  phase: "output-encode",
  priority: 900,
  glsl: PAINT_GLSL,
  uniforms: [
    { key: "bOn", glslType: "bool", default: false, label: "Border" },
    { key: "bColor", glslType: "vec3", default: [1, 1, 1], label: "Border colour" },
    { key: "bLineColor", glslType: "vec3", default: [0, 0, 0], label: "Frame line colour" },
  ],
  consumes: ["slborder_photo", "slborder_line"],
  dormantWhen: { bOn: false },
};

// ── Templates ──────────────────────────────────────────────────────────────
// A template is a named set of border settings, kept in this browser profile.
const TEMPLATES_KEY = "safelight-border-v2-templates";
const TEMPLATE_FIELDS = ["size", "mode", "offX", "offY", "line", "lineOff", "color", "lineColor"];

export const STARTER_TEMPLATES = [
  { id: "white-thin", name: "White, thin", size: 3, mode: MODE_CONSTANT, offX: 0.5, offY: 0.5, line: 0, lineOff: 50, color: [1, 1, 1], lineColor: [0, 0, 0] },
  { id: "white-wide", name: "White, wide", size: 8, mode: MODE_CONSTANT, offX: 0.5, offY: 0.5, line: 0, lineOff: 50, color: [1, 1, 1], lineColor: [0, 0, 0] },
  { id: "black-thin", name: "Black, thin", size: 3, mode: MODE_CONSTANT, offX: 0.5, offY: 0.5, line: 0, lineOff: 50, color: [0, 0, 0], lineColor: [1, 1, 1] },
  { id: "white-line", name: "White with black line", size: 8, mode: MODE_CONSTANT, offX: 0.5, offY: 0.5, line: 8, lineOff: 30, color: [1, 1, 1], lineColor: [0, 0, 0] },
  { id: "gallery-whole", name: "Whole photo, white", size: 6, mode: MODE_WHOLE, offX: 0.5, offY: 0.4, line: 0, lineOff: 50, color: [1, 1, 1], lineColor: [0, 0, 0] },
];

export function templateFromBag(bag, name, id) {
  const t = { id: id || String(Date.now()), name };
  for (const f of TEMPLATE_FIELDS) {
    const v = bag && bag[K[f]] !== undefined ? bag[K[f]] : DEFAULTS[K[f]];
    t[f] = Array.isArray(v) ? v.slice(0, 3).map(Number) : Number(v);
  }
  return t;
}

export function templateToPatch(t) {
  const patch = {};
  for (const f of TEMPLATE_FIELDS) {
    const v = t[f] !== undefined ? t[f] : DEFAULTS[K[f]];
    patch[K[f]] = Array.isArray(v) ? v.slice(0, 3).map(Number) : Number(v);
  }
  patch[K.on] = Number(patch[K.size]) > 0;
  return patch;
}

export function templateMatches(t, bag) {
  const cur = templateFromBag(bag, "", "");
  return TEMPLATE_FIELDS.every((f) => {
    const a = cur[f], b = t[f] !== undefined ? t[f] : DEFAULTS[K[f]];
    if (Array.isArray(a)) return a.every((x, i) => Math.abs(x - Number(b[i])) < 0.002);
    return Math.abs(a - Number(b)) < 0.0005;
  });
}

function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list.filter((t) => t && t.id && t.name);
    }
  } catch (e) {}
  return STARTER_TEMPLATES.map((t) => ({ ...t }));
}

function saveTemplates(list) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch (e) {}
}

// The default template is marked with a star and is what "Add border" applies.
const DEFAULT_TEMPLATE_KEY = "safelight-border-v2-default-template";

export function defaultTemplate(list, id) {
  return (Array.isArray(list) ? list : []).find((t) => t && t.id === id);
}

export function loadDefaultId() {
  try { return localStorage.getItem(DEFAULT_TEMPLATE_KEY) || ""; } catch (e) { return ""; }
}

export function saveDefaultId(id) {
  try {
    if (id) localStorage.setItem(DEFAULT_TEMPLATE_KEY, id);
    else localStorage.removeItem(DEFAULT_TEMPLATE_KEY);
  } catch (e) {}
}

// Library: a border step appended to a photo's stored edit, the way core's
// Paste settings does it. Cut at the cursor, seed "Original" for a photo never
// edited, then add one step with the border keys merged over the bag.
export function appendBorderStep(editState, photoId, patch, label, fresh, now = Date.now()) {
  const stack0 = editState && Array.isArray(editState.stack) ? editState.stack : [];
  const ci = editState ? editState.currentIndex : -1;
  const cursor = Number.isInteger(ci) && ci >= 0 && ci < stack0.length ? ci : stack0.length - 1;
  const stack = stack0.slice(0, cursor + 1);
  if (stack.length === 0) stack.push({ timestamp: now, label: "Original", params: fresh(), paramBag: {} });
  const top = stack[stack.length - 1];
  stack.push({ timestamp: now, label, params: top.params, paramBag: { ...(top.paramBag || {}), ...patch } });
  return { photoId, stack, currentIndex: stack.length - 1 };
}

// The extension bag of the step a stored edit stands on, or {} for none.
export function bagAtCursor(editState) {
  const stack = editState && Array.isArray(editState.stack) ? editState.stack : [];
  if (stack.length === 0) return {};
  const ci = editState.currentIndex;
  const i = Number.isInteger(ci) && ci >= 0 && ci < stack.length ? ci : stack.length - 1;
  return (stack[i] && stack[i].paramBag) || {};
}

// False when the bag has no border; otherwise the matching template's name
// (or null when the settings match none).
export function borderInfo(bag, templates) {
  const size = bag ? Number(bag[K.size]) : 0;
  if (!(size > 0)) return false;
  const t = (templates || []).find((x) => templateMatches(x, bag));
  return { name: t ? t.name : null };
}

export const BORDER_OFF_PATCH = { [K.size]: 0, [K.on]: false };

// ── Colour helpers ─────────────────────────────────────────────────────────
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
  const v = Array.isArray(rgb) ? rgb : [1, 1, 1];
  return "#" + v.slice(0, 3)
    .map((x) => Math.round(Math.min(Math.max(Number(x) || 0, 0), 1) * 255).toString(16).padStart(2, "0"))
    .join("");
}

// ── Extension ──────────────────────────────────────────────────────────────
export function activate(api) {
  const React = api.react;
  const { useState, useEffect } = React;
  const h = React.createElement;
  const ui = api.ui || {};
  const comps = api.components || {};
  const dev = api.develop || {};
  const useDevelopStore = api.stores?.useDevelopStore;
  const useUIStore = api.stores?.useUIStore;
  const useCatalogStore = api.stores?.useCatalogStore;
  const catalogApi = api.catalog || {};
  // Which photos carry a border, for the grid badge and the Library panel.
  // Filled lazily from each photo's stored edit and kept fresh by its edit time.
  const createStore = api.stores?.create;
  const useBorderMap = typeof createStore === "function" ? createStore(() => ({ map: {} })) : null;
  const setBorder = (id, info) => {
    if (!useBorderMap || !id) return;
    const prev = useBorderMap.getState().map[id];
    if (JSON.stringify(prev) === JSON.stringify(info)) return;
    useBorderMap.setState((st) => ({ map: { ...st.map, [id]: info } }));
  };
  async function refreshBorder(id) {
    if (typeof catalogApi.getEditState !== "function") return;
    try {
      setBorder(id, borderInfo(bagAtCursor(await catalogApi.getEditState(id)), loadTemplates()));
    } catch (e) {}
  }
  function useBorderOf(id) {
    const editedAt = typeof catalogApi.useEditedAt === "function" ? catalogApi.useEditedAt(id) : undefined;
    const info = useBorderMap ? useBorderMap((st) => st.map[id]) : undefined;
    useEffect(() => { void refreshBorder(id); }, [id, editedAt]);
    return info;
  }
  // The photo open in Develop follows its live bag.
  useDevelopStore?.subscribe?.((st, prev) => {
    if (!st || !st.photoId) return;
    if (prev && st.paramBag === prev.paramBag && st.photoId === prev.photoId) return;
    setBorder(st.photoId, borderInfo(st.paramBag, loadTemplates()));
  });

  // Process version for a photo that was never edited (core's current one).
  const FRESH_PROCESS_VERSION = 2;

  api.registerProcessingStage(FIT_STAGE_DEF);
  api.registerProcessingStage(PAINT_STAGE_DEF);

  const store = () => useDevelopStore?.getState?.();
  const readBag = (bag, key) => (bag && bag[key] !== undefined ? bag[key] : DEFAULTS[key]);

  function write(patch) {
    const s = store();
    if (!s) return;
    const next = { ...patch };
    if (K.size in next) next[K.on] = Number(next[K.size]) > 0;
    if (typeof s.setDynParams === "function") s.setDynParams(next);
    else for (const [k, v] of Object.entries(next)) s.setDynParam(k, v);
  }
  function commit(label) {
    store()?.commitEdit?.(label);
  }

  function useBag() {
    return useDevelopStore ? useDevelopStore((s) => s.paramBag) : {};
  }

  function SliderRow({ label, keyName, min, max, step, def, suffix }) {
    const bag = useBag();
    const value = Number(readBag(bag, keyName));
    if (comps.Slider) {
      return h(comps.Slider, {
        label, value, min, max, step, defaultValue: def,
        onChange: (v) => write({ [keyName]: v }),
        onCommit: () => commit(label),
      });
    }
    return h("label", { style: { display: "block", fontSize: 12 } },
      `${label}: ${value}${suffix || ""}`,
      h("input", {
        type: "range", min, max, step, value, style: { width: "100%" },
        onChange: (e) => write({ [keyName]: Number(e.target.value) }),
        onMouseUp: () => commit(label),
      }));
  }

  function SelectRow({ label, value, options, onChange }) {
    const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 26 };
    const control = ui.Select
      ? h(ui.Select, { value, onChange, options, ariaLabel: label })
      : h("select", { value, onChange: (e) => onChange(e.target.value) },
          options.map((o) => h("option", { key: o.value, value: o.value }, o.label)));
    return h("div", { style: row },
      h("span", { style: { fontSize: 12, flex: "0 0 auto" } }, label),
      h("div", { style: { flex: "0 1 60%" } }, control));
  }

  function PositionRow({ label, keyName }) {
    const bag = useBag();
    const v = Number(readBag(bag, keyName));
    const match = POSITIONS.find((p) => Math.abs(Number(p.value) - v) < 0.002);
    const options = match ? POSITIONS : [...POSITIONS, { value: "custom", label: "Custom" }];
    return h(SelectRow, {
      label, value: match ? match.value : "custom", options,
      onChange: (val) => {
        if (val === "custom") return;
        write({ [keyName]: Number(val) });
        commit(label);
      },
    });
  }

  function ColorRow({ label, keyName }) {
    const bag = useBag();
    const hex = rgbToHex(readBag(bag, keyName));
    const [picking, setPicking] = useState(false);
    useEffect(() => () => { if (picking) dev.setPickDrag?.(null); }, [picking]);

    const pick = () => {
      if (typeof dev.setPickDrag !== "function") return;
      if (picking) { dev.setPickDrag(null); setPicking(false); return; }
      setPicking(true);
      dev.setPickDrag({
        onDown: (rgb) => {
          write({ [keyName]: [rgb[0], rgb[1], rgb[2]] });
          commit(label);
          dev.setPickDrag(null);
          setPicking(false);
        },
      });
    };

    const row = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 28 };
    const swatch = {
      width: 44, height: 22, padding: 0, border: "1px solid var(--color-border)",
      borderRadius: 4, background: "none", cursor: "pointer",
    };
    const btn = {
      width: 26, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer",
      background: picking ? "var(--color-accent)" : "transparent",
      color: picking ? "var(--color-on-accent, #fff)" : "inherit",
    };
    return h("div", { style: row },
      h("span", { style: { fontSize: 12 } }, label),
      h("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
        h("input", {
          type: "color", value: hex, style: swatch, "aria-label": label,
          onChange: (e) => write({ [keyName]: hexToRgb(e.target.value) }),
          onBlur: () => commit(label),
        }),
        typeof dev.setPickDrag === "function"
          ? h("button", { type: "button", style: btn, title: "Pick a colour from the photo", onClick: pick },
              comps.PickerIcon ? h(comps.PickerIcon, { size: 12 }) : "⌖")
          : null));
  }

  function TemplateRow() {
    const bag = useBag();
    const [list, setList] = useState(loadTemplates);
    const [defId, setDefId] = useState(loadDefaultId);
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const current = list.find((t) => templateMatches(t, bag));
    const def = defaultTemplate(list, defId);
    const borderOff = !(Number(readBag(bag, K.size)) > 0);

    const apply = (t) => {
      if (!t) return;
      write(templateToPatch(t));
      commit(`Border template: ${t.name}`);
    };
    const update = (next) => { setList(next); saveTemplates(next); };
    const setDefault = (id) => { setDefId(id); saveDefaultId(id); };
    const saveNew = () => {
      const n = name.trim();
      if (!n) return;
      update([...list, templateFromBag(store()?.paramBag, n)]);
      setNaming(false);
      setName("");
    };
    const remove = () => {
      if (!current) return;
      if (current.id === defId) setDefault("");
      update(list.filter((t) => t.id !== current.id));
    };

    const small = {
      fontSize: 11, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
      border: "1px solid var(--color-border)", background: "transparent", color: "inherit",
    };
    const chip = (active) => ({
      fontSize: 11, lineHeight: "16px", padding: "2px 10px", borderRadius: 999, cursor: "pointer",
      whiteSpace: "nowrap",
      border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
      background: active ? "var(--color-accent)" : "transparent",
      color: active ? "var(--color-on-accent, #fff)" : "inherit",
    });

    const chips = h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
      list.map((t) => {
        const active = !!current && current.id === t.id;
        const isDef = t.id === defId;
        return h("button", {
          key: t.id, type: "button", style: chip(active), onClick: () => apply(t),
          title: isDef ? `${t.name} (default)` : t.name, "aria-pressed": active,
        }, isDef ? `★ ${t.name}` : t.name);
      }),
      current ? null : h("span", { style: { ...chip(true), cursor: "default", opacity: 0.6 } }, "Custom"));

    const actions = naming
      ? h("div", { style: { display: "flex", gap: 6 } },
          h("input", {
            autoFocus: true, value: name, placeholder: "Template name",
            onChange: (e) => setName(e.target.value),
            onKeyDown: (e) => { if (e.key === "Enter") saveNew(); if (e.key === "Escape") setNaming(false); },
            style: { flex: 1, fontSize: 12, padding: "3px 6px", borderRadius: 4,
                     border: "1px solid var(--color-border)", background: "var(--color-surface-0)", color: "inherit" },
          }),
          h("button", { type: "button", style: small, onClick: saveNew }, "Save"),
          h("button", { type: "button", style: small, onClick: () => setNaming(false) }, "Cancel"))
      : h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" } },
          borderOff && def
            ? h("button", { type: "button", style: { ...small, borderColor: "var(--color-accent)" },
                onClick: () => apply(def), title: `Apply "${def.name}"` }, `Add border (★ ${def.name})`)
            : null,
          current
            ? h("button", {
                type: "button", style: small,
                onClick: () => setDefault(current.id === defId ? "" : current.id),
                title: current.id === defId ? "Remove the default mark" : `Use "${current.name}" as default`,
              }, current.id === defId ? "★ Default" : "☆ Set as default")
            : null,
          h("button", { type: "button", style: small, onClick: () => { setName(""); setNaming(true); } }, "Save as template"),
          current
            ? h("button", { type: "button", style: small, onClick: remove, title: `Delete "${current.name}"` }, "Delete")
            : null);

    return h("div", { style: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 } },
      h("span", { style: { fontSize: 12 } }, "Templates"),
      chips,
      actions);
  }

  // Library: the panel works on the selected photos, never on the photo that
  // happens to be open in Develop.
  async function applyToSelection(ids, patch, label, onProgress) {
    const photos = new Map((useCatalogStore?.getState?.().photos || []).map((p) => [p.id, p]));
    const norm = api.develop?.normalizeParams;
    let done = 0;
    for (const id of ids) {
      const photo = photos.get(id);
      if (!photo) continue;
      const asShot = photo.exif?.colorTemperature ?? 6500;
      const fresh = () => {
        const base = { temperature: asShot, processVersion: FRESH_PROCESS_VERSION };
        return typeof norm === "function" ? norm(base) : base;
      };
      const existing = await catalogApi.getEditState(id);
      await catalogApi.putEditState(appendBorderStep(existing, id, patch, label, fresh));
      catalogApi.requestThumbnail?.(id);
      setBorder(id, borderInfo(patch[K.size] > 0 ? patch : {}, loadTemplates()));
      done++;
      onProgress?.(done);
    }
    return done;
  }

  function LibraryPanel() {
    const selected = useCatalogStore ? useCatalogStore((s) => s.selectedIds) : null;
    const ids = selected ? Array.from(selected) : [];
    const n = ids.length;
    const [list] = useState(loadTemplates);
    const defId = loadDefaultId();
    const [pickId, setPickId] = useState(() => (defaultTemplate(list, defId) || list[0] || {}).id);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const canWrite = typeof catalogApi.getEditState === "function" && typeof catalogApi.putEditState === "function";
    const pick = list.find((t) => t.id === pickId);
    const map = useBorderMap ? useBorderMap((st) => st.map) : {};
    const key = ids.join("|");
    useEffect(() => { for (const id of ids) if (map[id] === undefined) void refreshBorder(id); }, [key]);
    const withBorder = ids.filter((id) => map[id]);
    const names = Array.from(new Set(withBorder.map((id) => map[id].name || "Custom")));

    const run = async (patch, label, verb) => {
      if (!n || busy) return;
      setBusy(true);
      setStatus(`${verb} 0 / ${n}…`);
      try {
        const done = await applyToSelection(ids, patch, label, (d) => setStatus(`${verb} ${d} / ${n}…`));
        setStatus(`Done: ${done} photo${done === 1 ? "" : "s"}. Export as usual.`);
      } catch (e) {
        console.warn("[safelight-border] library apply failed:", e);
        setStatus("Something went wrong; see the console.");
      } finally {
        setBusy(false);
      }
    };

    const chip = (active) => ({
      fontSize: 11, lineHeight: "16px", padding: "2px 10px", borderRadius: 999, cursor: "pointer",
      whiteSpace: "nowrap",
      border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
      background: active ? "var(--color-accent)" : "transparent",
      color: active ? "var(--color-on-accent, #fff)" : "inherit",
    });
    const btn = (primary, disabled) => ({
      fontSize: 11, padding: "4px 10px", borderRadius: 4, cursor: disabled ? "default" : "pointer",
      border: `1px solid ${primary ? "var(--color-accent)" : "var(--color-border)"}`,
      background: primary && !disabled ? "var(--color-accent)" : "transparent",
      color: primary && !disabled ? "var(--color-on-accent, #fff)" : "inherit",
      opacity: disabled ? 0.5 : 1,
    });
    const hint = { fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4 };
    const wrap = { display: "flex", flexDirection: "column", gap: 8, padding: "6px 10px 10px" };

    if (!canWrite) {
      return h("div", { style: wrap },
        h("div", { style: hint }, "This Safelight version can't write borders from the Library. Open a photo in Develop to add one."));
    }
    const off = !n || busy || !pick;
    return h("div", { style: wrap },
      h("span", { style: { fontSize: 12 } }, "Templates"),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
        list.map((t) => h("button", {
          key: t.id, type: "button", style: chip(t.id === pickId), onClick: () => setPickId(t.id),
          "aria-pressed": t.id === pickId,
        }, t.id === defId ? `★ ${t.name}` : t.name))),
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" } },
        h("button", {
          type: "button", style: btn(false, !n || busy), disabled: !n || busy,
          onClick: () => run(BORDER_OFF_PATCH, "Remove border", "Removing"),
        }, "Remove border"),
        h("button", {
          type: "button", style: btn(true, off), disabled: off,
          onClick: () => run(templateToPatch(pick), `Border template: ${pick.name}`, "Adding"),
        }, n ? `Apply to ${n} photo${n === 1 ? "" : "s"}` : "Select photos")),
      status ? h("div", { style: { fontSize: 11 } }, status) : null,
      n ? h("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11 } },
            withBorder.length ? h(Dot, null) : null,
            withBorder.length
              ? `${withBorder.length} of ${n} selected ${withBorder.length === 1 ? "has" : "have"} a border (${names.join(", ")})`
              : `None of the ${n} selected ${n === 1 ? "has" : "have"} a border`)
        : null,
      h("div", { style: hint },
        "Select photos in the grid, pick a template and click Apply. Each photo gets the border as an undoable step, and it goes along with every export. ",
        "Fine-tune a single photo in Develop."));
  }

  function BorderPanel() {
    const module = useUIStore ? useUIStore((s) => s.activeModule) : "develop";
    if (module === "library") return h(LibraryPanel, null);
    return h(DevelopPanel, null);
  }

  function DevelopPanel() {
    const bag = useBag();
    const mode = Number(readBag(bag, K.mode)) > 0.5 ? MODE_WHOLE : MODE_CONSTANT;
    const wrap = { display: "flex", flexDirection: "column", gap: 6, padding: "6px 10px 10px" };
    const hint = { fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.4 };
    return h("div", { style: wrap },
      h(TemplateRow, null),
      h(SliderRow, { label: "Border size", keyName: K.size, min: 0, max: 49, step: 0.1, def: 0, suffix: "%" }),
      h(SelectRow, {
        label: "Aspect",
        value: String(mode),
        options: [
          { value: String(MODE_CONSTANT), label: "Constant border" },
          { value: String(MODE_WHOLE), label: "Whole photo" },
        ],
        onChange: (val) => { write({ [K.mode]: Number(val) }); commit("Border aspect"); },
      }),
      h(PositionRow, { label: "Horizontal position", keyName: K.offX }),
      h(SliderRow, { label: "Horizontal offset", keyName: K.offX, min: 0, max: 1, step: 0.01, def: 0.5 }),
      h(PositionRow, { label: "Vertical position", keyName: K.offY }),
      h(SliderRow, { label: "Vertical offset", keyName: K.offY, min: 0, max: 1, step: 0.01, def: 0.5 }),
      h(SliderRow, { label: "Frame line size", keyName: K.line, min: 0, max: 100, step: 0.5, def: 0, suffix: "%" }),
      h(SliderRow, { label: "Frame line offset", keyName: K.lineOff, min: 0, max: 100, step: 0.5, def: 50, suffix: "%" }),
      h(ColorRow, { label: "Border colour", keyName: K.color }),
      h(ColorRow, { label: "Frame line colour", keyName: K.lineColor }),
      h("div", { style: hint },
        "The border is drawn inside the frame: the photo is scaled down and keeps its size. ",
        "The frame follows your crop, so pick 1:1 or 3:2 in Crop for that shape."));
  }

  const DOT_STYLE = {
    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
    background: "var(--color-success, #3fb950)", boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
  };
  function Dot({ title }) {
    return h("span", { title, "aria-label": title, role: "img", style: DOT_STYLE });
  }

  // Green dot in the panel header while a border is on, so it shows when the
  // panel is collapsed too. In Develop: the open photo; in the Library: the
  // selection. The tooltip names the template.
  function ActiveDot() {
    const bag = useBag();
    const module = useUIStore ? useUIStore((st) => st.activeModule) : "develop";
    const selected = useCatalogStore ? useCatalogStore((st) => st.selectedIds) : null;
    const map = useBorderMap ? useBorderMap((st) => st.map) : {};
    if (module === "library") {
      const ids = selected ? Array.from(selected) : [];
      const on = ids.filter((id) => map[id]);
      if (!on.length) return null;
      const names = Array.from(new Set(on.map((id) => map[id].name || "Custom")));
      return h(Dot, { title: `Border on ${on.length} of ${ids.length} selected: ${names.join(", ")}` });
    }
    const info = borderInfo(bag, loadTemplates());
    if (!info) return null;
    return h(Dot, { title: info.name ? `Border on: ${info.name}` : "Border on" });
  }

  // Grid and Filmstrip: a green dot on every photo that carries a border.
  function GridBadge({ photo }) {
    const info = useBorderOf(photo.id);
    if (!info) return null;
    const title = info.name ? `Border: ${info.name}` : "Border";
    const dot = h("span", { style: { ...DOT_STYLE, width: 7, height: 7 } });
    return comps.ThumbnailBadge ? h(comps.ThumbnailBadge, { title }, dot) : h("span", { title }, dot);
  }
  if (typeof api.registerThumbnailBadge === "function" && useBorderMap) {
    api.registerThumbnailBadge({ id: `${EXT}.badge`, component: GridBadge, order: 80 });
  }

  function resetAll() {
    const s = store();
    if (!s) return;
    const patch = { ...DEFAULTS };
    if (typeof s.setDynParams === "function") s.setDynParams(patch);
    else for (const [k, v] of Object.entries(patch)) s.setDynParam(k, v);
    s.commitEdit?.("Reset Border");
  }

  api.registerPanel({
    id: PANEL_ID,
    title: "Border",
    component: BorderPanel,
    headerAccessory: ActiveDot,
    order: 80,
    defaultDock: { module: "develop", direction: "right", order: 80 },
    onReset: resetAll,
    ownsBag: ALL_KEYS,
  });

  console.log("[safelight-border] v2.5.0 loaded");
}
