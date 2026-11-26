# Полоска картины в окне на телефоне — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На экранах уже 960 px окно картины прокручивается целиком; фото при прокрутке уменьшается (картина целиком) до полоски 2 : 1 и остаётся вверху.

**Architecture:** Блок с фото (`.lightbox__stage`) сохраняет постоянную высоту в потоке (`start`) и «прилипает» с отрицательным `top`, так что видимой остаётся нижняя часть высотой не меньше `strip`. Внутри — рамка `.lightbox__frame`, прижатая к низу блока, высотой ровно с видимую часть (CSS-переменная `--photo-visible`, её ставит скрипт по прокрутке), картина в ней вписывается целиком. Геометрия прокрутки при этом не меняется, рывков нет.

**Tech Stack:** Nunjucks, CSS, классический скрипт (без модулей — копия с диска), `node:test` + `node:vm`.

**Spec:** `docs/superpowers/specs/2026-11-25-popup-photo-strip-design.md`

**Git:** проекта в git нет — вместо коммитов контрольная точка «`npm test` зелёный».

## Global Constraints

- Только узкие экраны: `@media (max-width: 959px)`; на 960 px и шире окно выглядит и работает как сейчас.
- Полоска: ширина : высота = 2 : 1 (`strip = round(ширина окна / 2)`), но не выше стартовой высоты фото; старт — `round(0,55 × высота окна)`.
- Картина всегда целиком (`object-fit: contain`), без обрезки.
- Крестик закрытия всегда виден.
- Прокрутка, которую делает сайт сам (к форме, к результату отправки, наверх), — мгновенная (см. решение в журнале формы связи).
- Все существующие тесты остаются зелёными.

## Review Focus

1. Отскок прокрутки на iPhone (отрицательная прокрутка) — фото не должно становиться больше стартового. → тест `visiblePhotoHeight` с отрицательным значением (Task 1).
2. Телефон повёрнут горизонтально (ширина 812, высота 375) — «полоска» по ширине выше экрана; фото не должно вылезать за экран и не должно «сворачиваться» вверх. → тест `photoSizes` (Task 1).
3. Очень широкая картина (панорама) в полоске — видна целиком, крестик не мешает. → ручная проверка (Task 3).
4. Открыли другую картину, будучи внизу, — окно начинается сверху с большим фото. → ручная проверка (Task 3).
5. Форма связи: прокрутка к форме и к запасному пути внутри новой общей прокрутки по-прежнему показывает нужный блок. → ручная проверка (Task 3).

---

### Task 1: Расчёт высоты фото

**Files:**
- Create: `src/assets/js/photo-strip.js` (классический скрипт, IIFE; при отсутствии `#lightbox` только выставляет `window.PhotoStrip`)
- Test: `tests/photo-strip-script.test.js` (выполнение в `node:vm`, как `tests/contact-form-script.test.js`)

**Interfaces:**
- Produces: `window.PhotoStrip = { photoSizes, visiblePhotoHeight }`
  - `photoSizes(width: number, height: number) -> { start: number, strip: number }` — `start = round(0.55 × height)`, `strip = min(round(width / 2), start)`.
  - `visiblePhotoHeight(scrollTop: number, { start, strip }) -> number` — `max(strip, start − max(0, scrollTop))`.

- [ ] **Step 1: Write the failing tests**
  - `photoSizes gives a 2:1 strip on a phone` — `(375, 812)` → `{ start: 447, strip: 188 }`.
  - `photoSizes never makes the strip taller than the start` — `(812, 375)` → `{ start: 206, strip: 206 }`.
  - `visiblePhotoHeight shrinks with scrolling down to the strip` — при `{ start: 447, strip: 188 }`: `0` → `447`; `100` → `347`; `259` → `188`; `5000` → `188`.
  - `visiblePhotoHeight ignores overscroll bounce` — `-60` → `447`.
