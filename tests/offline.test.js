// Копия сайта для просмотра с диска (npm run offline-copy): открывается двойным
// щелчком по index.html, без сервера и интернета.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { relativizeHtml, makeOfflineCopy } from "../scripts/offline-copy.mjs";
import { prepareFixtureSite, tempDir } from "./helpers/fixture-site.js";

test("links from the home page point next to it", () => {
  const cases = [
    ['<a href="/">', '<a href="index.html">'],
    ['<a href="/about/">', '<a href="about/index.html">'],
    ['<a href="/about/#contacts">', '<a href="about/index.html#contacts">'],
    ['<link rel="stylesheet" href="/assets/css/style.css">', '<link rel="stylesheet" href="assets/css/style.css">'],
    [
      '<img src="/img/a-600.webp" srcset="/img/a-600.webp 600w, /img/a-1200.webp 1200w">',
      '<img src="img/a-600.webp" srcset="img/a-600.webp 600w, img/a-1200.webp 1200w">',
    ],
    ['<meta property="og:image" content="/img/og.jpeg">', '<meta property="og:image" content="img/og.jpeg">'],
  ];
  for (const [input, want] of cases) assert.equal(relativizeHtml(input, "index.html"), want);
});

test("links from a nested page climb back up", () => {
  const cases = [
    ['<a href="/">', '<a href="../index.html">'],
    ['<a href="/about/">', '<a href="index.html">'],
    ['<script src="/assets/js/gallery.js" defer></script>', '<script src="../assets/js/gallery.js" defer></script>'],
    ['<img srcset="/img/p-600.webp 600w">', '<img srcset="../img/p-600.webp 600w">'],
  ];
  for (const [input, want] of cases) assert.equal(relativizeHtml(input, "about/index.html"), want);
});

test("external links, anchors and non-path values stay as they are", () => {
  const html =
    '<a href="https://t.me/x?text=a%20b">t</a><a href="#w-utro">w</a>' +
    '<script src="//cdn.example.com/x.js"></script><meta name="viewport" content="width=device-width">' +
    '<a href="mailto:a@b.ru">m</a>';
  assert.equal(relativizeHtml(html, "about/index.html"), html);
});

test("the font preload is dropped (fonts are inlined into the stylesheet)", () => {
  const html = '<head>\n  <link rel="preload" href="/assets/fonts/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>\n  <title>x</title>';
  assert.equal(relativizeHtml(html, "index.html"), "<head>\n  <title>x</title>");
});

let input;
let output;

before(async () => {
  input = await prepareFixtureSite();
  output = await tempDir("test-offline");
  await makeOfflineCopy({ input, output });
});

after(async () => {
  await rm(input, { recursive: true, force: true });
  await rm(output, { recursive: true, force: true });
});

async function htmlFiles(dir, rel = "") {
  const out = [];
  for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await htmlFiles(dir, p)));
    else if (p.endsWith(".html")) out.push(p);
  }
  return out;
}

function urlsIn(html) {
  const urls = [];
  for (const [, name, value] of html.matchAll(/\b(href|src|srcset|content)="([^"]*)"/g)) {
    if (name === "srcset") urls.push(...value.split(",").map((part) => part.trim().split(/\s+/)[0]));
    else if (name !== "content" || value.includes("/")) urls.push(value);
  }
  return urls;
}

test("the copy has both pages, the gallery, and no admin", async () => {
  assert.ok(existsSync(path.join(output, "index.html")));
  assert.ok(existsSync(path.join(output, "about", "index.html")));
  assert.ok(!existsSync(path.join(output, "admin")), "the admin needs GitHub and makes no sense offline");
  const home = await readFile(path.join(output, "index.html"), "utf8");
  assert.equal((home.match(/<article class="card"/g) || []).length, 8, "built from the given content");
});

test("no page links from the root of the disk", async () => {
  for (const file of await htmlFiles(output)) {
    const html = await readFile(path.join(output, file), "utf8");
    const rooted = urlsIn(html).filter((u) => u.startsWith("/") && !u.startsWith("//"));
    assert.deepEqual(rooted, [], `${file} still has root-based links`);
  }
});

test("every local link and image points to a file in the copy", async () => {
  const files = await htmlFiles(output);
  assert.ok(files.length >= 2);
  for (const file of files) {
    const html = await readFile(path.join(output, file), "utf8");
    for (const url of urlsIn(html)) {
      if (/^([a-z]+:|#|\/\/)/i.test(url)) continue;
      const target = path.join(output, path.dirname(file), url.replace(/[?#].*$/, ""));
      assert.ok(existsSync(target) && statSync(target).isFile(), `${file}: ${url} → no such file`);
    }
  }
});

test("the copy shows the contact form in preview mode", async () => {
  const home = await readFile(path.join(output, "index.html"), "utf8");
  const block = home.match(/<div class="contact"[^>]*>/)?.[0];
  assert.ok(block, "contact form block is in the copy");
  assert.ok(/\sdata-preview(\s|>)/.test(block), "preview mode is on");
  assert.ok(!block.includes('data-endpoint="https'), "no real endpoint in the copy");
});

test("fonts are inside the stylesheets, so the browser loads them from disk", async () => {
  const dir = path.join(output, "assets", "css");
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".css")) continue;
    const css = await readFile(path.join(dir, name), "utf8");
    assert.ok(!/url\(["']?\.\.\/fonts\//.test(css), name + ": font files must not be referenced by path");
  }
  const theme = await readFile(path.join(dir, "theme.css"), "utf8");
  assert.equal((theme.match(/url\("data:font\/woff2;base64,[A-Za-z0-9+/=]+"\)/g) || []).length, 2, "Onest: cyrillic + latin");
  assert.ok(!/@font-face\s*\{/.test(await readFile(path.join(dir, "style.css"), "utf8")), "no @font-face rule left in style.css");
});
