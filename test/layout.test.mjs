import assert from "node:assert/strict";
import { borderLayout, mapPoint, lineBand, MODE_CONSTANT, MODE_WHOLE, hexToRgb, rgbToHex,
         FIT_STAGE_DEF, PAINT_STAGE_DEF } from "../dist/index.js";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

// Constant border, 3:2 landscape, 10% of the short edge: equal border all round.
{
  const Ap = 1.5, L = borderLayout({ aspect: Ap, size: 10, mode: MODE_CONSTANT });
  near(L.b, 0.1);
  near(L.window.x, 0.1); near(L.window.y, 0.1);
  near(Ap - (L.window.x + L.window.w), 0.1); near(1 - (L.window.y + L.window.h), 0.1);
  // Content covers the window and keeps the photo's aspect.
  near(L.content.w / L.content.h, Ap);
  assert.ok(L.content.w >= L.window.w - 1e-12 && L.content.h >= L.window.h - 1e-12);
  // Centre maps to centre.
  const m = mapPoint(L, Ap, { x: 0.5, y: 0.5 });
  near(m.q.x, 0.5); near(m.q.y, 0.5); assert.equal(m.inside, true);
  // Corner is border.
  assert.equal(mapPoint(L, Ap, { x: 0.01, y: 0.01 }).inside, false);
}

// Whole photo: everything visible, border at least the size, aspect kept.
{
  const Ap = 1.5, L = borderLayout({ aspect: Ap, size: 10, mode: MODE_WHOLE });
  near(L.window.w / L.window.h, Ap);
  assert.ok(L.window.x >= 0.1 - 1e-12 && L.window.y >= 0.1 - 1e-12);
  // Window corners map to the photo's corners.
  const tl = mapPoint(L, Ap, { x: L.window.x / Ap, y: L.window.y });
  near(tl.q.x, 0); near(tl.q.y, 0);
  const br = mapPoint(L, Ap, { x: (L.window.x + L.window.w) / Ap, y: L.window.y + L.window.h });
  near(br.q.x, 1); near(br.q.y, 1);
}

// Position moves the extra space (whole photo, portrait frame).
{
  const Ap = 2 / 3;
  const top = borderLayout({ aspect: Ap, size: 5, mode: MODE_WHOLE, offY: 0 });
  const bottom = borderLayout({ aspect: Ap, size: 5, mode: MODE_WHOLE, offY: 1 });
  assert.ok(top.window.y < bottom.window.y);
}

// Size 0 is the identity.
{
  for (const mode of [MODE_CONSTANT, MODE_WHOLE]) {
    const Ap = 1.5, L = borderLayout({ aspect: Ap, size: 0, mode });
    for (const f of [{ x: 0.2, y: 0.7 }, { x: 0.9, y: 0.1 }]) {
      const m = mapPoint(L, Ap, f); near(m.q.x, f.x); near(m.q.y, f.y);
    }
  }
}

// Frame line band sits inside the border.
{
  const L = borderLayout({ aspect: 1.5, size: 10, mode: MODE_CONSTANT });
  const band = lineBand(L, 20, 50);
  near(band.to - band.from, 0.02);
  assert.ok(band.from >= 0 && band.to <= L.b + 1e-12);
  const atPhoto = lineBand(L, 20, 0), atEdge = lineBand(L, 20, 100);
  near(atPhoto.from, 0); near(atEdge.to, L.b);
}

// Colours round-trip.
assert.deepEqual(hexToRgb("#ffffff"), [1, 1, 1]);
assert.equal(rgbToHex([1, 0, 0]), "#ff0000");
assert.equal(rgbToHex(hexToRgb("#c15f3c")), "#c15f3c");

// Stages stay out of the program at their defaults.
assert.deepEqual(FIT_STAGE_DEF.dormantWhen, { bSize: 0 });
assert.deepEqual(PAINT_STAGE_DEF.dormantWhen, { bOn: false });
for (const u of FIT_STAGE_DEF.uniforms) assert.ok(FIT_STAGE_DEF.glsl.includes(u.key), u.key);
for (const u of PAINT_STAGE_DEF.uniforms.filter((u) => u.key !== "bOn")) assert.ok(PAINT_STAGE_DEF.glsl.includes(u.key), u.key);

console.log("all layout tests passed");

// Templates: bag → template → patch round-trips and matches.
import { templateFromBag, templateToPatch, templateMatches, STARTER_TEMPLATES } from "../dist/index.js";
{
  const bag = { "safelight-border.fit.bSize": 7, "safelight-border.fit.bLine": 10, "safelight-border.paint.bColor": [0.2, 0.3, 0.4] };
  const t = templateFromBag(bag, "Mine", "x");
  assert.equal(t.size, 7); assert.deepEqual(t.color, [0.2, 0.3, 0.4]); assert.equal(t.offX, 0.5);
  const patch = templateToPatch(t);
  assert.equal(patch["safelight-border.paint.bOn"], true);
  assert.ok(templateMatches(t, patch));
  assert.ok(!templateMatches(STARTER_TEMPLATES[0], patch));
  for (const s of STARTER_TEMPLATES) assert.ok(templateMatches(s, templateToPatch(s)), s.name);
}
console.log("template tests passed");

// Default template lookup.
import { defaultTemplate } from "../dist/index.js";
{
  assert.equal(defaultTemplate(STARTER_TEMPLATES, STARTER_TEMPLATES[1].id), STARTER_TEMPLATES[1]);
  assert.equal(defaultTemplate(STARTER_TEMPLATES, "gone"), undefined);
  assert.equal(defaultTemplate(null, "x"), undefined);
}
console.log("default template tests passed");
