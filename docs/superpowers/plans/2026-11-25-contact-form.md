# Форма «Связаться с автором» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В окне картины — кнопка «Связаться с автором» и форма из трёх полей; сообщение уходит Валерии письмом и сигналом в Telegram через функцию в Яндекс Облаке, с повторами и запасным путём через почту посетителя.

**Architecture:** Статический сайт (Eleventy) рисует блок формы в окне картины, если форма включена в настройках; классический скрипт `contact-form.js` отправляет JSON на функцию Yandex Cloud Functions (`cloud/contact/`, CommonJS, без хранения), та шлёт письмо по SMTP и сигнал в Telegram. При неудаче — запасной путь `mailto:`. Страница `/privacy/` редактируется в админке.

**Tech Stack:** Eleventy 3, Nunjucks, ванильный JS (классические скрипты — копия с диска не грузит модули), Node ≥ 20, `node:test`, Yandex Cloud Functions (Node.js), nodemailer (только в функции), fflate (devDependency, архив функции).

**Spec:** `docs/superpowers/specs/2026-11-25-contact-form-design.md`

**Git:** проект пока не в git — вместо коммитов контрольная точка «`npm test` зелёный».

## Global Constraints

- Никаких секретов (токен бота, пароль почты) в репозитории и на страницах — только переменные окружения функции.
- В Telegram — без имени, контакта и текста: ровно `Новое сообщение о картине «<название>». Подробности на почте.`
- Лимиты: имя ≤ 100, контакт ≤ 100, сообщение ≤ 3000 символов; форма, отправленная быстрее 3000 мс после раскрытия, — бот.
- Повторы: 3 попытки, ожидание каждой ≤ 6000 мс, паузы 1000 и 2000 мс.
- Тексты (дословно): кнопка `Связаться с автором`; поля `Имя`, `Телефон или почта`, `Сообщение`; заготовка `Здравствуйте! Меня интересует картина «<название>».`; `Отправить` / `Отправляем…`; успех `Спасибо! <site.title> ответит вам по указанному контакту.`; сбой `Не получилось отправить. Отправьте это сообщение со своей почты:` + `Открыть почту` + `Скопировать текст`; согласие `Отправляя сообщение, вы соглашаетесь с ` + ссылка `обработкой персональных данных` на `/privacy/` + `.`; предпросмотр `Это предпросмотр — сообщение не отправлено`; тема письма `Сообщение с сайта: «<картина>»`; тема `mailto:` `Картина «<название>»`.
- Кнопка есть, только если `contact_form.enabled` и заполнены `endpoint` и `fallback_email`; иначе её нет и сборка пишет предупреждение. Без JS блока не видно.
- Адрес почты Валерии не встречается в HTML целиком (нет `user@domain`) — собирается скриптом только при сбое.
- Всё остальное на сайте (галерея, окно, копия с диска) работает как раньше; все существующие тесты остаются зелёными.

## Review Focus

1. Медленная сеть: ответ пришёл через 7 с — посетитель не должен видеть одновременно «Спасибо» и запасной путь; кнопка «Отправить» во время отправки не нажимается (защита от двойного тапа). → тест `sendWithRetry` на тайм-аут + ручная проверка (Task 9).
2. Посетитель закрыл окно во время отправки и открыл другую картину — ответ старой отправки не должен менять форму новой картины. → в Task 6: токен открытия; ручная проверка (Task 9, Step 2).
3. Функция вернула не JSON (страница ошибки Яндекса при сбое) или JSON без `ok: true` — это неудача, а не успех. → тест `attemptSend` (Task 6).
4. Кавычки «», переносы строк и эмодзи в названии и тексте — `mailto:` и тема письма не ломаются. → тесты `buildMailto` (Task 6) и `emailMessage` (Task 1).
5. На компьютере без почтовой программы «Открыть почту» ничего не делает — должны оставаться видимый адрес и «Скопировать текст». → ручная проверка (Task 9).

---

### Task 1: Чистая логика функции

**Files:**
- Create: `cloud/contact/package.json` (`"type": "commonjs"`, `"main": "index.js"`, dependency `nodemailer`)
- Create: `cloud/contact/message.js`
- Test: `tests/contact-function.test.js`

