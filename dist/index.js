// Safelight Border Extension v1.0.0
// Adds a solid border around an exported photo. The border is drawn outside
// the image — the original pixels are never cropped.
//
// Same host contract as Print Mat:
// - Export panel shows Apply + Template (not "No settings.")
// - "Show in Develop" only controls the canvas overlay
// - the panel preview always shows the current settings
// - edits live in an in-memory cache so export does not read a stale save

const VERSION = "1.0.0";

const STORAGE_KEY  = "safelight-border-templates";
const DEFAULTS_KEY = "safelight-border-user-defaults";
const ACTIVE_KEY   = "safelight-border-active-template";

function freshTemplate() {
  return {
    id: "default",
    name: "White subtle",
    enabled: true,
    color: "#ffffff",
    linked: true,
    top: 20,
    right: 20,
    bottom: 20,
    left: 20,
  };
}

function clampPx(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(500, Math.round(n)));
}

function cssColor(value, fallback = "#ffffff") {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function normalizeTemplate(raw) {
  const base = freshTemplate();
  const t = raw && typeof raw === "object" ? raw : {};
  const name = typeof t.name === "string" ? t.name.trim() : "";
  return {
    id: t.id ? String(t.id) : base.id,
    name: name || base.name,
    enabled: t.enabled !== false,
    color: cssColor(t.color, base.color),
    linked: t.linked !== false,
    top: clampPx(t.top ?? base.top),
    right: clampPx(t.right ?? base.right),
    bottom: clampPx(t.bottom ?? base.bottom),
    left: clampPx(t.left ?? base.left),
  };
}

function hasBorder(template) {
  if (!template) return false;
  return clampPx(template.top) + clampPx(template.right) + clampPx(template.bottom) + clampPx(template.left) > 0;
}

function isBitmap(source) {
  return typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
}

// Export passes a Blob through unchanged when there is nothing to draw.
// A Develop capture is an ImageBitmap; turn that into a Blob so preview/overlay
// can always make an object URL.
async function ensureBlob(source) {
  if (!isBitmap(source)) return source;
  try {
    const canvas = new OffscreenCanvas(source.width, source.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[safelight-border] 2D canvas unavailable.");
    ctx.drawImage(source, 0, 0);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  } finally {
    source.close?.();
  }
}

// Display size after the photo's rotation. Crop is NOT applied — library
// thumbnails show the whole frame.
function orientedSize(photo) {
  const w = Number(photo?.width);
  const h = Number(photo?.height);
  if (!w || !h) return null;
  const rot = ((Number(photo.rotation) || 0) % 360 + 360) % 360;
  if (rot === 90 || rot === 270) return { w: h, h: w };
  return { w, h };
}

// Pixel size of the image Develop/export actually frame: oriented file size,
// reduced by the develop crop (fractions of that oriented frame).
function outputPixels(photo, params) {
  const base = orientedSize(photo);
  if (!base) return null;
  const crop = params?.crop;
  const cw = Number(crop?.width);
  const ch = Number(crop?.height);
  if (cw > 0 && ch > 0 && cw <= 1 && ch <= 1) {
    return {
      w: Math.max(1, Math.round(base.w * cw)),
      h: Math.max(1, Math.round(base.h * ch)),
    };
  }
  return base;
}

// ── Styles (Safelight theme CSS variables) ──────────────────────────────────
const S = {
  container: {
    background: "var(--color-surface-0)", color: "var(--color-text-primary)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 11, padding: "10px 12px",
    height: "100%", overflowY: "auto", boxSizing: "border-box",
  },
  sectionTitle: {
    color: "var(--color-accent)", fontSize: 10, fontWeight: 600,
    letterSpacing: "0.06em", textTransform: "uppercase",
    margin: "12px 0 6px",
  },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label: { color: "var(--color-text-secondary)", fontSize: 11 },
  input: {
    background: "var(--color-surface-2)", color: "var(--color-text-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: 3, padding: "3px 6px", fontSize: 11, width: 60, textAlign: "right",
  },
  inputText: {
    background: "var(--color-surface-2)", color: "var(--color-text-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: 3, padding: "3px 6px", fontSize: 11, width: 140,
  },
  colorInput: {
    width: 36, height: 24, borderRadius: 3, border: "1px solid var(--color-border)",
    cursor: "pointer", padding: 0,
  },
  btn: {
    background: "var(--color-surface-2)", color: "var(--color-text-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: 3, padding: "4px 10px", fontSize: 11, cursor: "pointer",
  },
  btnAccent: {
    background: "var(--color-accent)", color: "var(--color-text-primary)", border: "none",
    borderRadius: 3, padding: "4px 10px", fontSize: 11, cursor: "pointer",
  },
  btnDanger: {
    background: "var(--color-surface-2)", color: "#E05252",
    border: "1px solid var(--color-border)",
    borderRadius: 3, padding: "4px 10px", fontSize: 11, cursor: "pointer",
  },
  divider: { border: "none", borderTop: "1px solid var(--color-border-subtle)", margin: "10px 0" },
  checkbox: { accentColor: "var(--color-accent)", marginRight: 6 },
  tag: {
    display: "inline-block", padding: "2px 8px", borderRadius: 12,
    background: "var(--color-surface-2)", color: "var(--color-text-secondary)",
    fontSize: 10, marginRight: 4, marginBottom: 4, cursor: "pointer",
  },
  tagActive: {
    display: "inline-block", padding: "2px 8px", borderRadius: 12,
    background: "var(--color-accent)", color: "var(--color-text-primary)",
    fontSize: 10, marginRight: 4, marginBottom: 4, cursor: "pointer",
  },
  preview: {
    background: "var(--color-surface-1)", borderRadius: 4, padding: 8, marginTop: 6,
    display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100,
  },
  previewBtn: {
    display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
    width: "100%", padding: "8px 0",
    background: "var(--color-accent)", color: "var(--color-text-primary)",
    border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600,
    cursor: "pointer", marginTop: 10,
  },
  defaultsRow: { display: "flex", gap: 6, marginTop: 10 },
};

// ── Storage ───────────────────────────────────────────────────────────────────
// In-memory cache so a debounced write never leaves export/overlay reading a
// stale localStorage snapshot while a width slider is still moving.
let templatesCache = null;
let saveTemplatesTimer = null;
const templateListeners = new Set();

function loadTemplates() {
  if (templatesCache) return templatesCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        templatesCache = parsed.map(normalizeTemplate);
        return templatesCache;
      }
    }
  } catch (e) {}
  templatesCache = [freshTemplate()];
  return templatesCache;
}

