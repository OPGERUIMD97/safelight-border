# Safelight Border

A solid-color border for [Safelight](https://github.com/anthonyreimche/SafeLight). The border is added around the photo — the original pixels are never cropped.

## Features

### Templates
- Multiple named templates. Click to select, double-click to rename. The one you have selected is the one Develop and export use.
- **↺ Reset to Defaults** / **💾 Save as Defaults** — set your own starting point for new templates

### Border
- Custom color
- Per-side width in pixels (0–500), or linked so every side stays equal
- The border is drawn outside the photo. Nothing is cropped.

### Preview
- **Show in Develop** — live border on the Develop canvas only. The panel preview always shows your current settings. Export has its own **Apply border** and **Template** controls.
- Live preview in Develop that follows your edits, or the selected Library thumbnail, or a sample image when nothing is selected
- The same border drawn on the Develop canvas, including while you zoom and pan
- Widths are pixels on the exported file. On the canvas and in the preview they scale with the photo, so a 20 px border stays a thin edge on screen.

## Changelog

### 1.0.0 — Initial release
First public release. Highlights:
- Solid color border added around the photo — the original is never cropped
- Per-side width in pixels, or linked sides, plus a custom color
- Named templates, double-click to rename, **↺ Reset to Defaults** / **💾 Save as Defaults**
- **Show in Develop** draws the border on the Develop canvas; the panel preview always shows the current settings
- Live preview in Develop, or the selected Library thumbnail (unedited) or a sample image
- Export panel **Border** section: **Apply border** and **Template**

## Installation

In Safelight → **View → Extensions**, enter:

```
OPGERUIMD97/safelight-border
```

## Export & Print integration

The active Border template is applied during Safelight export. In the Export panel under **Border** you can toggle **Apply border** and pick which **Template** to use. The panel's **Show in Develop** checkbox only controls the live Develop overlay.

## How it differs from the Print Mat extension

[Print Mat](https://github.com/OPGERUIMD97/safelight-print-mat) is the full framing toolkit — canvas, crop, mat, matte bevel, frame, directional shadows, textures, EXIF captions. Border is the quick solid-color border.

## License

MIT
