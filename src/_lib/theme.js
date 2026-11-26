// Оформление сайта из админки (src/_data/theme.json): цвета, шрифты, размер.
// Чистые функции: проверить значения, не дать сделать текст нечитаемым,
// построить CSS — переменные и @font-face только выбранных шрифтов.

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

const RANGES = {
  cyrillic: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  latin:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD, U+20BD",
};
const SUBSETS = ["cyrillic", "latin"];

/** Переменный шрифт Fontsource: один файл на подмножество, диапазон насыщенности. */
const variable = (id, label, family, serif, weight) => ({
  label,
  family,
  serif,
  fallback: serif ? SERIF : SANS,
  pkg: `@fontsource-variable/${id}`,
  faces: SUBSETS.map((subset) => ({ subset, weight, file: `${id}-${subset}.woff2`, source: `${id}-${subset}-wght-normal.woff2` })),
});

/** Список шрифтов в админке (id → описание). Порядок = порядок в списке. */
export const FONTS = {
  onest: variable("onest", "Onest", "Onest", false, "100 900"),
  inter: variable("inter", "Inter", "Inter", false, "100 900"),
  manrope: variable("manrope", "Manrope", "Manrope", false, "200 800"),
  montserrat: variable("montserrat", "Montserrat", "Montserrat", false, "100 900"),
  "ibm-plex-sans": variable("ibm-plex-sans", "IBM Plex Sans", "IBM Plex Sans", false, "100 700"),
  raleway: variable("raleway", "Raleway", "Raleway", false, "100 900"),
  // PT Serif не переменный: настоящие начертания 400 и 700
  "pt-serif": {
    label: "PT Serif",
    family: "PT Serif",
    serif: true,
    fallback: SERIF,
    pkg: "@fontsource/pt-serif",
    faces: SUBSETS.flatMap((subset) =>
      ["400", "700"].map((weight) => ({ subset, weight, file: `pt-serif-${subset}-${weight}.woff2`, source: `pt-serif-${subset}-${weight}-normal.woff2` })),
    ),
  },
  lora: variable("lora", "Lora", "Lora", true, "400 700"),
  "playfair-display": variable("playfair-display", "Playfair Display", "Playfair Display", true, "400 900"),
  "cormorant-garamond": variable("cormorant-garamond", "Cormorant Garamond", "Cormorant Garamond", true, "300 700"),
};

/** Откуда копировать файлы шрифтов в сайт (assets/fonts). */
export const FONT_SOURCES = Object.values(FONTS).flatMap((font) =>
  font.faces.map((face) => ({ from: `node_modules/${font.pkg}/files/${face.source}`, to: `assets/fonts/${face.file}` })),
);

export const SIZES = { small: "93.75%", normal: "100%", large: "112.5%", xlarge: "125%" };

export const DEFAULT_THEME = { background: "#ffffff", text: "#1b1b1b", heading_font: "onest", body_font: "onest", size: "normal" };

// Ниже этого контраста текст считаем нечитаемым и заменяем на чёрный или белый
const MIN_CONTRAST = 3;

function normalizeColor(value, fallback) {
  const m = typeof value === "string" && value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  const hex = m[1].toLowerCase();
  return `#${hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex}`;
}

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Контраст двух цветов #rrggbb по WCAG (1…21), с точностью до сотых. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Значения из админки → проверенное оформление; нечитаемый текст → чёрный/белый. */
export function normalizeTheme(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const background = normalizeColor(t.background, DEFAULT_THEME.background);
  let text = normalizeColor(t.text, DEFAULT_THEME.text);
  let textAdjusted = false;
  if (contrastRatio(background, text) < MIN_CONTRAST) {
    text = contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff") ? "#000000" : "#ffffff";
    textAdjusted = true;
  }
  const font = (id) => (Object.hasOwn(FONTS, id) ? id : DEFAULT_THEME.heading_font);
  return {
    background,
    text,
    headingFont: font(t.heading_font),
    bodyFont: font(t.body_font),
    size: Object.hasOwn(SIZES, t.size) ? t.size : DEFAULT_THEME.size,
    textAdjusted,
  };
}

const stack = (id) => `"${FONTS[id].family}", ${FONTS[id].fallback}`;

/**
 * CSS оформления: переменные и @font-face выбранных шрифтов (без повторов).
 * При цветах по умолчанию оттенки не переопределяются — остаётся подобранная
 * вручную тёплая палитра из style.css; при других — считаются из фона и текста.
 */
export function themeCss(theme) {
  const defaultColors = theme.background === DEFAULT_THEME.background && theme.text === DEFAULT_THEME.text;
  const shades = defaultColors
    ? []
    : [
        "  --muted: color-mix(in srgb, var(--text) 58%, var(--bg));",
        "  --line: color-mix(in srgb, var(--text) 11%, var(--bg));",
        "  --frame: color-mix(in srgb, var(--text) 4%, var(--bg));",
      ];
  const root = [
    ":root {",
    `  --bg: ${theme.background};`,
    `  --text: ${theme.text};`,
    ...shades,
    `  --font-body: ${stack(theme.bodyFont)};`,
    `  --font-heading: ${stack(theme.headingFont)};`,
    `  --base-size: ${SIZES[theme.size]};`,
    "}",
  ];
  const faces = [...new Set([theme.headingFont, theme.bodyFont])].flatMap((id) =>
    FONTS[id].faces.map((face) =>
      [
        "@font-face {",
        `  font-family: "${FONTS[id].family}";`,
        "  font-style: normal;",
        "  font-display: swap;",
        `  font-weight: ${face.weight};`,
        `  src: url("../fonts/${face.file}") format("woff2");`,
        `  unicode-range: ${RANGES[face.subset]};`,
        "}",
      ].join("\n"),
    ),
  );
  return [root.join("\n"), ...faces].join("\n") + "\n";
}

/** Файл для предзагрузки: кириллица шрифта текста (у PT Serif — обычное начертание). */
export function preloadFont(theme) {
  const face = FONTS[theme.bodyFont].faces.find((f) => f.subset === "cyrillic");
  return `/assets/fonts/${face.file}`;
}