function saveTemplates(templates, immediate = false) {
  templatesCache = templates;
  // Notify after the current React updater finishes so a panel setState can
  // also be the writer without nesting updates.
  queueMicrotask(() => {
    if (templatesCache === templates) templateListeners.forEach((fn) => fn(templates));
  });
  syncExportProcessor();
  if (saveTemplatesTimer) clearTimeout(saveTemplatesTimer);
  const write = () => {
    saveTemplatesTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(templatesCache)); } catch (e) {}
  };
  if (immediate) write();
  else saveTemplatesTimer = setTimeout(write, 180);
}

function subscribeTemplates(fn) {
  templateListeners.add(fn);
  return () => templateListeners.delete(fn);
}

function loadUserDefaults() {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function saveUserDefaults(template) {
  try {
    const { id, name, ...rest } = template;
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(rest));
  } catch (e) {}
}

function loadActiveTemplateId() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
}

function saveActiveTemplateId(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) {}
  syncExportProcessor();
}

function indexOfActive(templates) {
  const id = loadActiveTemplateId();
  const i = templates.findIndex((t) => t && t.id === id);
  return i >= 0 ? i : 0;
}

// Template used for export and the Develop overlay: the one last selected in
// the panel, otherwise the first saved template.
function resolveExportTemplate(templates) {
  const list = templates && templates.length ? templates : loadTemplates();
  const activeId = loadActiveTemplateId();
  return (activeId && list.find((t) => t.id === activeId)) || list[0];
}

