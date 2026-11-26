// Сборочные тесты: собирают сайт через программный API Eleventy и проверяют
// получившийся HTML.
//
// Сайт собирается не из src как есть, а из образцовой копии (tests/helpers/fixture-site.js).
// Публикация запускает эти тесты перед каждой сборкой, так что правки в админке
// не должны их ломать.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Eleventy from "@11ty/eleventy";
import { FIXTURES, prepareFixtureSite } from "./helpers/fixture-site.js";

const NBSP = " ";
let inputDir;
let outDir;

async function build({ pathPrefix, site, about } = {}) {
  const elev = new Eleventy(inputDir, outDir, {
    quietMode: true,
    configPath: "eleventy.config.js",
    // Как у команды `eleventy --input=…`: переданная папка главнее, чем
    // dir.input из eleventy.config.js (иначе Eleventy молча соберёт src).
    source: "cli",
    pathPrefix,
    config(cfg) {
      // Копия лежит в .cache, а Eleventy пропускает всё, что в .gitignore
      cfg.setUseGitIgnore(false);
      if (site) cfg.addGlobalData("site", site);
      if (about) cfg.addGlobalData("about", about);
    },
  });
  const pages = await elev.toJSON();
  return Object.fromEntries(pages.map((p) => [p.url, p.content]));
}

const count = (html, re) => (html.match(re) || []).length;

function card(html, id) {
  const start = html.indexOf(`id="w-${id}"`);
  assert.ok(start > -1, `card ${id} not found`);
  const end = html.indexOf("</article>", start);
  return html.slice(start, end);
}

let site;
let pages;

before(async () => {
  inputDir = await prepareFixtureSite();
  outDir = await mkdtemp(path.join(os.tmpdir(), "art-site-test-"));
  site = JSON.parse(await readFile(`${FIXTURES}/site.json`, "utf8"));
  pages = await build();
});

after(async () => {
  await rm(inputDir, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
});

test("gallery shows every published painting and hides drafts", () => {
  const html = pages["/"];
  assert.equal(count(html, /<article class="card"/g), 8);
  assert.ok(!html.includes("Набросок"), "draft must not be rendered");
});

test("cards carry data attributes for the future cart", () => {
  const c = card(pages["/"], "utro-u-reki");
  assert.match(c, /data-id="utro-u-reki"/);
  assert.match(c, /data-title="Утро у реки"/);
  assert.match(c, /data-price="45000"/);
  assert.match(c, /data-status="available"/);
  assert.match(c, /data-series="water"/);
});

test("cards follow the price and status rules", () => {
  const html = pages["/"];
  assert.ok(card(html, "utro-u-reki").includes(`45${NBSP}000${NBSP}₽`));
  const sold = card(html, "kryshi");
  assert.ok(sold.includes("Продана"));
  assert.ok(!sold.includes(`24${NBSP}000`), "sold painting must hide its price");
  assert.ok(card(html, "tramvay").includes("Цена по запросу"));
  assert.ok(card(html, "pauza").includes("В частной коллекции"));
  const reserved = card(html, "otrazheniya");
  assert.ok(reserved.includes("Забронирована") && reserved.includes(`32${NBSP}000${NBSP}₽`));
});

test("paintings are sorted: manual order first, then newest", () => {
  const html = pages["/"];
  const ids = [...html.matchAll(/<article class="card"[^>]*data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids[0], "vecherniy-prospekt"); // order: 1
  assert.equal(ids[1], "utro-u-reki"); // newest without order
  assert.equal(ids.at(-1), "tramvay"); // oldest
});

test("filters list only series that have published works", () => {
  const html = pages["/"];
  assert.match(html, /data-filter="all"/);
  for (const id of ["water", "city", "silence"]) assert.match(html, new RegExp(`data-filter="${id}"`));
  assert.ok(!html.includes('data-filter="portraits"'));
  assert.ok(html.includes("Реки, заводи и отражения"), "series description is rendered");
});

test("images are responsive webp served from /img/", () => {
  const c = card(pages["/"], "utro-u-reki");
  assert.match(c, /srcset="\/img\/[^"]+\.webp \d+w/);
  assert.match(c, /width="\d+" height="\d+"/);
  assert.match(c, /<template class="card__details">[\s\S]*Утро у реки — фото 3/, "extra photos in details");
});

test("thumbnails show only when a painting has more than one photo", () => {
  const html = pages["/"];
  // «Утро у реки» — три фото, «Белый шум» — одно
  assert.match(card(html, "utro-u-reki"), /<ul class="details__photos">/);
  assert.match(card(html, "beliy-shum"), /<ul class="details__photos" hidden>/);
});

test("order button is absent while disabled", () => {
  const html = pages["/"];
  assert.equal(count(html, /class="btn-order"/g), 0);
  assert.ok(!html.includes("t.me/"));
});

test("order button links to Telegram when enabled, only for available works", async () => {
  const enabled = { ...site, order_button: { ...site.order_button, enabled: true, telegram: "@test_artist" } };
  const html = (await build({ site: enabled }))["/"];
  // 5 доступных: утро, заводь, проспект, трамвай, белый шум
  assert.equal(count(html, /class="btn-order"/g), 5);
  const expected = `https://t.me/test_artist?text=${encodeURIComponent("Здравствуйте! Хочу купить картину «Утро у реки»")}`;
  assert.ok(card(html, "utro-u-reki").includes(expected));
  assert.ok(!card(html, "kryshi").includes("btn-order"));
  assert.ok(!card(html, "otrazheniya").includes("btn-order"));
});

test("about page renders bio, sections and only filled contacts", () => {
  const html = pages["/about/"];
  assert.ok(html.includes("<strong>Имя Фамилия</strong>"), "bio markdown rendered");
  assert.match(html, /<h2[^>]*>Выставки<\/h2>/);
  assert.match(html, /<li>2025 — «Свет и вода»/);
  assert.ok(html.includes('href="mailto:hello@example.com"'));
  assert.ok(html.includes('href="https://t.me/your_username"'));
  assert.ok(html.includes("Москва"));
  assert.ok(!html.includes("tel:"), "empty phone must not render");
  assert.ok(!html.includes("wa.me"), "empty whatsapp must not render");
  assert.ok(!html.includes("vk.com"), "empty vk must not render");
  assert.match(html, /<img[^>]+srcset="\/img\/[^"]+\.webp/, "author photo is processed");
});

