// Копия сайта, которую можно открыть двойным щелчком по index.html — без сервера
// и интернета. Нужна, чтобы показать сайт до публикации.
//
//   npm run offline-copy   →   offline/site/  (откройте index.html)
//
// Обычная сборка ставит ссылки от корня сайта (/about/, /img/…), а с диска такие
// ссылки ведут в корень диска. Поэтому здесь они переписываются относительно
// каждой страницы, а шрифты встраиваются в стили: браузеры не дают странице,
// открытой с диска, подгружать шрифты отдельными файлами.
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Eleventy from "@11ty/eleventy";

const URL_ATTR = /\b(href|src|srcset|content)="([^"]*)"/g;
const FONT_PRELOAD = /[ \t]*<link rel="preload"[^>]*\bas="font"[^>]*>\n?/g;
const FONT_URL = /url\(["']?(\.\.\/fonts\/[^"')]+\.woff2)["']?\)/g;

/** «/about/#contacts» со страницы в папке «.» → «about/index.html#contacts». */
function relativeUrl(url, fromDir) {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const [, pathname, rest] = url.match(/^([^?#]*)(.*)$/);
  let target = pathname.slice(1);
  if (target === "" || target.endsWith("/")) target += "index.html";
  return path.posix.relative(fromDir, target) + rest;
}

/** Ссылки страницы `file` (путь внутри сайта, например «about/index.html») — относительно неё. */
export function relativizeHtml(html, file) {
  const dir = path.posix.dirname(file);
  return html.replace(FONT_PRELOAD, "").replace(URL_ATTR, (_, name, value) => {
    const next =
      name === "srcset"
        ? value
            .split(",")
            .map((part) => {
              const [url, ...descriptor] = part.trim().split(/\s+/);
              return [relativeUrl(url, dir), ...descriptor].join(" ");
            })
            .join(", ")
        : relativeUrl(value, dir);
    return `${name}="${next}"`;
  });
}

async function listFiles(dir, rel = "") {
  const out = [];
  for (const entry of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(dir, p)));
    else out.push(p);
  }
  return out;
}

/** Собирает сайт из `input` в `output` и переделывает его для просмотра с диска. */
export async function makeOfflineCopy({ input = "src", output = "offline/site" } = {}) {
  await rm(output, { recursive: true, force: true });
  const elev = new Eleventy(input, output, {
    quietMode: true,
    configPath: "eleventy.config.js",
    // Как у команды `eleventy --input=… --output=…`: переданные папки главнее dir из конфига
    source: "cli",
    config(cfg) {
      // Исходники могут лежать во временной папке в .cache (так делают тесты),
      // а Eleventy пропускает всё, что перечислено в .gitignore
      cfg.setUseGitIgnore(false);
      // Форма «Связаться с автором» видна, но ничего не отправляет
      cfg.addGlobalData("contactPreview", true);
    },
  });
  await elev.write();

  // Админке нужен GitHub — в копии для просмотра она бесполезна
  await rm(path.join(output, "admin"), { recursive: true, force: true });

  for (const file of await listFiles(output)) {
    if (!file.endsWith(".html")) continue;
    const full = path.join(output, file);
    await writeFile(full, relativizeHtml(await readFile(full, "utf8"), file));
  }

  // Шрифты — во все таблицы стилей (выбранные в «Оформлении» лежат в theme.css)
  const cssDir = path.join(output, "assets", "css");
  for (const name of await readdir(cssDir)) {
    if (!name.endsWith(".css")) continue;
    const cssFile = path.join(cssDir, name);
    let css = await readFile(cssFile, "utf8");
    for (const [whole, rel] of [...css.matchAll(FONT_URL)]) {
      const font = await readFile(path.join(cssDir, rel));
      css = css.replace(whole, `url("data:font/woff2;base64,${font.toString("base64")}")`);
    }
    await writeFile(cssFile, css);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = "offline/site";
  await makeOfflineCopy({ output });
  console.log(`Готово: ${output}/index.html — откройте двойным щелчком.`);
}