function templateFromDefaults(id, name) {
  const saved = loadUserDefaults();
  const merged = saved ? { ...freshTemplate(), ...saved, id, name } : { ...freshTemplate(), id, name };
  return normalizeTemplate(merged);
}

function resetActiveToDefaults() {
  const tpls = loadTemplates().map(normalizeTemplate);
  const idx = indexOfActive(tpls);
  const current = tpls[idx] || tpls[0];
  const base = templateFromDefaults(current.id, current.name);
  const next = tpls.map((x, i) => (i === idx ? base : x));
  saveTemplates(next, true);
  return next;
}

// Where a preview border should sit, in pixels of `rect`, so a 20px export
// border stays a 20px border on the full frame and a proportionally thin
// border on a scaled Develop view.
function screenFrame(template, rect, reference) {
  if (!template || !rect || !rect.w || !rect.h) return null;
  const refW = reference?.w || rect.w;
  const refH = reference?.h || rect.h;
  const sx = rect.w / refW;
  const sy = rect.h / refH;
  const left = clampPx(template.left) * sx;
  const right = clampPx(template.right) * sx;
  const top = clampPx(template.top) * sy;
  const bottom = clampPx(template.bottom) * sy;
  return {
    left, right, top, bottom,
    outerLeft: rect.x - left,
    outerTop: rect.y - top,
    outerW: rect.w + left + right,
    outerH: rect.h + top + bottom,
    visible: left + right + top + bottom > 0,
  };
}

// ── Border render (export + preview share this) ──────────────────────────────
// Widths are pixels added around `source`. Pass referenceWidth/Height when
// `source` is a downscaled stand-in (thumbnail, Develop capture, preview) so
// the border keeps the same proportion as a full-size export.
// template.enabled is NOT consulted when options.ignoreEnabled is set — the
// panel preview always renders current settings.
async function applyBorder(source, template, options = {}) {
  if (!template) return ensureBlob(source);
  if (!options.ignoreEnabled && template.enabled === false) return ensureBlob(source);

  const color = cssColor(template.color);
  let top = clampPx(template.top);
  let right = clampPx(template.right);
  let bottom = clampPx(template.bottom);
  let left = clampPx(template.left);
  if (!top && !right && !bottom && !left) return ensureBlob(source);

  const bitmap = isBitmap(source) ? source : await createImageBitmap(source);

  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) {
      throw new Error(`[safelight-border] Photo failed to decode (got ${srcW}x${srcH}).`);
    }

    let scaleX = 1;
    let scaleY = 1;
    const refW = Number(options.referenceWidth);
    const refH = Number(options.referenceHeight);
    if (refW > srcW) scaleX = srcW / refW;
    if (refH > srcH) scaleY = srcH / refH;

    let dw = srcW;
    let dh = srcH;
    const maxLong = options.maxLongEdge;
    if (maxLong && Math.max(srcW, srcH) > maxLong) {
      const s = maxLong / Math.max(srcW, srcH);
      dw = Math.max(1, Math.round(srcW * s));
      dh = Math.max(1, Math.round(srcH * s));
      scaleX *= dw / srcW;
      scaleY *= dh / srcH;
    }

    const scaleSide = (px, scale) => {
      const n = Math.round(px * scale);
      if (options.preview && px > 0 && n < 1) return 1;
      return n;
    };
    top = scaleSide(top, scaleY);
    bottom = scaleSide(bottom, scaleY);
    left = scaleSide(left, scaleX);
    right = scaleSide(right, scaleX);

    const W = dw + left + right;
    const H = dh + top + bottom;
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[safelight-border] 2D canvas unavailable.");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(bitmap, left, top, dw, dh);

    const quality = options.quality ?? (options.preview ? 0.82 : 0.95);
    const type = options.preview ? "image/jpeg" : (source.type || "image/jpeg");
    const encoded = (mime) => (
      mime === "image/jpeg" || mime === "image/webp" ? { type: mime, quality } : { type: mime }
    );
    try {
      return await canvas.convertToBlob(encoded(type));
    } catch (err) {
      if (type === "image/jpeg") throw err;
      return await canvas.convertToBlob(encoded("image/jpeg"));
    }
  } finally {
    bitmap.close?.();
  }
}

