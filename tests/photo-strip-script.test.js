// Полоска картины в окне на телефоне (src/assets/js/photo-strip.js):
// расчёт высоты фото. Скрипт браузерный, поэтому выполняется в песочнице node:vm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadScript() {
  const context = { document: { getElementById: () => null }, console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync("src/assets/js/photo-strip.js", "utf8"), context);
  return context.PhotoStrip;
}

const PS = loadScript();
const plain = (value) => JSON.parse(JSON.stringify(value)); // объект из песочницы → обычный

test("photoSizes gives a 2:1 strip on a phone", () => {
  assert.deepEqual(plain(PS.photoSizes(375, 812)), { start: 447, strip: 188 });
});

test("photoSizes never makes the strip taller than the start", () => {
  // телефон повёрнут горизонтально: «полоска» 2:1 по ширине была бы выше экрана
  assert.deepEqual(plain(PS.photoSizes(812, 375)), { start: 206, strip: 206 });
});

test("visiblePhotoHeight shrinks with scrolling down to the strip", () => {
  const sizes = { start: 447, strip: 188 };
  assert.equal(PS.visiblePhotoHeight(0, sizes), 447);
  assert.equal(PS.visiblePhotoHeight(100, sizes), 347);
  assert.equal(PS.visiblePhotoHeight(259, sizes), 188);
  assert.equal(PS.visiblePhotoHeight(5000, sizes), 188);
});

test("visiblePhotoHeight ignores overscroll bounce", () => {
  assert.equal(PS.visiblePhotoHeight(-60, { start: 447, strip: 188 }), 447);
});

// --- Масштаб вместо высоты (после проверки на iPad) -------------------------

test("minPhotoScale shrinks the photo to the strip", () => {
  assert.equal(PS.minPhotoScale({ start: 447, strip: 188 }), 188 / 447);
  assert.equal(PS.minPhotoScale({ start: 206, strip: 206 }), 1, "landscape phone: no shrinking");
});

test("photoScaleAt follows the visible height and ignores overscroll", () => {
  const sizes = { start: 447, strip: 188 };
  assert.equal(PS.photoScaleAt(0, sizes), 1);
  assert.equal(PS.photoScaleAt(100, sizes), 347 / 447);
  assert.equal(PS.photoScaleAt(5000, sizes), 188 / 447);
  assert.equal(PS.photoScaleAt(-60, sizes), 1);
});
