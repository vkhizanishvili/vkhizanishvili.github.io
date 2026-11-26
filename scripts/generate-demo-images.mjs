// Генерирует абстрактные демо-«картины» для наполнения сайта до появления настоящих фото.
// Запуск: npm run demo-images. Результат: src/uploads/demo/*.webp
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "src", "uploads", "demo");

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const texture = (seed) => `
  <filter id="paper" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}" result="n"/>
    <feColorMatrix type="saturate" values="0" in="n" result="g"/>
    <feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope="0.10"/></feComponentTransfer>
    <feBlend in="SourceGraphic" in2="g2" mode="multiply"/>
  </filter>
  <filter id="wobble">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="${seed + 7}" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="60" xChannelSelector="R" yChannelSelector="G"/>
    <feGaussianBlur stdDeviation="1.2"/>
  </filter>
  <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>`;

// Цветовые поля (горизонтальные полосы с мягкими краями)
function colorField({ w, h, seed, palette }) {
  const r = rng(seed);
  let y = h * 0.06;
  const bands = [];
  const count = 2 + Math.floor(r() * 2);
  for (let i = 0; i < count; i++) {
    const bh = (h * 0.88) / count - h * 0.03;
    bands.push(
      `<rect x="${w * 0.07}" y="${y}" width="${w * 0.86}" height="${bh}" rx="18" fill="${palette[1 + (i % (palette.length - 1))]}" opacity="0.92" filter="url(#wobble)"/>`,
    );
    y += bh + h * 0.03;
  }
  return `<rect width="100%" height="100%" fill="${palette[0]}"/>${bands.join("")}`;
}

// Круги и пятна
function circles({ w, h, seed, palette }) {
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < 7; i++) {
    const rad = Math.min(w, h) * (0.08 + r() * 0.22);
    items.push(
      `<circle cx="${r() * w}" cy="${r() * h}" r="${rad}" fill="${palette[1 + Math.floor(r() * (palette.length - 1))]}" opacity="${0.55 + r() * 0.4}" filter="url(#wobble)"/>`,
    );
  }
  return `<rect width="100%" height="100%" fill="${palette[0]}"/>${items.join("")}`;
}

// Мазки-линии
function strokes({ w, h, seed, palette }) {
  const r = rng(seed);
  const items = [];
  for (let i = 0; i < 26; i++) {
    const x1 = r() * w;
    const y1 = r() * h;
    const len = Math.min(w, h) * (0.2 + r() * 0.5);
    const a = (r() - 0.5) * 1.2;
    items.push(
      `<line x1="${x1}" y1="${y1}" x2="${x1 + Math.cos(a) * len}" y2="${y1 + Math.sin(a) * len}" stroke="${palette[1 + Math.floor(r() * (palette.length - 1))]}" stroke-width="${10 + r() * 46}" stroke-linecap="round" opacity="${0.5 + r() * 0.45}" filter="url(#wobble)"/>`,
    );
  }
  return `<rect width="100%" height="100%" fill="${palette[0]}"/>${items.join("")}`;
}

// Пейзаж: небо, горизонт, вода
function landscape({ w, h, seed, palette }) {
  const r = rng(seed);
  const horizon = h * (0.45 + r() * 0.15);
  return `
    <rect width="100%" height="100%" fill="${palette[0]}"/>
    <ellipse cx="${w * (0.25 + r() * 0.5)}" cy="${horizon * 0.45}" rx="${w * 0.5}" ry="${h * 0.18}" fill="${palette[1]}" opacity="0.7" filter="url(#soft)"/>
    <rect x="-40" y="${horizon}" width="${w + 80}" height="${h - horizon + 40}" fill="${palette[2]}" filter="url(#wobble)"/>
    <rect x="-40" y="${horizon - h * 0.04}" width="${w + 80}" height="${h * 0.07}" fill="${palette[3]}" opacity="0.85" filter="url(#wobble)"/>
    <ellipse cx="${w * 0.5}" cy="${horizon + (h - horizon) * 0.5}" rx="${w * 0.3}" ry="${h * 0.05}" fill="${palette[4] ?? palette[1]}" opacity="0.5" filter="url(#soft)"/>`;
}

// Город: прямоугольники-дома
function city({ w, h, seed, palette }) {
  const r = rng(seed);
  const items = [];
  let x = -20;
  while (x < w) {
    const bw = w * (0.08 + r() * 0.14);
    const bh = h * (0.25 + r() * 0.5);
    items.push(
      `<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh + 40}" fill="${palette[1 + Math.floor(r() * (palette.length - 1))]}" opacity="0.9" filter="url(#wobble)"/>`,
    );
    x += bw * (0.75 + r() * 0.3);
  }
  return `<rect width="100%" height="100%" fill="${palette[0]}"/>${items.join("")}`;
}