**Interfaces:**
- Produces (CommonJS `module.exports`):
  - `LIMITS = { name: 100, contact: 100, message: 3000 }`, `MIN_FILL_MS = 3000`
  - `parseSubmission(body: object) -> { ok: true, data: { name, contact, message, painting, link } } | { ok: false, reason: "bot" | "invalid" }` — поля обрезаются по краям; `website` непуст → `bot`; `elapsed < MIN_FILL_MS` или не число → `bot`; пустые `name`/`contact` или превышение лимита → `invalid`; `painting`/`link` — строки ≤ 200, необязательны.
  - `emailMessage(data, { from: string, to: string }) -> { from, to, subject, text, replyTo? }` — `replyTo` = контакт, только если он похож на почту.
  - `telegramText(data) -> string`
  - `corsHeaders(origin: string | undefined, allowed: string[]) -> object` — `Access-Control-Allow-Origin` = origin, если он в списке, иначе заголовка нет; плюс `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Vary: Origin`.

- [ ] **Step 1: Write the failing tests** (импорт через `createRequire`)
  - `parseSubmission accepts a filled form and trims it` — `{ name: " Анна ", contact: "anna@mail.ru", message: "Привет", painting: "Утро у реки", link: "https://x/#w-utro", website: "", elapsed: 5000 }` → `ok`, `data.name === "Анна"`.
  - `parseSubmission flags bots` — `website: "x"` → `bot`; `elapsed: 1200` → `bot`; без `elapsed` → `bot`.
  - `parseSubmission rejects missing or too long fields` — `name: "  "` → `invalid`; `contact: ""` → `invalid`; `message: "a".repeat(3001)` → `invalid`; `name: "a".repeat(101)` → `invalid`; пустое сообщение — `ok`.
  - `emailMessage builds subject and reply-to` — подставляет `subject === "Сообщение с сайта: «Утро у реки»"`, текст содержит имя, контакт, сообщение и ссылку; `replyTo === "anna@mail.ru"`; при контакте `+7 900 123-45-67` поля `replyTo` нет; без `painting` → `subject === "Сообщение с сайта"`.
  - `telegramText carries no personal data` — `=== "Новое сообщение о картине «Утро у реки». Подробности на почте."` и не содержит имени, контакта, текста сообщения.
  - `corsHeaders allows only listed origins` — разрешённый → заголовок равен origin; чужой → заголовка нет.
- [ ] **Step 2:** `node --test tests/contact-function.test.js` → FAIL (нет модуля).
- [ ] **Step 3:** реализовать `cloud/contact/message.js` по интерфейсу.
- [ ] **Step 4:** тот же запуск → PASS; `npm test` зелёный.

### Task 2: Обработчик функции и архив для загрузки

**Files:**
- Create: `cloud/contact/index.js`
- Create: `scripts/contact-function-zip.mjs`; Modify: `package.json` (script `"contact-function": "node scripts/contact-function-zip.mjs"`, devDependency `fflate`)
- Test: `tests/contact-function.test.js` (дополнить)

