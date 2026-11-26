import path from "node:path";
import { HtmlBasePlugin } from "@11ty/eleventy";
import Image from "@11ty/eleventy-img";
import markdownIt from "markdown-it";
import {
  sortPaintings,
  publishedPaintings,
  seriesWithWorks,
  priceInfo,
  metaLine,
  telegramOrderUrl,
  toPainting,
  toSeries,
} from "./src/_lib/paintings.js";
import { contactsList } from "./src/_lib/contacts.js";
import { contactFormConfig } from "./src/_lib/contact-form.js";
import { FONT_SOURCES } from "./src/_lib/theme.js";

const md = markdownIt({ html: false, linkify: true, typographer: true });

// Размеры, которые нарезаются из каждого загруженного фото (только WebP —
// его понимают все современные браузеры; так сайт занимает меньше места).
const WIDTHS = [600, 1200, 2000];

/** Обработка одного изображения: '/uploads/x.webp' → набор WebP разных размеров. */
async function processImage(src, inputDir, outputDir) {
  if (!src) return null;
  const input = path.join(inputDir, String(src).replace(/^\/+/, ""));
  try {
    const meta = await Image(input, {
      widths: WIDTHS,
      formats: ["webp"],
      outputDir: path.join(outputDir, "img"),
      urlPath: "/img/",
      sharpWebpOptions: { quality: 80 },
    });
    const list = meta.webp;
    const largest = list.at(-1);
    return {
      src: largest.url,
      thumb: list[0].url,
      mid: (list[1] ?? list[0]).url,
      srcset: list.map((i) => i.srcset).join(", "),
      width: largest.width,
      height: largest.height,
    };
  } catch (error) {
    console.warn(`[images] Не удалось обработать ${src}: ${error.message}`);
    return null;
  }
}

/** JPEG для превью ссылок (Open Graph): мессенджеры не всегда понимают WebP. */
async function ogImageUrl(src, inputDir, outputDir) {
  if (!src) return null;
  const input = path.join(inputDir, String(src).replace(/^\/+/, ""));
  try {
    const meta = await Image(input, {
      widths: [1200],
      formats: ["jpeg"],
      outputDir: path.join(outputDir, "img"),
      urlPath: "/img/",
    });
    return meta.jpeg[0].url;
  } catch (error) {
    console.warn(`[images] Не удалось сделать превью ${src}: ${error.message}`);
    return null;
  }
}

const escapeAttr = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export default function (eleventyConfig) {
  // Папки берём у Eleventy, а не пишем «src»: тесты собирают сайт из копии
  // с образцовым содержимым (см. tests/build.test.js).
  const inputDir = () => eleventyConfig.directories.input;
  const outputDir = () => eleventyConfig.directories.output;

  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  // Все шрифты из списка «Оформления» лежат на сайте; скачиваются только выбранные
  eleventyConfig.addPassthroughCopy(Object.fromEntries(FONT_SOURCES.map(({ from, to }) => [from, to])));

  // Картины: только опубликованные, отсортированные, с обработанными фото.
  eleventyConfig.addCollection("works", async (api) => {
    const items = api.getFilteredByGlob(`${inputDir()}content/paintings/*.md`).map(toPainting);
    const works = [];
    for (const work of sortPaintings(publishedPaintings(items))) {
      const images = (await Promise.all([work.image, ...work.photos].map((s) => processImage(s, inputDir(), outputDir()))));
      if (!images[0]) {
        console.warn(`[works] «${work.title}» пропущена: нет главного фото`);
        continue;
      }
      works.push({ ...work, images: images.filter(Boolean), priceInfo: priceInfo(work), meta: metaLine(work) });
    }
    return works;
  });

  eleventyConfig.addCollection("seriesList", (api) =>
    api.getFilteredByGlob(`${inputDir()}content/series/*.md`).map(toSeries),
  );

  eleventyConfig.addFilter("seriesWithWorks", seriesWithWorks);
  eleventyConfig.addFilter("orderUrl", telegramOrderUrl);
  eleventyConfig.addFilter("contactsList", contactsList);
  eleventyConfig.addFilter("contactForm", contactFormConfig);
  eleventyConfig.addFilter("markdown", (text) => md.render(String(text ?? "")));
  // baseUrl — вычисляемое значение из src/_data/eleventyComputed.js
  eleventyConfig.addFilter("absoluteUrl", (url, base) => (base ? `${base}${url}` : url));

  // Одиночное изображение (фото автора и т. п.)
  eleventyConfig.addAsyncShortcode("image", async (src, alt, sizes = "100vw", cls = "") => {
    const img = await processImage(src, inputDir(), outputDir());
    if (!img) return "";
    return `<img${cls ? ` class="${escapeAttr(cls)}"` : ""} src="${img.mid}" srcset="${img.srcset}" sizes="${escapeAttr(sizes)}" width="${img.width}" height="${img.height}" alt="${escapeAttr(alt)}" decoding="async">`;
  });

  // Абсолютный адрес картинки для превью ссылок
  eleventyConfig.addAsyncShortcode("ogImage", async (src, base) => {
    const url = await ogImageUrl(src, inputDir(), outputDir());
    if (!url) return "";
    return base ? `${base}${url}` : url;
  });

  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "md"],
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