test("footer links to contacts only when the about page has them", async () => {
  assert.match(pages["/"], /<a href="\/about\/#contacts">Контакты<\/a>/);

  const fixture = JSON.parse(await readFile(`${FIXTURES}/about.json`, "utf8"));
  const empty = { email: "", phone: "", telegram: "", whatsapp: "", instagram: "", vk: "", city: "" };
  const built = await build({ about: { ...fixture, contacts: empty, links: [] } });
  assert.ok(!built["/about/"].includes('id="contacts"'), "no contacts section");
  for (const url of ["/", "/about/"]) assert.ok(!built[url].includes("#contacts"), `no dead contacts link on ${url}`);
});

const contactOn = () => ({
  ...site,
  contact_form: { enabled: true, endpoint: "https://functions.yandexcloud.net/abc", fallback_email: "v.art@yandex.ru" },
});

test("privacy page is built from its settings", () => {
  const html = pages["/privacy/"];
  assert.ok(html, "no /privacy/ page");
  assert.ok(html.includes(">Политика обработки данных (образец)</h1>"), "heading from settings");
  assert.ok(html.includes("<strong>политики</strong>"), "markdown rendered");
});

test("footer links to the privacy page only when the contact form is on", async () => {
  assert.ok(!pages["/"].includes('href="/privacy/"'));
  const built = await build({ site: contactOn() });
  for (const url of ["/", "/about/"]) {
    const footer = built[url].slice(built[url].indexOf("<footer"));
    assert.ok(footer.includes('href="/privacy/"'), `footer of ${url} links to the policy`);
  }
});

test("contact form is absent while switched off", () => {
  assert.ok(!pages["/"].includes('class="contact"'));
});

test("contact form is rendered when configured", async () => {
  const html = (await build({ site: contactOn() }))["/"];
  for (const part of [
    'data-endpoint="https://functions.yandexcloud.net/abc"',
    'data-mail-user="v.art"',
    'data-mail-domain="yandex.ru"',
    ">Связаться с автором</button>",
    'name="name"',
    'name="contact"',
    'name="message"',
    'name="website"',
    'href="/privacy/"',
    "Спасибо! Имя Фамилия ответит вам по указанному контакту.",
  ]) {
    assert.ok(html.includes(part), part);
  }
});

test("the fallback address never appears whole", async () => {
  const built = await build({ site: contactOn() });
  for (const [url, html] of Object.entries(built)) assert.ok(!html.includes("v.art@yandex.ru"), url);
});

test("navigation marks the current page", () => {
  assert.match(pages["/"], /<a href="\/" aria-current="page">Работы<\/a>/);
  assert.match(pages["/about/"], /<a href="\/about\/" aria-current="page">Об авторе<\/a>/);
});

test("pages have SEO and Open Graph tags", () => {
  const html = pages["/"];
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<title>Имя Фамилия — Живопись и графика<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:image" content="[^"]+\.jpeg">/);
  assert.match(pages["/about/"], /<title>Об авторе — Имя Фамилия<\/title>/);
});

test("sitemap and robots are generated", () => {
  assert.ok(pages["/sitemap.xml"].includes("/about/</loc>"));
  assert.ok(pages["/robots.txt"].includes("Disallow: /admin/"));
});

test("path prefix for github.io/<repo>/ is applied to links, styles and images", async () => {
  const html = (await build({ pathPrefix: "/my-repo/" }))["/"];
  assert.match(html, /href="\/my-repo\/about\/"/);
  assert.match(html, /href="\/my-repo\/assets\/css\/style\.css"/);
  assert.match(html, /srcset="\/my-repo\/img\//);
  assert.match(html, /src="\/my-repo\/assets\/js\/gallery\.js"/);
  assert.ok(!/srcset="\/img\//.test(html), "no unprefixed image urls (including inside <template>)");
});