function borderSummary(template) {
  const t = template || freshTemplate();
  return `Adds ${t.top}/${t.right}/${t.bottom}/${t.left} px (top/right/bottom/left) — original photo is not cropped`;
}

// ── Export panel settings ─────────────────────────────────────────────────────
// Shown under "Border" in Safelight's core Export panel (instead of
// "No settings."). Apply and Template decide the file. "Show in Develop"
// only controls the live canvas overlay.
let hostApi = null;
let exportFieldsKey = "";

function getProcessorFields(tpls) {
  if (!tpls || !tpls.length) return [];
  const active = resolveExportTemplate(tpls);
  const activeOn = active?.enabled !== false;
  return [
    {
      key: "enabled",
      type: "boolean",
      label: "Apply border",
      hint: activeOn
        ? `Active template: ${active?.name || "—"}`
        : `Active template: ${active?.name || "—"} (Develop overlay off)`,
      default: true,
    },
    {
      key: "template",
      type: "select",
      label: "Template",
      options: tpls.map((t) => ({
        value: t.id,
        label: t.enabled === false ? `${t.name} (Develop off)` : t.name,
      })),
      default: active ? active.id : tpls[0].id,
    },
  ];
}

function syncExportProcessor() {
  if (!hostApi?.registerExportProcessor) return;
  const tpls = loadTemplates();
  const fields = getProcessorFields(tpls);
  const key = JSON.stringify(fields);
  if (key === exportFieldsKey) return;
  exportFieldsKey = key;
  hostApi.registerExportProcessor({
    id: "safelight-border.processor",
    label: "Border",
    settings: fields,
    async process(blob, photo, settings) {
      // Export panel Apply + Template are the source of truth for the file.
      // The panel checkbox only controls the Develop overlay.
      console.log("[safelight-border] export processor invoked for", photo?.filename || "(unknown photo)");
      if (settings?.enabled === false) return blob;
      const list = loadTemplates();
      const tpl = (settings?.template && list.find((x) => x.id === settings.template))
        || resolveExportTemplate(list);
      if (!tpl) return blob;
      try {
        return await applyBorder(blob, tpl, { ignoreEnabled: true });
      } catch (err) {
        console.error("[safelight-border] applyBorder failed — returning unmodified export:", err);
        return blob;
      }
    },
  });
}