- [ ] **Step 2:** `node --test tests/photo-strip-script.test.js` → FAIL (нет файла).
- [ ] **Step 3:** реализовать функции.
- [ ] **Step 4:** → PASS; `npm test` зелёный.

### Task 2: Одна прокрутка и полоска в окне

**Files:**
- Modify: `src/_includes/partials/lightbox.njk` — `<img class="lightbox__img">` обернуть в `<div class="lightbox__frame">`
- Modify: `src/assets/css/style.css` — раздел «Крупный просмотр»: на ≥ 960 px `.lightbox__frame` ведёт себя как прежний центр блока (заполняет блок, центрирует картину); на < 960 px: `.lightbox__layout { display: block; overflow-y: auto; overscroll-behavior: contain }`, `.lightbox__stage { position: sticky; top: calc(var(--photo-strip) - var(--photo-start)); height: var(--photo-start); z-index: 1 }`, `.lightbox__frame { position: absolute; inset: auto 0 0 0; height: var(--photo-visible) }` с отступами вокруг картины, `.lightbox__info { max-height: none; overflow: visible }`; убрать правило `.lightbox.is-contact-open .lightbox__info` и прежний `padding-top: 3.75rem` блока (место под крестик — внутри рамки)
- Modify: `src/assets/js/photo-strip.js` — поведение страницы: ставит на `.lightbox__layout` переменные `--photo-start`, `--photo-strip` (из `photoSizes(layout.clientWidth, layout.clientHeight)`) и `--photo-visible` (из `visiblePhotoHeight(layout.scrollTop, …)`) на `scroll` (через `requestAnimationFrame`, один кадр — одно обновление) и `resize`; на `lightbox:open` и на щелчок по миниатюре (`.details__photos a`) — `layout.scrollTop = 0` и пересчёт; на ≥ 960 px ничего не делает (проверка `matchMedia("(max-width: 959px)")`)
- Modify: `src/assets/js/contact-form.js` — убрать добавление/снятие класса `is-contact-open`
- Modify: `src/index.njk` — `scripts`: `/assets/js/photo-strip.js` перед `/assets/js/gallery.js`

**Interfaces:**
- Consumes: `PhotoStrip.photoSizes`, `PhotoStrip.visiblePhotoHeight` (Task 1); событие `lightbox:open` (есть в `gallery.js`).

- [ ] **Step 1:** внести изменения разметки, стилей и скриптов.
- [ ] **Step 2:** `node --check` для трёх скриптов; `npm test` → зелёный (существующие сборочные и офлайн-тесты подтверждают, что окно и копия с диска собираются; `contact-form` тесты зелёные).

### Task 3: Проверка и копия для Валерии

- [ ] **Step 1:** браузер, 375 × 812: открыть «Белый шум» (одно фото, короткий текст) и «Утро у реки» (три фото); прокрутить вниз — фото уменьшается целиком до ~188 px высоты и стоит вверху, текст уходит под него; вверх — растёт обратно; отскок вверх не увеличивает фото; крестик виден всё время; щелчок по миниатюре внизу — окно наверху, фото большое; закрыть, прокрутив вниз, открыть другую картину — начинается сверху (Review Focus 4).
- [ ] **Step 2:** с временно включённой формой связи (как в проверке формы: временный `site.json`, подмена `fetch` в странице) — «Связаться с автором» прокручивает к форме, фото в полоске; запасной путь после ошибки виден целиком (Review Focus 5). Вернуть `site.json`.
- [ ] **Step 3:** 812 × 375 (горизонтально) — фото не выше экрана, не сворачивается (Review Focus 2); 1280 × 800 — окно как раньше.
- [ ] **Step 4:** `npm run offline-copy`, перепаковать архив для Валерии, открыть с диска картину — прокрутка и полоска работают.
- [ ] **Step 5:** `npm test` зелёный; `src/_data/site.json` — `"enabled": false`.