**Interfaces:**
- Consumes: всё из Task 1.
- Produces:
  - `createHandler({ env, sendMail(msg) -> Promise, sendTelegram(text) -> Promise }) -> async (event) -> { statusCode, headers, body }`
  - `handler` (экспорт для Яндекса) = `createHandler` с настоящими `sendMail` (nodemailer, `smtp.yandex.ru:465`, `secure: true`, `require("nodemailer")` внутри функции) и `sendTelegram` (`fetch` на `https://api.telegram.org/bot<TOKEN>/sendMessage`).
  - Переменные окружения: `ALLOWED_ORIGINS` (через запятую), `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_TO` (по умолчанию `MAIL_USER`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (без них сигнал просто не шлётся).
  - Ответы: `OPTIONS` → 204; не `POST` → 405; origin не из списка → 403; тело не JSON → 400 `{ok:false,error:"invalid"}`; `bot` → 200 `{ok:true}` без отправок; `invalid` → 400; письмо ушло → 200 `{ok:true, telegram:boolean}`; письмо не ушло → 502 `{ok:false,error:"mail"}`. Письмо и сигнал запускаются вместе (`Promise.allSettled`). Тело события может быть base64 (`event.isBase64Encoded`), заголовки — в любом регистре. Во всех ответах — `corsHeaders`.
  - `scripts/contact-function-zip.mjs` экспортирует `makeContactFunctionZip(outFile = "offline/contact-function.zip") -> Promise<string>` (путь к архиву; в архиве в корне `index.js`, `message.js`, `package.json`); при прямом запуске (`npm run contact-function`) вызывает её и печатает путь.

- [ ] **Step 1: Write the failing tests** (поддельные `sendMail`/`sendTelegram` записывают вызовы)
  - `handler answers CORS preflight` — `OPTIONS` с разрешённым origin → 204, заголовок origin.
  - `handler refuses other origins and methods` — чужой origin → 403; `GET` → 405.
  - `handler drops bots silently` — `website: "x"` → 200 `{ok:true}`, ни одного вызова отправки.
  - `handler rejects invalid forms and bad JSON` — пустое имя → 400; тело `"не json"` → 400.
  - `handler sends mail and telegram` — 200 `{ok:true, telegram:true}`; `sendMail` получил `subject "Сообщение с сайта: «Утро у реки»"`, `sendTelegram` — текст без имени.
  - `telegram failure does not block mail` — `sendTelegram` бросает → 200 `{ok:true, telegram:false}`.
  - `mail failure reports an error even if telegram worked` — `sendMail` бросает → 502 `{ok:false,error:"mail"}`, `sendTelegram` вызван.
  - `handler reads base64 bodies` — то же тело в base64 с `isBase64Encoded: true` → 200.
  - `the function archive holds the three files` — `makeContactFunctionZip(<временный путь в .cache>)`, архив распаковывается `fflate.unzipSync` и содержит ровно `index.js`, `message.js`, `package.json`.
- [ ] **Step 2:** `node --test tests/contact-function.test.js` → новые FAIL.
- [ ] **Step 3:** реализовать `cloud/contact/index.js` и скрипт архива.
- [ ] **Step 4:** → PASS; `npm test` зелёный.

### Task 3: Настройки формы и решение «показывать ли кнопку»

**Files:**
- Create: `src/_lib/contact-form.js`; Modify: `eleventy.config.js` (фильтр `contactForm`)
- Modify: `src/_data/site.json` (`"contact_form": { "enabled": false, "endpoint": "", "fallback_email": "" }`), `tests/fixtures/site/site.json` (то же)
- Modify: `src/admin/config.yml` (в `site`: объект «Форма связи», `collapsed: true`, поля «Показывать кнопку „Связаться с автором“» boolean, «Адрес функции» string с подсказкой «Ссылка из Яндекс Облака, см. инструкцию», «Почта для запасного пути» string)
- Test: `tests/lib.test.js`, `tests/admin.test.js`

**Interfaces:**
- Produces: `contactFormConfig(site) -> { endpoint: string, mailUser: string, mailDomain: string } | null` — `null`, если выключено, нет `endpoint` (должен начинаться с `https://`) или почта без `@`; при `enabled` и неполных данных один раз пишет `console.warn("[contact] Форма связи включена, но не заполнены адрес функции или почта — кнопка скрыта")`. Фильтр Nunjucks `contactForm` = эта функция.

- [ ] **Step 1: Write the failing tests**
  - `contactFormConfig returns null unless enabled and complete` — выключено → `null`; включено без `endpoint` → `null`; `endpoint: "http://…"` → `null`; почта `"valeria"` → `null`.
  - `contactFormConfig splits the fallback address` — `{ enabled: true, endpoint: "https://functions.yandexcloud.net/abc", fallback_email: " v.art@yandex.ru " }` → `{ endpoint: "https://functions.yandexcloud.net/abc", mailUser: "v.art", mailDomain: "yandex.ru" }`.
  - В `admin.test.js`: `site settings expose the contact form` — в полях `site` есть объект `contact_form` с полями `enabled`, `endpoint`, `fallback_email` (существующий тест «every value is editable» тоже должен остаться зелёным).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** реализовать, добавить настройки и фильтр.
- [ ] **Step 4:** → PASS; `npm test` зелёный.

### Task 4: Страница политики

**Files:**
- Create: `src/privacy.njk` (layout `layouts/base.njk`, `permalink: /privacy/`, `title` из данных, текст через фильтр `markdown`)
- Create: `src/_data/privacy.json` `{ "heading": "Политика обработки персональных данных", "text": "<черновик>" }`; копия в `tests/fixtures/site/privacy.json` и подстановка в `tests/helpers/fixture-site.js` (как `about.json`)
- Modify: `src/admin/config.yml` (в `pages` новый файл `privacy`, `file: src/_data/privacy.json`, поля `heading` string, `text` richtext); `src/_includes/partials/footer.njk` (ссылка «Политика обработки персональных данных» на `/privacy/`, только если `site | contactForm`)
- Test: `tests/build.test.js`, `tests/admin.test.js`

**Interfaces:**
- Consumes: фильтр `contactForm` (Task 3).
- Черновик текста: разделы — кто оператор (`[ФИО Валерии]`, `[почта для обращений]`), какие данные (имя, телефон или почта, текст сообщения), зачем (ответить на обращение), где и как обрабатываются (в России: Яндекс Облако, Яндекс Почта; в Telegram персональные данные не передаются; на сайте не хранятся), срок (не дольше, чем нужно для ответа и переписки), права и как отозвать согласие; плашка в начале: «Черновик: заполните поля в квадратных скобках и покажите юристу». Квадратные скобки — для всего, что вписывает Валерия.

- [ ] **Step 1: Write the failing tests**
  - `privacy page is built from its settings` — `pages["/privacy/"]` содержит `<h1` с заголовком из фикстуры и отрисованный markdown фикстуры.
  - `footer links to the privacy page only when the contact form is on` — в обычной сборке ссылки `/privacy/` в подвале нет; со `site.contact_form = { enabled: true, endpoint: "https://functions.yandexcloud.net/abc", fallback_email: "v.art@yandex.ru" }` — есть на `/` и `/about/`.
  - В `admin.test.js`: `privacy page is editable` — в `pages` есть файл `privacy` с `file: src/_data/privacy.json`.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный.

### Task 5: Блок формы в окне картины (разметка и стили)

**Files:**
- Modify: `src/_includes/partials/lightbox.njk` — блок между `.lightbox__details` и `.lightbox__actions`
- Modify: `src/assets/css/style.css` — стили блока в стиле сайта (кнопка как `.btn-order`, но залитая `--accent`, на всю ширину на телефоне; поля с `--line`, `--radius`; подсказки `--sold`)
- Test: `tests/build.test.js`

**Interfaces:**
- Consumes: фильтр `contactForm` (Task 3); глобальная переменная `contactPreview` (Task 7, по умолчанию нет).
- Produces (разметка, на которую опирается Task 6), рисуется, если `site | contactForm` или `contactPreview`:
  - `<div class="contact" hidden data-endpoint="…" data-mail-user="…" data-mail-domain="…" [data-preview]>`
  - `<button type="button" class="btn-contact" data-action="contact">Связаться с автором</button>`
  - `<form class="contact__form" hidden novalidate>` с полями `name` (`maxlength="100"`, `autocomplete="name"`), `contact` (`maxlength="100"`), `message` (`<textarea maxlength="3000" rows="4">`), подсказки `<p class="contact__hint" data-for="name" hidden>Укажите имя</p>` и `data-for="contact"` `Укажите телефон или почту`, ловушка `<input name="website" class="contact__trap" tabindex="-1" autocomplete="off" aria-hidden="true">`, `<button type="submit" class="btn-contact">Отправить</button>`, строка согласия со ссылкой `/privacy/`
  - `<p class="contact__done" hidden>Спасибо! {{ site.title }} ответит вам по указанному контакту.</p>`
  - `<div class="contact__fallback" hidden>` с текстом сбоя, `<a class="contact__mail">Открыть почту</a>`, `<button type="button" class="contact__copy">Скопировать текст</button>`, `<p class="contact__address"></p>`
  - `<p class="contact__preview" hidden>Это предпросмотр — сообщение не отправлено</p>`

- [ ] **Step 1: Write the failing tests**
  - `contact form is absent while switched off` — в обычной сборке нет `class="contact"`.
  - `contact form is rendered when configured` — со включённой формой (значения из Task 4): есть `data-endpoint="https://functions.yandexcloud.net/abc"`, `data-mail-user="v.art"`, `data-mail-domain="yandex.ru"`, кнопка `Связаться с автором`, поля `name="name"`, `name="contact"`, `name="message"`, ловушка `name="website"`, ссылка `href="/privacy/"`, текст `Спасибо! Имя Фамилия ответит` (title фикстуры).
  - `the fallback address never appears whole` — в той же сборке нет `v.art@yandex.ru` ни на одной странице.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный.

### Task 6: Поведение формы (скрипт)

**Files:**
- Create: `src/assets/js/contact-form.js` (классический скрипт, IIFE)
- Modify: `src/index.njk` (`scripts`: добавить `/assets/js/contact-form.js` после `gallery.js`); `src/assets/js/gallery.js` (в `open(card)` после `showModal`: `dialog.dispatchEvent(new CustomEvent("lightbox:open", { detail: { id: card.dataset.id, title: card.dataset.title } }))`)
- Test: `tests/contact-form-script.test.js` (скрипт выполняется в `node:vm` с `window = globalThis` и `document`, у которого `getElementById` возвращает `null`)

**Interfaces:**
- Consumes: разметка Task 5; событие `lightbox:open`.
- Produces: `window.ContactForm = { validate, buildMailto, attemptSend, sendWithRetry }` (в браузере тоже, для отладки):
  - `validate({ name, contact }) -> string[]` — имена пустых обязательных полей (`["name"]`, `["contact"]`, оба или `[]`).
  - `buildMailto({ user, domain, painting, name, contact, message, link }) -> string` — `mailto:user@domain?subject=…&body=…`, тема `Картина «<painting>»`, тело: сообщение, пустая строка, `Имя: …`, `Контакт: …`, `Картина: <link>`; всё через `encodeURIComponent`, переносы `%0D%0A`.
  - `attemptSend(fetchFn, endpoint, payload, timeoutMs) -> Promise<boolean>` — `POST`, `Content-Type: text/plain;charset=UTF-8`, тело `JSON.stringify(payload)`; `true` только при `response.ok` и JSON с `ok === true`; тайм-аут через `AbortController`; любые исключения → `false`.
  - `sendWithRetry(attempt: () => Promise<boolean>, { delays = [1000, 2000], sleep }) -> Promise<boolean>` — до `delays.length + 1` попыток.
- Поведение страницы: на `lightbox:open` — блок виден (`hidden` снят), форма свёрнута, прежние «Спасибо»/сбой спрятаны, заготовка сообщения для новой картины, имя/контакт из прошлого ввода; увеличивается токен открытия, ответы со старым токеном игнорируются. «Связаться с автором» → форма раскрыта, кнопка спрятана, `scrollIntoView` формы, фокус в «Имя», запомнить время раскрытия. Отправка: подсказки по `validate` → без ошибок кнопка `Отправляем…` и `disabled` → при `data-preview` сразу показать `.contact__preview` и вернуть кнопку → иначе `sendWithRetry(() => attemptSend(fetch, endpoint, { name, contact, message, painting, link: location.origin + location.pathname + "#w-" + id, website, elapsed }, 6000))` → успех: форма спрятана, `.contact__done` виден; неудача: `.contact__fallback` виден, `href` = `buildMailto`, адрес в `.contact__address`, копирование через `navigator.clipboard.writeText` (при ошибке — выделить текст в поле), форма с текстом остаётся.

- [ ] **Step 1: Write the failing tests**
  - `validate names empty required fields` — `{name:"", contact:"x"}` → `["name"]`; `{name:"А", contact:"  "}` → `["contact"]`; оба заполнены → `[]`.
  - `buildMailto encodes quotes, newlines and emoji` — для `painting: "Утро «у» реки"`, `message: "Строка 1\nСтрока 2 🌅"` результат начинается с `mailto:v.art@yandex.ru?subject=`, `decodeURIComponent` темы `=== "Картина «Утро «у» реки»"`, декодированное тело содержит `Имя: Анна` и `Строка 2 🌅`.
  - `attemptSend treats only ok JSON as success` — поддельный `fetch`: `{ok:true}` → `true`; статус 502 → `false`; ответ-HTML (`json()` бросает) → `false`; `{ok:false}` → `false`; `fetch` бросает → `false`.
  - `attemptSend gives up after the timeout` — `fetch`, не отвечающий, пока не сработает `signal`, с `timeoutMs: 50` → `false`.
  - `sendWithRetry retries with the planned pauses` — попытки `false,false,true` → `true`, `sleep` вызван с `1000`, затем `2000`; три `false` → `false`, ровно 3 попытки.
- [ ] **Step 2:** `node --test tests/contact-form-script.test.js` → FAIL.
- [ ] **Step 3:** реализовать скрипт и событие в `gallery.js`.
- [ ] **Step 4:** → PASS; `npm test` зелёный.

### Task 7: Режим предпросмотра в копии с диска

**Files:**
- Modify: `scripts/offline-copy.mjs` (в `config(cfg)`: `cfg.addGlobalData("contactPreview", true)`)
- Test: `tests/offline.test.js`

**Interfaces:**
- Consumes: условие Task 5 (`contactPreview` рисует блок с `data-preview`, даже если форма выключена; `data-endpoint` тогда пустой).

- [ ] **Step 1: Write the failing test** — `the copy shows the contact form in preview mode` — в `index.html` копии есть `class="contact"` с атрибутом `data-preview` и нет `data-endpoint="https`.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный.

### Task 8: Инструкция и документация

**Files:**
- Create: `docs/contact-form-setup.md`
- Modify: `README.md` (команда `npm run contact-function`, папка `cloud/contact/`, страница политики), `docs/instructions.md` (раздел «Форма „Связаться с автором“» со ссылкой на инструкцию)

- [ ] **Step 1:** написать инструкцию по шагам, без программирования: (1) Яндекс Почта и пароль приложения (раздел «Пароли приложений → Почта»); (2) Telegram-бот через @BotFather, `/start` боту, chat id через `https://api.telegram.org/bot<токен>/getUpdates`; (3) Яндекс Облако: регистрация, платёжный аккаунт, «Cloud Functions → Создать функцию», среда Node.js (самая новая из предложенных), загрузка `offline/contact-function.zip` (`npm run contact-function`), точка входа `index.handler`, переменные окружения из Task 2, «Публичная функция» — включить, скопировать ссылку вызова; (4) админка: «Настройки сайта → Форма связи» — включить, вставить ссылку и почту; (5) проверка: отправить себе сообщение с опубликованного сайта, убедиться в письме и сигнале; (6) юридическое: заполнить политику, показать юристу, уточнить уведомление Роскомнадзора. Отдельно: что делать, если письма не приходят (проверить пароль приложения, `MAIL_USER`, журнал функции в консоли).
- [ ] **Step 2:** проверить, что все пути и имена переменных в инструкции совпадают с кодом (Task 2, Task 3): `grep` по `ALLOWED_ORIGINS`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_TO`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `index.handler`.

### Task 9: Проверка целиком и копия для Валерии

- [ ] **Step 1:** `npm test` → все зелёные; `npm run build` без ошибок и без предупреждения `[contact]` (форма выключена — предупреждения нет).
- [ ] **Step 2:** временно (в рабочей папке, не в проекте) поднять локальный поддельный приёмник на `http://localhost:<порт>`, который отвечает `{ok:true}`, затем 502; локально включить форму на него (через временную копию `site.json` или переменную, не трогая настоящий `site.json` при завершении). В браузере (телефон 375 px и ноутбук 1280 px): раскрытие формы, фокус, подсказки по пустым полям, «Отправляем…» и блокировка повторного нажатия, «Спасибо», запасной путь при 502 (ссылка `mailto:` с темой и текстом, видимый адрес, «Скопировать текст»), закрытие окна во время отправки и открытие другой картины (Review Focus 2), смена картины → заготовка с новым названием, имя и контакт сохранены.
- [ ] **Step 3:** `npm run offline-copy`, перепаковать `offline/Сайт Валерии (просмотр).zip`, открыть с диска: форма раскрывается, «Отправить» показывает «Это предпросмотр — сообщение не отправлено».
- [ ] **Step 4:** вернуть локальные временные изменения, убедиться, что `src/_data/site.json` содержит `"enabled": false`; `npm test` зелёный.