// ── Activation ────────────────────────────────────────────────────────────────
export function activate(api) {
  console.log(`%c[safelight-border] extension loaded — v${VERSION}`, "color:#C15F3C;font-weight:bold");
  const { react: React, stores } = api;
  const { useState, useEffect, useCallback, useRef } = React;
  const ce = (type, props, ...ch) => React.createElement(type, props, ...ch);

  const ICONS = {
    reset: "M12 5V2L7 7l5 5V8c2.76 0 5 2.24 5 5s-2.24 5-5 5-5-2.24-5-5H5c0 3.87 3.13 7 7 7s7-3.13 7-7-3.13-7-7-7z",
    save:  "M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zM12 19c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zM15 9H5V5h10v4z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  };
  const Icon = (name, size = 14) => ce("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor",
    style: { flexShrink: 0 },
    "aria-hidden": "true",
  }, ce("path", { d: ICONS[name] }));

  // Registered here, not when the panel mounts, so Export shows Apply +
  // Template even if the Border panel is closed. Later template edits
  // re-register so the dropdown stays current.
  hostApi = api;
  syncExportProcessor();

  function BorderPanel() {
    const [templates, setTemplates] = useState(loadTemplates);
    const [activeIdx, setActiveIdx] = useState(() => indexOfActive(loadTemplates()));
    const [newName, setNewName] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [activePhoto, setActivePhoto] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [developParams, setDevelopParams] = useState(null);
    const [activeModule, setActiveModule] = useState("library");
    const previewUrlRef = useRef(null);
    const previewGenRef = useRef(0);

    const t = templates[activeIdx] || templates[0];

    useEffect(() => subscribeTemplates((next) => setTemplates(next)), []);

    useEffect(() => {
      if (t?.id) saveActiveTemplateId(t.id);
    }, [t?.id]);

    useEffect(() => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    }, []);

    useEffect(() => {
      const cat = stores?.useCatalogStore;
      const dev = stores?.useDevelopStore;
      const ui = stores?.useUIStore;
      const unsubs = [];
      if (cat?.subscribe) {
        const sync = (state) => {
          const id = state.activePhotoId;
          setActivePhoto(id ? (state.photos || []).find((p) => p.id === id) || null : null);
        };
        unsubs.push(cat.subscribe(sync));
        sync(cat.getState());
      }
      if (dev?.subscribe) {
        const sync = (state) => setDevelopParams(state.params || null);
        unsubs.push(dev.subscribe(sync));
        sync(dev.getState());
      }
      if (ui?.subscribe) {
        const sync = (state) => setActiveModule(state.activeModule || "library");
        unsubs.push(ui.subscribe(sync));
        sync(ui.getState());
      }
      return () => unsubs.forEach((fn) => fn && fn());
    }, []);

    const update = (key, val) => {
      setTemplates((prev) => {
        const next = prev.map((x, i) => {
          if (i !== activeIdx) return x;
          const updated = { ...x, [key]: val };
          if (key === "top" || key === "right" || key === "bottom" || key === "left") {
            updated[key] = clampPx(val);
            if (x.linked) {
              const n = updated[key];
              updated.top = updated.right = updated.bottom = updated.left = n;
            }
          }
          if (key === "color") updated.color = cssColor(val, x.color);
          if (key === "linked" && val) {
            updated.right = updated.bottom = updated.left = updated.top;
          }
          return updated;
        });
        saveTemplates(next);
        return next;
      });
    };

    const addTemplate = (name) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      setShowNew(false);
      setNewName("");
      setTemplates((prev) => {
        const created = templateFromDefaults(Date.now().toString(), trimmed);
        const next = [...prev, created];
        saveActiveTemplateId(created.id);
        saveTemplates(next, true);
        setActiveIdx(next.length - 1);
        return next;
      });
    };

    const renameTemplate = (name) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      setShowNew(false);
      setNewName("");
      setTemplates((prev) => {
        const next = prev.map((x, i) => (i === activeIdx ? { ...x, name: trimmed } : x));
        saveTemplates(next, true);
        return next;
      });
    };

    const deleteTemplate = () => {
      if (templates.length <= 1) return;
      setTemplates((prev) => {
        const next = prev.filter((_, i) => i !== activeIdx);
        const idx = Math.max(0, activeIdx - 1);
        if (next[idx]?.id) saveActiveTemplateId(next[idx].id);
        saveTemplates(next, true);
        setActiveIdx(idx);
        return next;
      });
    };

    const saveAsDefaults = () => { if (t) saveUserDefaults(t); };
    const resetToDefaults = () => { resetActiveToDefaults(); };

    const commitName = () => {
      if (showNew === true) addTemplate(newName);
      else renameTemplate(newName);
    };

    const buildPreviewSource = useCallback(async () => {
      if (activeModule === "develop" && developParams && api.develop?.captureFrame) {
        const bitmap = await api.develop.captureFrame(developParams);
        return {
          source: bitmap,
          reference: outputPixels(activePhoto, developParams),
        };
      }
      if (activePhoto?.thumbnailUrl) {
        try {
          const resp = await fetch(activePhoto.thumbnailUrl);
          if (resp.ok) {
            return { source: await resp.blob(), reference: orientedSize(activePhoto) };
          }
        } catch (err) {
          console.error("[safelight-border] thumbnail preview failed:", err);
        }
      }
      const canvas = new OffscreenCanvas(800, 533);
      const ctx = canvas.getContext("2d");
      const grad = ctx.createLinearGradient(0, 0, 800, 533);
      grad.addColorStop(0, "#3C3836");
      grad.addColorStop(1, "#1C1917");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 533);
      ctx.strokeStyle = "#57534E";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(800, 533);
      ctx.moveTo(800, 0); ctx.lineTo(0, 533);
      ctx.stroke();
      ctx.fillStyle = "#B1ADA1";
      ctx.font = "32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sample Photo", 400, 280);
      return { source: await canvas.convertToBlob({ type: "image/jpeg" }), reference: null };
    }, [activeModule, developParams, activePhoto]);

    const generatePreview = useCallback(async () => {
      const gen = ++previewGenRef.current;
      setPreviewing(true);
      try {
        const { source, reference } = await buildPreviewSource();
        if (gen !== previewGenRef.current) {
          source?.close?.();
          return;
        }
        const resultBlob = await applyBorder(source, t, {
          ignoreEnabled: true,
          preview: true,
          maxLongEdge: 1400,
          referenceWidth: reference?.w,
          referenceHeight: reference?.h,
        });
        if (gen !== previewGenRef.current) return;
        const url = URL.createObjectURL(resultBlob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      } catch (err) {
        if (gen === previewGenRef.current) console.error("[safelight-border] preview error:", err);
      } finally {
        if (gen === previewGenRef.current) setPreviewing(false);
      }
    }, [t, buildPreviewSource]);

    const liveTimerRef = useRef(null);
    // Template, photo, and module changes refresh the panel. Develop slider
    // ticks do not, while the overlay is showing the same frame on the canvas.
    useEffect(() => {
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => { generatePreview(); }, 450);
      return () => clearTimeout(liveTimerRef.current);
    }, [t, activePhoto?.id, activeModule]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (t?.enabled !== false) return undefined;
      if (activeModule !== "develop" || !developParams || !api.develop?.captureFrame) return undefined;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      liveTimerRef.current = setTimeout(() => { generatePreview(); }, 550);
      return () => clearTimeout(liveTimerRef.current);
    }, [developParams, activeModule, t?.enabled]); // eslint-disable-line react-hooks/exhaustive-deps

    const sideInput = (label, key) => ce("div", { style: { ...S.row, marginBottom: 4 } },
      ce("span", { style: S.label }, label),
      ce("input", {
        style: S.input, type: "number", min: 0, max: 500, step: 1,
        value: t[key],
        "aria-label": `${label} border width`,
        onChange: (e) => update(key, e.target.value),
      }),
    );

    return ce("div", { style: S.container },
      ce("div", { style: S.sectionTitle }, "Templates"),
      ce("div", { style: { marginBottom: 6 } },
        ...templates.map((tp, i) => ce("span", {
          key: tp.id,
          style: i === activeIdx ? S.tagActive : S.tag,
          onClick: () => setActiveIdx(i),
          onDoubleClick: () => { setActiveIdx(i); setNewName(tp.name); setShowNew("rename"); },
          title: "Click to select · Double-click to rename",
        }, tp.name)),
      ),
      showNew === true || showNew === "rename"
        ? ce("div", { style: { display: "flex", gap: 6, marginBottom: 10, alignItems: "center" } },
            ce("input", {
              style: { ...S.inputText, width: 120 },
              type: "text",
              placeholder: showNew === true ? "Template name…" : "Rename…",
              value: newName,
              autoFocus: true,
              "aria-label": showNew === true ? "New template name" : "Template name",
              onChange: (e) => setNewName(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") { setShowNew(false); setNewName(""); }
              },
            }),
            ce("button", { style: S.btnAccent, onClick: commitName }, "Save"),
            ce("button", { style: S.btn, onClick: () => { setShowNew(false); setNewName(""); } }, "Cancel"),
          )
        : ce("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
            ce("button", {
              style: S.btn,
              onClick: () => { setNewName(`Border ${templates.length + 1}`); setShowNew(true); },
            }, "+ New"),
            ce("button", {
              style: { ...S.btnDanger, opacity: templates.length <= 1 ? 0.4 : 1 },
              onClick: deleteTemplate,
              disabled: templates.length <= 1,
            }, "Delete"),
          ),

      ce("hr", { style: S.divider }),

      ce("div", { style: S.row },
        ce("label", { style: { ...S.label, cursor: "pointer", display: "flex", alignItems: "center" } },
          ce("input", {
            type: "checkbox", style: S.checkbox,
            checked: t.enabled !== false,
            onChange: (e) => update("enabled", e.target.checked),
          }),
          "Show in Develop",
        ),
      ),
      ce("div", { style: { ...S.label, fontSize: 10, marginBottom: 4, lineHeight: 1.4 } },
        "Live overlay on the Develop canvas. Export has its own Apply + Template controls under Border — panel preview always shows current settings.",
      ),

      ce("hr", { style: S.divider }),

      ce("div", { style: S.sectionTitle }, "Color"),
      ce("div", { style: S.row },
        ce("span", { style: S.label }, "Border color"),
        ce("input", {
          type: "color", style: S.colorInput,
          value: cssColor(t.color),
          "aria-label": "Border color",
          onChange: (e) => update("color", e.target.value),
        }),
      ),

      ce("hr", { style: S.divider }),

      ce("div", { style: S.sectionTitle }, "Width (px)"),
      ce("div", { style: S.row },
        ce("label", { style: { ...S.label, cursor: "pointer", display: "flex", alignItems: "center" } },
          ce("input", {
            type: "checkbox", style: S.checkbox,
            checked: !!t.linked,
            onChange: (e) => update("linked", e.target.checked),
          }),
          "Link all sides",
        ),
      ),
      sideInput("Top", "top"),
      sideInput("Right", "right"),
      sideInput("Bottom", "bottom"),
      sideInput("Left", "left"),
      ce("div", { style: S.defaultsRow },
        ce("button", {
          style: { ...S.btn, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" },
          onClick: resetToDefaults,
        }, Icon("reset"), "Reset to Defaults"),
        ce("button", {
          style: { ...S.btn, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" },
          onClick: saveAsDefaults,
        }, Icon("save"), "Save as Defaults"),
      ),

      ce("hr", { style: S.divider }),

      ce("div", { style: S.sectionTitle }, "Preview"),
      previewUrl
        ? ce("div", { style: { ...S.preview, padding: 4 } },
            ce("img", {
              src: previewUrl, alt: "Border preview",
              style: { maxWidth: "100%", maxHeight: 240, borderRadius: 2 },
            }),
          )
        : ce("div", { style: S.preview }, "Generating preview…"),
      ce("button", {
        style: { ...S.previewBtn, opacity: previewing ? 0.6 : 1, cursor: previewing ? "wait" : "pointer" },
        onClick: generatePreview,
        disabled: previewing,
      }, previewing ? null : Icon("image"), previewing ? "Generating…" : "Generate Preview"),
      ce("div", { style: { color: "var(--color-text-secondary)", fontSize: 10, marginTop: 6, textAlign: "center", lineHeight: 1.4 } },
        activeModule === "develop" && developParams && api.develop?.captureFrame
          ? "Live preview — follows your edits in Develop"
          : activePhoto
            ? "Using selected photo (unedited thumbnail)"
            : "No photo selected — using sample image",
      ),
      ce("div", { style: { color: "var(--color-text-secondary)", fontSize: 10, marginTop: 4, textAlign: "center", lineHeight: 1.4 } },
        borderSummary(t),
      ),
    );
  }

  function DevelopOverlay() {
    const [tpl, setTpl] = useState(() => resolveExportTemplate(loadTemplates()));
    const [photo, setPhoto] = useState(null);
    const [developParams, setDevelopParams] = useState(null);
    const [renderedUrl, setRenderedUrl] = useState(null);
    const renderedUrlRef = useRef(null);
    const debounceRef = useRef(null);
    const genRef = useRef(0);

    useEffect(() => subscribeTemplates(() => {
      const next = resolveExportTemplate(loadTemplates());
      setTpl((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }), []);

    useEffect(() => {
      const cat = stores?.useCatalogStore;
      const dev = stores?.useDevelopStore;
      const unsubs = [];
      if (cat?.subscribe) {
        const sync = (state) => {
          const id = state.activePhotoId;
          setPhoto(id ? (state.photos || []).find((p) => p.id === id) || null : null);
        };
        unsubs.push(cat.subscribe(sync));
        sync(cat.getState());
      }
      if (dev?.subscribe) {
        const sync = (state) => setDevelopParams(state.params || null);
        unsubs.push(dev.subscribe(sync));
        sync(dev.getState());
      }
      return () => unsubs.forEach((fn) => fn && fn());
    }, []);

    const overlay = api.develop.useDevelopOverlay();
    const rect = overlay?.rect;
    const nonce = overlay?.nonce;
    const rectX = rect?.x;
    const rectY = rect?.y;
    const rectW = rect?.w;
    const rectH = rect?.h;

    useEffect(() => {
      const clearRender = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (renderedUrlRef.current) {
          URL.revokeObjectURL(renderedUrlRef.current);
          renderedUrlRef.current = null;
          setRenderedUrl(null);
        }
      };
      if (
        rectX == null || rectY == null || !rectW || !rectH || !tpl ||
        tpl.enabled === false || !hasBorder(tpl) || !developParams || !api.develop?.captureFrame
      ) {
        clearRender();
        return undefined;
      }
      const frameRect = { x: rectX, y: rectY, w: rectW, h: rectH };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const gen = ++genRef.current;
      debounceRef.current = setTimeout(async () => {
        try {
          // asShown keeps the overlay in the same color as the canvas.
          const bitmap = await api.develop.captureFrame(developParams, { asShown: true });
          if (gen !== genRef.current) { bitmap?.close?.(); return; }
          const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
          const displayLong = Math.max(frameRect.w || 900, frameRect.h || 900) * dpr;
          const maxLongEdge = Math.min(1600, Math.max(720, Math.round(displayLong * 1.15)));
          const reference = outputPixels(photo, developParams);
          const resultBlob = await applyBorder(bitmap, tpl, {
            maxLongEdge,
            preview: true,
            referenceWidth: reference?.w,
            referenceHeight: reference?.h,
          });
          if (gen !== genRef.current) return;
          const url = URL.createObjectURL(resultBlob);
          if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current);
          renderedUrlRef.current = url;
          setRenderedUrl(url);
        } catch (err) {
          if (gen === genRef.current) console.error("[safelight-border] develop overlay render error:", err);
        }
      }, 550);
      return () => {
        genRef.current += 1;
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [tpl, photo, developParams, rectX, rectY, rectW, rectH, nonce]);

    useEffect(() => () => {
      if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current);
    }, []);

    if (!rect || !tpl || tpl.enabled === false || !hasBorder(tpl)) return null;
    const frame = screenFrame(tpl, rect, outputPixels(photo, developParams));
    if (!frame?.visible) return null;

    if (renderedUrl) {
      return ce("img", {
        src: renderedUrl,
        alt: "",
        style: {
          position: "absolute", pointerEvents: "none",
          left: frame.outerLeft, top: frame.outerTop,
          width: frame.outerW, height: frame.outerH,
          objectFit: "fill",
        },
      });
    }

    return ce("div", {
      style: {
        position: "absolute", pointerEvents: "none", boxSizing: "border-box",
        left: frame.outerLeft, top: frame.outerTop,
        width: frame.outerW, height: frame.outerH,
        borderStyle: "solid",
        borderColor: cssColor(tpl.color),
        borderWidth: `${frame.top}px ${frame.right}px ${frame.bottom}px ${frame.left}px`,
      },
    });
  }

  if (api.develop?.useDevelopOverlay && api.develop?.captureFrame) {
    api.registerSlot({
      id: "safelight-border.develop-overlay",
      slot: "develop-canvas-overlay",
      component: DevelopOverlay,
    });
  }

  api.registerPanel({
    id: "safelight-border.panel",
    title: "Border",
    component: BorderPanel,
    // Current Safelight places panels with defaultDock. defaultLocation is
    // kept so an older host that still reads it opens the panel on the right.
    defaultDock: { module: "develop", direction: "right", order: 80, width: 300 },
    defaultLocation: "right",
    fill: true,
    onReset: () => { resetActiveToDefaults(); },
  });
}

export function deactivate() {
  if (saveTemplatesTimer) {
    clearTimeout(saveTemplatesTimer);
    saveTemplatesTimer = null;
    try {
      if (templatesCache) localStorage.setItem(STORAGE_KEY, JSON.stringify(templatesCache));
    } catch (e) {}
  }
}
