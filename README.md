# Border

A border around the photo for [Safelight](https://github.com/anthonyreimche/SafeLight), set per photo in Develop. The border is drawn inside the frame: the photo is scaled down and the space around it becomes the border, so the photo keeps its size. Because it is part of the edit, the border shows in Develop, on thumbnails, in presets, in copy/paste and in every export.

## Install

In Safelight, go to **View ▸ Extensions** and enter:

```
OPGERUIMD97/safelight-border
```

Then open **Develop ▸ Border**. Safelight 3.2.6 or newer.

## Controls

| Control | What it does |
| --- | --- |
| Templates | Saved borders shown as chips; click one to apply it (the active chip is highlighted). **☆ Set as default** marks the selected template with ★, **Add border** applies the default when the photo has no border yet. **Save as template** stores the current settings under a name, **Delete** removes the selected one |
| Border size | Width of the border, in % of the frame's short edge |
| Aspect | **Constant border**: the same width on every side; the photo fills the window and loses a sliver on one axis. **Whole photo**: the whole photo stays visible; the extra space goes where the position says |
| Horizontal / Vertical position | Center, 1/3, 3/8, 5/8 or 2/3; sets the offset below |
| Horizontal / Vertical offset | Fine placement, 0 to 1 |
| Frame line size | A thin line in the border, in % of the border width (0 = no line) |
| Frame line offset | Where the line sits: 0% against the photo, 100% at the outer edge |
| Border colour / Frame line colour | Colour swatch, or the pipette to pick a colour from the photo |

## In the Library

Dock the Border panel in the Library to put a border on many photos at once:

1. Select photos in the grid.
2. Pick a template chip (the default ★ is picked first).
3. Click **Apply to N photos**. **Remove border** takes it off again.
4. Export as usual: each photo carries its own border.

A green dot on the thumbnail marks every photo with a border (hover for the template), and the panel shows how many of the selected photos have one. Every photo gets one undoable step in its history. In the Library the panel only works on the selection, never on the photo that is open in Develop. Fine-tune a single photo in Develop.

## Notes

- The frame follows your crop. For a square or 3:2 result, pick that ratio in **Crop** first.
- Templates live in this Safelight profile and start with five examples (white thin/wide, black thin, white with a black line, whole photo on white). Safelight presets also carry the border settings. The default template is never applied on its own; you add it with one click.
- For mats, passe-partouts, frames and print layouts, use [Framing / Border](https://github.com/OPGERUIMD97/safelight-mat-frame). Its Border mode steps aside while this extension is active.

## Changelog

### 2.5.0
- Green dot on Library and Filmstrip thumbnails for photos with a border, with the template in the tooltip.
- In the Library the panel header dot and a status line show how many selected photos have a border.

### 2.4.0
- Library: apply a template to all selected photos with one click, or remove the border. The panel no longer changes the photo that is open in Develop while you are in the Library.

### 2.3.0
- A green dot in the panel header shows when a border is on, also when the panel is collapsed. Hover it to see which template is active.

### 2.2.0
- Templates are shown as chips.
- Mark one template as default (★) and add it with one click via **Add border**.

### 2.1.0
- Templates: pick, save and delete named borders, with five examples to start from.

### 2.0.0
- Back as its own extension, rebuilt as a Develop panel: border size, aspect, position, frame line and colours with a pipette.
- Drawn inside the frame, so it shows on thumbnails and in presets as well as in exports.

### 1.1.0
- Discontinued in favour of Framing / Border.

### 1.0.0
- First release: solid border in pixels, templates, Develop overlay, export.

## License

MIT
