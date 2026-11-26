// Проверки админки: конфиг Sveltia CMS согласован с тем, что читает сайт.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { STATUSES } from "../src/_lib/paintings.js";
import { FONTS, SIZES } from "../src/_lib/theme.js";

const config = yaml.load(readFileSync("src/admin/config.yml", "utf8"));
const collection = (name) => config.collections.find((c) => c.name === name);
const fieldNames = (fields) => fields.map((f) => f.name);

// Существуют ли папки содержимого, здесь не проверяем: git не хранит пустых,
// и если в админке удалить, скажем, все серии, папка пропадёт, а публикация
// не должна из-за этого вставать. Что админка пишет туда же, откуда читает сайт,
// проверяет tests/build.test.js: он кладёт образцы в папки из этого конфига.

test("admin page loads Sveltia CMS and is hidden from search engines", () => {
  const html = readFileSync("src/admin/index.html", "utf8");
  assert.match(html, /<script src="https:\/\/unpkg\.com\/@sveltia\/cms\/dist\/sveltia-cms\.js"><\/script>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test("backend is GitHub with a repo in owner/name form", () => {
  assert.equal(config.backend.name, "github");
  assert.match(config.backend.repo, /^[^/\s]+\/[^/\s]+$/);
  assert.equal(config.backend.branch, "main");
});

test("uploads are converted to WebP", () => {
  assert.equal(config.public_folder, "/uploads");
  const t = config.media_libraries.default.config.transformations.raster_image;
  assert.equal(t.format, "webp");
  assert.ok(t.width <= 2400 && t.height <= 2400);
});

test("paintings collection declares every field the site reads", () => {
  const names = fieldNames(collection("paintings").fields);
  for (const f of ["title", "image", "photos", "price", "status", "series", "technique", "size", "year", "description", "order", "date", "draft"]) {
    assert.ok(names.includes(f), `field ${f} is missing`);
  }
});

test("painting slugs are ASCII-only ids (titles are in Cyrillic)", () => {
  assert.match(collection("paintings").slug, /uuid/);
  assert.match(collection("series").slug, /uuid/);
});

test("status options match the statuses known to the site", () => {
  const status = collection("paintings").fields.find((f) => f.name === "status");
  assert.deepEqual(status.options.map((o) => o.value), Object.keys(STATUSES));
  assert.equal(status.default, "available");
});

test("series relation targets the series collection", () => {
  const series = collection("paintings").fields.find((f) => f.name === "series");
  assert.equal(series.widget, "relation");
  assert.equal(series.collection, "series");
  assert.deepEqual(fieldNames(collection("series").fields).sort(), ["description", "order", "title"]);
});

// Каждое значение в JSON-файле должно редактироваться в админке, иначе
// админка может потерять его при сохранении.
function assertCovers(fields, data, where) {
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
  for (const [key, value] of Object.entries(data)) {
    const field = byName[key];
    assert.ok(field, `${where}.${key} is not editable in the admin`);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assert.equal(field.widget, "object", `${where}.${key} must be an object field`);
      assertCovers(field.fields, value, `${where}.${key}`);
    }
    if (Array.isArray(value) && value.length && typeof value[0] === "object") {
      assert.equal(field.widget, "list", `${where}.${key} must be a list field`);
      for (const item of value) assertCovers(field.fields, item, `${where}.${key}[]`);
    }
  }
}

test("settings files exist and every value in them is editable", () => {
  const pages = collection("pages");
  for (const [name, file] of [["site", "src/_data/site.json"], ["about", "src/_data/about.json"], ["theme", "src/_data/theme.json"]]) {
    const entry = pages.files.find((f) => f.name === name);
    assert.ok(entry, `file entry ${name} missing`);
    assert.equal(entry.file, file);
    assertCovers(entry.fields, JSON.parse(readFileSync(file, "utf8")), name);
  }
});

test("site settings expose the contact form", () => {
  const site = collection("pages").files.find((f) => f.name === "site");
  const form = site.fields.find((f) => f.name === "contact_form");
  assert.ok(form, "contact_form is missing");
  assert.equal(form.widget, "object");
  assert.deepEqual(fieldNames(form.fields).sort(), ["enabled", "endpoint", "fallback_email"]);
  assert.equal(form.fields.find((f) => f.name === "enabled").widget, "boolean");
});

test("privacy page is editable", () => {
  const entry = collection("pages").files.find((f) => f.name === "privacy");
  assert.ok(entry, "privacy file entry missing");
  assert.equal(entry.file, "src/_data/privacy.json");
  assert.deepEqual(fieldNames(entry.fields).sort(), ["heading", "text"]);
});

test("admin offers the theme settings", () => {
  const entry = collection("pages").files.find((f) => f.name === "theme");
  assert.ok(entry, "theme file entry missing");
  assert.equal(entry.file, "src/_data/theme.json");
  const field = (name) => entry.fields.find((f) => f.name === name);
  for (const name of ["background", "text"]) assert.equal(field(name)?.widget, "color", name);
  for (const name of ["heading_font", "body_font"]) {
    assert.equal(field(name)?.widget, "select", name);
    assert.deepEqual(field(name).options.map((o) => o.value), Object.keys(FONTS), name);
  }
  assert.deepEqual(field("size").options.map((o) => o.value), Object.keys(SIZES));
});
