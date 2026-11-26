// Образцовый сайт для тестов: копия src, где всё, что правится в админке
// (картины, серии, настройки, страница «Об авторе», фото), заменено данными
// из tests/fixtures/site. Так тесты не зависят от того, что поменяют в админке.
// Папки берутся из настроек админки: если админка и сайт разойдутся в том,
// где лежит содержимое, тесты это заметят.
import { cp, mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import yaml from "js-yaml";

// Без кэша sharp не держит фото открытыми, и Windows даёт удалить временную копию
sharp.cache(false);

export const FIXTURES = "tests/fixtures/site";

/**
 * Временная папка внутри проекта (в .cache, он не попадает в git): Eleventy не
 * понимает абсолютные пути на другом диске Windows. Удалять — вызывающему.
 */
export async function tempDir(prefix) {
  await mkdir(".cache", { recursive: true });
  return mkdtemp(`.cache/${prefix}-`);
}

/** Собирает копию src с образцовым содержимым и возвращает путь к ней. */
export async function prepareFixtureSite() {
  const input = await tempDir("test-src");
  const cms = yaml.load(await readFile("src/admin/config.yml", "utf8"));
  const inSrc = (p) => p.replace(/^\/?src\//, ""); // "src/content/paintings" → "content/paintings"
  const collection = (name) => cms.collections.find((c) => c.name === name);
  const folder = (name) => inSrc(collection(name).folder);
  const file = (name) => inSrc(collection("pages").files.find((f) => f.name === name).file);
  const media = inSrc(cms.media_folder);

  // Не копируем ни то, что пишет админка, ни то, что читает сайт: если они
  // разойдутся, в копии не окажется настоящего содержимого, которое скрыло бы ошибку.
  const siteReads = ["content/paintings", "content/series", "_data/site.json", "_data/about.json", "_data/privacy.json", "_data/theme.json", "uploads"];
  const skip = new Set([...siteReads, folder("paintings"), folder("series"), file("site"), file("about"), file("privacy"), file("theme"), media]);
  await cp("src", input, {
    recursive: true,
    filter: (from) => !skip.has(path.relative("src", from).split(path.sep).join("/")),
  });
  await cp(`${FIXTURES}/paintings`, path.join(input, folder("paintings")), { recursive: true });
  await cp(`${FIXTURES}/series`, path.join(input, folder("series")), { recursive: true });
  await cp(`${FIXTURES}/site.json`, path.join(input, file("site")));
  await cp(`${FIXTURES}/about.json`, path.join(input, file("about")));
  await cp(`${FIXTURES}/privacy.json`, path.join(input, file("privacy")));
  await cp(`${FIXTURES}/theme.json`, path.join(input, file("theme")));

  // Каждое фото, на которое ссылаются образцовые данные, кладём туда, куда его
  // положила бы админка (media_folder), а ссылка на него — как в админке (public_folder).
  const texts = [];
  for (const sub of ["paintings", "series"]) {
    for (const name of await readdir(`${FIXTURES}/${sub}`)) texts.push(await readFile(`${FIXTURES}/${sub}/${name}`, "utf8"));
  }
  texts.push(await readFile(`${FIXTURES}/site.json`, "utf8"), await readFile(`${FIXTURES}/about.json`, "utf8"));
  const refs = new Set(texts.join("\n").match(new RegExp(`${cms.public_folder}/[\\w/-]+\\.webp`, "g")));
  for (const ref of refs) {
    const target = path.join(input, media, ref.slice(cms.public_folder.length));
    await mkdir(path.dirname(target), { recursive: true });
    await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#b8a48c" } }).webp().toFile(target);
  }
  return input;
}
