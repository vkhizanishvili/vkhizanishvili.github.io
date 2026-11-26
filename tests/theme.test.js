// Оформление из админки (src/_lib/theme.js): проверка значений, читаемость,
// CSS-переменные и шрифты.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { normalizeTheme, contrastRatio, themeCss, preloadFont, FONT_SOURCES } from "../src/_lib/theme.js";

const fontFaces = (css) => (css.match(/@font-face/g) || []).length;

test("normalizeTheme keeps today's look by default", () => {
  const expected = { background: "#ffffff", text: "#1b1b1b", headingFont: "onest", bodyFont: "onest", size: "normal", textAdjusted: false };
  assert.deepEqual(normalizeTheme({}), expected);
  assert.deepEqual(normalizeTheme(undefined), expected);
  assert.deepEqual(normalizeTheme(null), expected);
});

test("normalizeTheme accepts admin colour formats", () => {
  assert.equal(normalizeTheme({ background: "#FFF" }).background, "#ffffff");
  assert.equal(normalizeTheme({ background: "#1D1D1F", text: "#F2F2F2" }).background, "#1d1d1f");
  for (const bad of ["#ffffff80", "white", "", 42]) {
    assert.equal(normalizeTheme({ background: bad }).background, "#ffffff", String(bad));
  }
});

test("normalizeTheme falls back for unknown fonts and sizes", () => {
  const t = normalizeTheme({ heading_font: "comic-sans", body_font: "inter", size: "huge" });
  assert.equal(t.headingFont, "onest");
  assert.equal(t.bodyFont, "inter");
  assert.equal(t.size, "normal");
});

test("contrastRatio matches WCAG", () => {
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
  assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrastRatio("#ffffff", "#1b1b1b") - 17.2) < 0.1);
});

test("normalizeTheme rescues unreadable text", () => {
  const light = normalizeTheme({ background: "#f5f5f5", text: "#eeeeee" });
  assert.equal(light.text, "#000000");
  assert.equal(light.textAdjusted, true);
  assert.equal(normalizeTheme({ background: "#202020", text: "#303030" }).text, "#ffffff");
  assert.equal(normalizeTheme({ background: "#1d1d1f", text: "#f2f2f2" }).textAdjusted, false);
});

test("themeCss emits only the chosen fonts", () => {
  const css = themeCss(normalizeTheme({ background: "#1d1d1f", text: "#f2f2f2", heading_font: "playfair-display", body_font: "inter", size: "large" }));
  assert.ok(css.includes('font-family: "Playfair Display"'));
  assert.ok(css.includes('font-family: "Inter"'));
  assert.ok(!css.includes("Onest"));
  assert.ok(css.includes('url("../fonts/inter-cyrillic.woff2")'));
  assert.ok(css.includes("--base-size: 112.5%"));
  assert.ok(css.includes("--bg: #1d1d1f"));
  assert.ok(css.includes("--text: #f2f2f2"));
});

test("themeCss does not repeat a font used twice", () => {
  assert.equal(fontFaces(themeCss(normalizeTheme({ heading_font: "lora", body_font: "lora" }))), 2);
});

test("pt-serif has real 400 and 700 faces", () => {
  const theme = normalizeTheme({ heading_font: "pt-serif", body_font: "pt-serif" });
  const css = themeCss(theme);
  assert.equal(fontFaces(css), 4);
  for (const file of ["pt-serif-cyrillic-400.woff2", "pt-serif-cyrillic-700.woff2", "pt-serif-latin-400.woff2", "pt-serif-latin-700.woff2"]) {
    assert.ok(css.includes(file), file);
  }
  assert.match(css, /font-weight: 400;/);
  assert.match(css, /font-weight: 700;/);
  assert.equal(preloadFont(theme), "/assets/fonts/pt-serif-cyrillic-400.woff2");
  assert.equal(preloadFont(normalizeTheme({})), "/assets/fonts/onest-cyrillic.woff2");
});

test("every font source exists in node_modules", () => {
  assert.equal(FONT_SOURCES.length, 22);
  for (const { from } of FONT_SOURCES) assert.ok(existsSync(from), from);
});

test("default colours keep the hand-tuned palette, others derive shades", () => {
  assert.ok(!themeCss(normalizeTheme({})).includes("--muted"), "today's warm greys stay in style.css");
  const dark = themeCss(normalizeTheme({ background: "#1d1d1f", text: "#f2f2f2" }));
  for (const v of ["--muted", "--line", "--frame"]) assert.ok(dark.includes(`${v}: color-mix(in srgb, var(--text) `), v);
});
