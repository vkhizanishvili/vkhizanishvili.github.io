# План реализации: сайт художника

Дизайн: `docs/superpowers/specs/2026-11-25-art-gallery-site-design.md` (согласован 2026-11-25).

Принцип: сначала тест, потом код (TDD) для всей логики, которую можно проверить без браузера. Каждая задача заканчивается зелёным `npm test`.

## Задача 1. Каркас

- `package.json` (Node ≥ 20, ESM), зависимости: `@11ty/eleventy@3`, `@11ty/eleventy-img@7`, `markdown-it`, `@fontsource-variable/onest`; dev: `js-yaml`.
- Скрипты: `start` (dev-сервер), `build`, `test` (`node --test`).
- `eleventy.config.js`: вход `src`, выход `_site`, HtmlBasePlugin (префикс пути для `github.io/<repo>/`), passthrough для `assets`, `admin`, шрифта.
- `.gitignore`.
- Проверка: `npm run build` собирает пустой сайт.

## Задача 2. Чистые функции `src/_lib/` (TDD)

Тесты `tests/lib.test.js` пишутся первыми:

- `formatPrice(45000)` → `45 000 ₽` (неразрывные пробелы).
- `priceLabel(painting)` по правилам статусов (дизайн, раздел 5).
- `sortPaintings` — `order` по возрастанию (пустые в конце), затем `date` по убыванию.
- `publishedPaintings` — без `draft: true`.
- `seriesWithWorks(series, paintings)` — только серии с опубликованными работами, по `order`.
- `telegramOrderUrl(settings, painting)` — `https://t.me/<ник>?text=<encoded>`, ник без `@` и без префикса `https://t.me/`; `null`, если кнопка выключена или ник пуст.
- `metaLine(painting)` — «техника · размер · год» без пустых частей.

## Задача 3. Демо-контент

- `scripts/generate-demo-images.mjs` — абстрактные «картины» через sharp (идёт в зависимостях eleventy-img) → `src/uploads/demo/*.webp`.
- 9 картин (`src/content/paintings/*.md`, одна черновик для теста), 3 серии, `site.json`, `about.json`.

## Задача 4. Шаблоны и сборка (TDD через `tests/build.test.js`)

Тесты собирают сайт через программный API Eleventy (`toJSON`) и проверяют:

- на главной столько `.card`, сколько опубликованных картин; черновика нет;
- карточки содержат `data-id/data-title/data-price/data-status`;
- фильтры — только серии с работами;
- кнопки «Заказать» нет при `enabled: false`; при включении (через переопределение данных в тесте) есть ссылка `t.me` с названием;
- «Об авторе» выводит заполненные контакты и не выводит пустые;
- `<picture>` с `srcset` для изображений; `sitemap.xml`, `robots.txt`.

Файлы: `src/_includes/layouts/base.njk`, `partials/header.njk`, `partials/footer.njk`, `partials/card.njk`, `src/index.njk`, `src/about.njk`, `src/sitemap.njk`, `src/robots.njk`, шорткод `picture` в `eleventy.config.js`.

## Задача 5. Стили и поведение

- `src/assets/css/style.css` — светлый минимализм, адаптивная сетка.
- `src/assets/js/gallery.js` — фильтр (с `#series-…` в адресе), лайтбокс `<dialog>` (миниатюры, стрелки, свайп, Esc, `#w-…`).
- `src/assets/js/shop/README.md` — задел.

## Задача 6. Админка (TDD через `tests/admin.test.js`)

- `src/admin/index.html` + `src/admin/config.yml` (Sveltia: GitHub-бэкенд, медиа `src/uploads`, WebP ≤ 2400 px, коллекции «Картины», «Серии», «Страницы и настройки»).
- Тесты: YAML парсится, папки существуют, все поля, которые читают шаблоны, объявлены в конфиге; варианты `status` совпадают с `src/_lib`.

## Задача 7. Публикация

- `.github/workflows/deploy.yml`: `npm ci` → `npm test` → сборка с `--pathprefix` из `actions/configure-pages` → `deploy-pages`.
- `README.md` и `docs/instructions.md`: публикация, создание токена, работа в админке.

## Задача 8. Проверка

- `npm test` и `npm run build` — без ошибок.
- Браузер: десктоп и мобильный вид, фильтр, лайтбокс, страница «Об авторе», загрузка `/admin/` (экран входа с «Sign In with Token»).
