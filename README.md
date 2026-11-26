# Сайт художника

Две страницы — галерея картин с ценами и «Об авторе» с контактами — плюс админка для редактирования. Всё бесплатно: GitHub Pages, Eleventy, Sveltia CMS.

- **Как опубликовать и работать в админке:** [docs/instructions.md](docs/instructions.md)
- **Как включить форму «Связаться с автором»:** [docs/contact-form-setup.md](docs/contact-form-setup.md)
- **Задел под магазин:** [docs/future-shop.md](docs/future-shop.md)
- Дизайн и план: [docs/superpowers/](docs/superpowers/)

## Команды

| Команда | Что делает |
|---|---|
| `npm install` | установить зависимости (один раз) |
| `npm start` | сайт на `http://localhost:8080` с автообновлением |
| `npm test` | тесты: логика цен и статусов, сборка, согласованность админки |
| `npm run build` | собрать сайт в `_site/` |
| `npm run demo-images` | заново сгенерировать демо-картинки |
| `npm run offline-copy` | копия сайта в `offline/site/`, которая открывается двойным щелчком по `index.html` — показать сайт до публикации (форма связи там в режиме предпросмотра) |
| `npm run contact-function` | архив пересыльщика формы `offline/contact-function.zip` для загрузки в Яндекс Облако |

## Устройство

```
src/
  content/paintings/*.md   картины (одна картина — один файл)
  content/series/*.md      серии (фильтры галереи)
  _data/site.json          настройки сайта, кнопка «Заказать», форма связи
  _data/about.json         страница «Об авторе» и контакты
  _data/privacy.json       политика обработки персональных данных
  _lib/                    логика: цены, статусы, сортировка, контакты, форма связи
  _includes/               шаблоны (Nunjucks)
  index.njk, about.njk,
  privacy.njk              страницы
  admin/                   админка Sveltia CMS (config.yml — её настройки)
  assets/                  стили, скрипты галереи и формы связи, шрифт
  uploads/                 загруженные фото
cloud/contact/             пересыльщик формы для Yandex Cloud Functions
                           (письмо + сигнал в Telegram, секреты — в настройках функции)
tests/                     node:test
  fixtures/site/           образцовое содержимое для сборочных тестов
                           (тесты не зависят от того, что правят в админке)
.github/workflows/         сборка и публикация на GitHub Pages
```

Фото при сборке нарезаются в WebP (600/1200/2000 px) через `@11ty/eleventy-img`. Префикс пути для адреса `github.io/<репозиторий>/` подставляется автоматически.