function svgDoc(w, h, seed, body) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>${texture(seed)}</defs>
      <g filter="url(#paper)">${body}</g>
    </svg>`,
  );
}

const works = [
  { file: "utro-u-reki", w: 2000, h: 1500, seed: 11, fn: landscape, palette: ["#f1e3c8", "#f6b98a", "#6f8fa3", "#3e5a6b", "#f4d6b0"] },
  { file: "tihaya-zavod", w: 1500, h: 2100, seed: 23, fn: landscape, palette: ["#dfe6df", "#b9cbb8", "#5d7d6e", "#2f4a44", "#e9efe4"] },
  { file: "otrazheniya", w: 1800, h: 1800, seed: 37, fn: circles, palette: ["#e8eef2", "#2f5d7c", "#7fa7c0", "#c9d9e3", "#e3b04b"] },
  { file: "vecherniy-prospekt", w: 1600, h: 2000, seed: 41, fn: city, palette: ["#2b2d42", "#ef8354", "#8d99ae", "#4f5d75", "#f7c59f"] },
  { file: "kryshi", w: 2000, h: 1500, seed: 53, fn: city, palette: ["#efe6dd", "#9e2a2b", "#d9a17a", "#5c4742", "#c8b6a6"] },
  { file: "tramvay", w: 1500, h: 2100, seed: 67, fn: strokes, palette: ["#f4efe6", "#d1495b", "#00798c", "#edae49", "#30638e"] },
  { file: "beliy-shum", w: 1800, h: 1800, seed: 71, fn: colorField, palette: ["#efece6", "#d8d2c6", "#c4bcae", "#e5e0d6"] },
  { file: "pauza", w: 1800, h: 1800, seed: 83, fn: colorField, palette: ["#2e2a24", "#a44a3f", "#d4a373", "#6b4f3a"] },
  { file: "nabrosok", w: 1600, h: 2000, seed: 97, fn: strokes, palette: ["#faf7f2", "#222222", "#555555", "#999999"] },
];

async function render(work) {
  const { w, h, seed, fn, palette } = work;
  return sharp(svgDoc(w, h, seed, fn({ w, h, seed, palette }))).png().toBuffer();
}

// Фото «деталь»: увеличенный фрагмент
async function detail(png, w, h) {
  const size = Math.round(Math.min(w, h) * 0.45);
  return sharp(png)
    .extract({ left: Math.round(w * 0.3), top: Math.round(h * 0.3), width: size, height: size })
    .resize(1600, 1600)
    .webp({ quality: 82 })
    .toBuffer();
}

// Фото «в интерьере»: картина на светлой стене
async function interior(png, w, h) {
  const W = 2000;
  const H = 1500;
  const pw = Math.round(w >= h ? 760 : 520);
  const ph = Math.round((pw * h) / w);
  const left = Math.round((W - pw) / 2);
  const top = Math.round(H * 0.42 - ph / 2);
  const wall = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f1ec"/><stop offset="1" stop-color="#e4e0d8"/></linearGradient>
    <filter id="s"><feGaussianBlur stdDeviation="18"/></filter></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect x="0" y="${H * 0.82}" width="${W}" height="${H * 0.18}" fill="#c9b8a0"/>
    <rect x="0" y="${H * 0.82}" width="${W}" height="6" fill="#b3a189"/>
    <rect x="${left + 14}" y="${top + 22}" width="${pw}" height="${ph}" fill="#000" opacity="0.22" filter="url(#s)"/>
  </svg>`);
  const art = await sharp(png).resize(pw, ph).toBuffer();
  return sharp(wall)
    .composite([{ input: art, left, top }])
    .webp({ quality: 82 })
    .toBuffer();
}

function portrait() {
  const w = 1400;
  const h = 1750;
  return sharp(
    svgDoc(
      w,
      h,
      5,
      `<rect width="100%" height="100%" fill="#e9e4dc"/>
       <ellipse cx="${w / 2}" cy="${h * 0.38}" rx="${w * 0.17}" ry="${h * 0.14}" fill="#b9a99a" filter="url(#wobble)"/>
       <path d="M ${w * 0.18} ${h} C ${w * 0.22} ${h * 0.62}, ${w * 0.78} ${h * 0.62}, ${w * 0.82} ${h} Z" fill="#8f7f73" filter="url(#wobble)"/>`,
    ),
  )
    .webp({ quality: 82 })
    .toBuffer();
}

await mkdir(outDir, { recursive: true });
for (const work of works) {
  const png = await render(work);
  await sharp(png).webp({ quality: 82 }).toFile(path.join(outDir, `${work.file}.webp`));
  if (work.file === "utro-u-reki" || work.file === "vecherniy-prospekt") {
    await sharp(await detail(png, work.w, work.h)).toFile(path.join(outDir, `${work.file}-detal.webp`));
    await sharp(await interior(png, work.w, work.h)).toFile(path.join(outDir, `${work.file}-interer.webp`));
  }
  console.log("✓", work.file);
}
await sharp(await portrait()).toFile(path.join(outDir, "portret.webp"));
console.log("✓ portret");
