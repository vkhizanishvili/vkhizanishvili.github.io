# Оформление сайта в админке — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Раздел «Оформление» в админке: цвет фона и текста, шрифт заголовков и текста (10 шрифтов на сайте), размер текста; сайт применяет их без программиста.

**Architecture:** `src/_data/theme.json` (правится в админке) → чистые функции `src/_lib/theme.js` нормализуют значения и строят CSS → шаблон `src/theme.css.njk` выдаёт `/assets/css/theme.css` (базовые переменные + `@font-face` только двух выбранных шрифтов), `style.css` выводит из них оттенки через `color-mix()`. Все файлы шрифтов копируются в `assets/fonts/`, скачиваются только выбранные.

**Tech Stack:** Eleventy 3, Nunjucks, CSS custom properties + `color-mix()`, Fontsource (npm), Sveltia CMS (`color`, `select`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-26-theme-settings-design.md`

**Git:** репозиторий есть (`main` → GitHub Pages). Коммит после каждой задачи; публикация (push) — в Task 5, после проверки.

## Global Constraints

- По умолчанию вид не меняется: фон `#ffffff`, текст `#1b1b1b`, Onest для заголовков и текста, размер `normal` (100 %).
- Шрифты — только из списка (id → название): `onest` Onest, `inter` Inter, `manrope` Manrope, `montserrat` Montserrat, `ibm-plex-sans` IBM Plex Sans, `raleway` Raleway, `pt-serif` PT Serif, `lora` Lora, `playfair-display` Playfair Display, `cormorant-garamond` Cormorant Garamond. Все на сайте, никаких запросов к Google.
- Размеры: `small` 93.75 %, `normal` 100 %, `large` 112.5 %, `xlarge` 125 % (от размера `html`).
- Контраст фона и текста < 3 : 1 → текст `#000000` или `#ffffff` (больший контраст с фоном) + `console.warn("[theme] …")` при сборке.
- Неизвестные/пустые значения → по умолчанию, без ошибки сборки.
- Посетитель скачивает только `@font-face` двух выбранных шрифтов (одного, если они совпадают).
- Тесты не зависят от `src/_data/theme.json` (образцы — в `tests/fixtures/site/theme.json`).
- Копия с диска (`npm run offline-copy`) по-прежнему работает: шрифты встроены, ссылки относительные.

## Review Focus

1. Тёмный фон (`#1d1d1f`) со светлым текстом: подложка под картинами, линии, приглушённый текст, кнопки, затемнение за окном и крестик читаются; нигде не остался белый. → ручная проверка в браузере (Task 5).
2. Одинаковые шрифты заголовков и текста → один `@font-face`-набор, без дублей. → тест `themeCss` (Task 1).
3. Админка сохраняет цвет в другом формате (`#FFF`, верхний регистр, с альфой `#ffffff80`) → нормализуется или откатывается к умолчанию, сайт не ломается. → тест `normalizeTheme` (Task 1).
4. PT Serif (не переменный, только 400/700): заголовки 500 — не «ложный жирный», а ближайший вес. → `@font-face` с весами 400 и 700, проверка глазами (Task 5).
5. `theme.json` отсутствует или битый (например, удалили файл) → сайт собирается с видом по умолчанию. → сборочный тест (Task 3).

---

### Task 1: Чистые функции оформления

**Files:**
- Create: `src/_lib/theme.js`
- Test: `tests/theme.test.js`

**Interfaces:**
- Produces:
  - `FONTS: Record<id, { label: string, family: string, serif: boolean, fallback: string, faces: Array<{ subset: "cyrillic"|"latin", weight: string, file: string }> }>` — `file` = имя в `assets/fonts/` (`<id>-<subset>.woff2` для переменных; `pt-serif-<subset>-400.woff2` / `-700`); `weight` = диапазон переменного шрифта (Onest/Inter/Montserrat/Raleway `100 900`, Manrope `200 800`, IBM Plex Sans `100 700`, Lora `400 700`, Playfair Display `400 900`, Cormorant Garamond `300 700`) или `400` / `700`.
  - `FONT_SOURCES: Array<{ from: string, to: string }>` — путь в `node_modules/@fontsource(-variable)/<pkg>/files/<pkg>-<subset>-wght-normal.woff2` (PT Serif: `-<subset>-400-normal.woff2`, `-700-normal.woff2`) → `assets/fonts/<file>`.
  - `SIZES = { small: "93.75%", normal: "100%", large: "112.5%", xlarge: "125%" }`, `DEFAULT_THEME = { background: "#ffffff", text: "#1b1b1b", heading_font: "onest", body_font: "onest", size: "normal" }`.
  - `contrastRatio(a: "#rrggbb", b: "#rrggbb") -> number` (WCAG).
  - `normalizeTheme(raw) -> { background, text, headingFont, bodyFont, size, textAdjusted: boolean }` — цвета: `#rgb`/`#rrggbb` в любом регистре → `#rrggbb` строчными; `#rrggbbaa` и прочее → умолчание; шрифт/размер не из списка → умолчание; контраст < 3 → `text` = `#000000`/`#ffffff` (что контрастнее), `textAdjusted: true`.
  - `themeCss(theme /* результат normalizeTheme */) -> string` — `:root{--bg:…;--text:…;--font-body:"<family>", <fallback>;--font-heading:…;--base-size:…}` + `@font-face` (unicode-range кириллицы/латиницы как сейчас у Onest в `style.css`, `font-display: swap`, `src: url("../fonts/<file>") format("woff2")`) для каждого из выбранных шрифтов, без повторов.
  - `preloadFont(theme) -> string` — `/assets/fonts/<файл кириллицы шрифта текста>` (для PT Serif — 400).

- [ ] **Step 1: Write the failing tests**
  - `normalizeTheme keeps today's look by default` — `normalizeTheme({})` = `{ background: "#ffffff", text: "#1b1b1b", headingFont: "onest", bodyFont: "onest", size: "normal", textAdjusted: false }`; `normalizeTheme(undefined)` — то же.
  - `normalizeTheme accepts admin colour formats` — `"#FFF"` → `"#ffffff"`; `"#1D1D1F"` → `"#1d1d1f"`; `"#ffffff80"`, `"white"`, `""` → умолчание.
  - `normalizeTheme falls back for unknown fonts and sizes` — `heading_font: "comic-sans"` → `"onest"`; `size: "huge"` → `"normal"`.
  - `contrastRatio matches WCAG` — `("#ffffff","#000000")` = 21; `("#ffffff","#ffffff")` = 1; `("#ffffff","#1b1b1b")` ≈ 17.2 (до 0.1).
  - `normalizeTheme rescues unreadable text` — фон `#f5f5f5`, текст `#eeeeee` → `text: "#000000"`, `textAdjusted: true`; фон `#202020`, текст `#303030` → `"#ffffff"`.
  - `themeCss emits only the chosen fonts` — заголовки `playfair-display`, текст `inter`: есть `font-family: "Playfair Display"` и `"Inter"` в `@font-face`, нет `Onest`; `src: url("../fonts/inter-cyrillic.woff2")`; `--base-size: 112.5%` при `size: "large"`; `--bg: #1d1d1f`.
  - `themeCss does not repeat a font used twice` — оба `lora` → ровно 2 блока `@font-face` (кириллица + латиница).
  - `pt-serif has real 400 and 700 faces` — `themeCss` с `pt-serif`: 4 блока, веса `400` и `700`, файлы `pt-serif-cyrillic-400.woff2` … ; `preloadFont` → `/assets/fonts/pt-serif-cyrillic-400.woff2`.
  - `every font source exists in node_modules` — для каждого `FONT_SOURCES[i].from` файл существует (проверяет установку пакетов из Task 2; до неё этот тест падает — ожидаемо).
- [ ] **Step 2:** `node --test tests/theme.test.js` → FAIL (нет модуля).
- [ ] **Step 3:** реализовать `src/_lib/theme.js`.
- [ ] **Step 4:** → PASS всё, кроме `every font source exists` (ждёт Task 2); `npm test` иначе зелёный.

### Task 2: Шрифты в сайт

**Files:**
- Modify: `package.json` (dependencies: `@fontsource-variable/inter`, `manrope`, `montserrat`, `ibm-plex-sans`, `raleway`, `lora`, `playfair-display`, `cormorant-garamond`, `@fontsource/pt-serif`; Onest уже есть)
- Modify: `eleventy.config.js` — passthrough из `FONT_SOURCES` вместо двух строк Onest

**Interfaces:** Consumes `FONT_SOURCES` (Task 1).

- [ ] **Step 1:** `npm install` пакетов → `node --test tests/theme.test.js` → `every font source exists` PASS.
- [ ] **Step 2:** заменить passthrough; `npm run build` → в `_site/assets/fonts/` 20 + 2 файла (9 шрифтов × 2 + PT Serif × 4); `npm test` зелёный.

### Task 3: Оформление на сайте

**Files:**
- Create: `src/theme.css.njk` (`permalink: /assets/css/theme.css`, `eleventyExcludeFromCollections: true`, тело — фильтр `themeCss`)
- Create: `src/_data/theme.json` (= `DEFAULT_THEME`), `tests/fixtures/site/theme.json` (= `DEFAULT_THEME`); `tests/helpers/fixture-site.js` — подставлять образцовый `theme.json` (как `privacy.json`, путь — из файла `theme` в настройках админки)
- Modify: `eleventy.config.js` — фильтры `themeCss` (`(raw) => themeCss(normalizeTheme(raw))`, при `textAdjusted` один раз `console.warn("[theme] Цвет текста плохо читается на этом фоне — сайт использует …")`) и `themePreload`
- Modify: `src/_includes/layouts/base.njk` — после `style.css`: `<link rel="stylesheet" href="/assets/css/theme.css">`; предзагрузка шрифта → `{{ theme | themePreload }}`
- Modify: `src/assets/css/style.css` — убрать `@font-face` Onest; `body { font-family: var(--font-body) }`, заголовки (`h1, h2, h3`, `.site-title` / имя в шапке, `.intro__title`, `.card__title`, `.lightbox__title`, `.about h1`, `.privacy h1`) — `var(--font-heading)`; `html { font-size: var(--base-size, 100%) }`; в `:root` оставить значения по умолчанию (`--bg`, `--text`, `--font-body`, `--font-heading`) и вывести оттенки: `--muted: color-mix(in srgb, var(--text) 58%, var(--bg))`, `--line: color-mix(in srgb, var(--text) 11%, var(--bg))`, `--frame: color-mix(in srgb, var(--text) 4%, var(--bg))`, `--accent: var(--text)`, `--on-accent: var(--bg)`, `--backdrop: color-mix(in srgb, var(--bg) 96%, transparent)`, `--glass: color-mix(in srgb, var(--bg) 90%, transparent)`; все `color: #fff` на кнопках → `var(--on-accent)`, `rgba(255,255,255,0.96)` → `var(--backdrop)`, `rgba(255,255,255,0.9)` → `var(--glass)`.
- Test: `tests/build.test.js`

**Interfaces:** Consumes `normalizeTheme`, `themeCss`, `preloadFont` (Task 1).

- [ ] **Step 1: Write the failing tests**
  - `pages link the theme stylesheet after the main one` — в `/` и `/about/` `href="/assets/css/theme.css"` стоит после `href="/assets/css/style.css"`.
  - `default theme keeps today's look` — `pages["/assets/css/theme.css"]` содержит `--bg: #ffffff`, `--text: #1b1b1b`, `"Onest"`, `--base-size: 100%`; предзагрузка `/assets/fonts/onest-cyrillic.woff2`.
  - `admin theme reaches the stylesheet` — сборка с `theme = { background: "#1D1D1F", text: "#f2f2f2", heading_font: "playfair-display", body_font: "inter", size: "large" }` (через `addGlobalData("theme", …)` в `build`): в `theme.css` `--bg: #1d1d1f`, `Playfair Display`, `Inter`, нет `Onest`, `--base-size: 112.5%`; предзагрузка `/assets/fonts/inter-cyrillic.woff2`.
  - `a missing theme file falls back to defaults` — сборка с `theme = undefined`… (через `addGlobalData("theme", null)`) → `theme.css` как по умолчанию.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный.

### Task 4: Раздел «Оформление» в админке и копия с диска

**Files:**
- Modify: `src/admin/config.yml` — в `pages` файл `theme` («Оформление», `file: src/_data/theme.json`), поля: `background` («Цвет фона», `widget: color`, `allow_input: true`), `text` («Цвет текста», то же, подсказка про чёрный/белый при плохой читаемости), `heading_font` и `body_font` (`widget: select`, `options: [{label: "Onest", value: onest}, …, {label: "PT Serif (с засечками)", value: pt-serif}, …]`), `size` (`select`: «Мельче» small, «Обычный» normal, «Крупнее» large, «Ещё крупнее» xlarge); подсказка у файла: «Изменения появятся на сайте через 1–2 минуты после сохранения».
- Modify: `scripts/offline-copy.mjs` — встраивать шрифты во все `.css` в `assets/css/` (сейчас только `style.css`)
- Test: `tests/admin.test.js`, `tests/offline.test.js`

**Interfaces:** Consumes `FONTS`, `SIZES` (Task 1).

- [ ] **Step 1: Write the failing tests**
  - `admin offers the theme settings` — файл `theme` с `file: src/_data/theme.json`; поля `background`, `text` — `color`; значения `options` у `heading_font` и `body_font` = `Object.keys(FONTS)`; у `size` = `Object.keys(SIZES)`. (Существующий «every value is editable» должен покрывать и `theme.json` — добавить его в список проверяемых файлов.)
  - В `offline.test.js` заменить `fonts are inside the stylesheet…`: ни в одном `.css` копии нет `url("../fonts/`, в `theme.css` ровно 2 `data:font/woff2` (Onest кириллица+латиница), `style.css` без `@font-face`.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный.

### Task 5: Проверка и публикация

- [ ] **Step 1:** `npm test` → зелёный; `npm run build` без предупреждений `[theme]`.
- [ ] **Step 2:** временно (не коммитить) `src/_data/theme.json` = `{ background: "#1d1d1f", text: "#f2f2f2", heading_font: "pt-serif", body_font: "inter", size: "large" }`; в браузере 375 px и 1280 px: галерея, окно картины (подложка, крестик, затемнение, полоска), «Об авторе», политика, форма связи в предпросмотре — всё читается, белого не осталось (Review Focus 1, 4). WebKit (Playwright из рабочей папки): то же быстрым замером. Вернуть `theme.json`.
- [ ] **Step 3:** то же с текстом, почти неотличимым от фона (`#f5f5f5` / `#eeeeee`) → текст чёрный, при сборке `[theme]`-предупреждение. Вернуть.
- [ ] **Step 4:** `npm test` зелёный; коммит(ы); `git pull --rebase`; `git push`; дождаться сайта; открыть админку → «Оформление» видно с текущими значениями.
