# Форма «Написать мне» на «Об авторе» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открытая форма обратной связи в конце страницы «Об авторе»; сообщение обязательно в обеих формах.

**Architecture:** Разметка формы выносится в общий фрагмент `partials/contact-form.njk` с режимом `popup` (кнопка + свёрнутая форма, как сейчас) или `inline` (форма сразу открыта, заголовок «Написать мне»). Скрипт `contact-form.js` поднимает каждый блок `.contact` на странице: блок в окне картины слушает `lightbox:open`, блок на странице — сам по себе, без картины. Пересыльщик в облаке не меняется.

**Tech Stack:** Nunjucks, ванильный JS (классический скрипт), CSS, `node:test` (+ `node:vm` для скрипта).

**Spec:** `docs/superpowers/specs/2026-11-26-about-contact-form-design.md`

**Git:** коммит после каждой задачи, публикация в Task 4.

## Global Constraints

- Блок виден только при включённой форме (`site | contactForm`) или в копии с диска (`contactPreview`, режим предпросмотра); без JS не виден.
- Сообщение обязательно; подсказка под пустым полем — «Напишите сообщение».
- Тексты без изменений, кроме заголовка «Написать мне» на «Об авторе».
- Адрес почты не встречается в HTML целиком; ссылка на политику — `/privacy/`.
- Окно картины ведёт себя как раньше (все существующие тесты зелёные).

## Review Focus

1. Две формы на одной странице не мешают друг другу (сейчас на «Об авторе» окна картины нет, но скрипт не должен на это полагаться). → тест на разметку + ручная проверка.
2. Посетитель отправил форму на «Об авторе», не касаясь полей (автозаполнение браузера), — защита по времени не должна молча выбросить сообщение: форма выжидает минимум от загрузки страницы. → ручная проверка с подменой ответа.
3. Ссылка в письме для формы без картины — адрес страницы «Об авторе», без `#w-`. → тест в `Task 3`.
4. На тёмном оформлении форма на странице читается (поля, кнопка, подсказки). → ручная проверка.

---

### Task 1: Сообщение — обязательное поле

**Files:** Modify `src/assets/js/contact-form.js` (`validate`), `src/_includes/partials/lightbox.njk` (подсказка `data-for="message"`); Test `tests/contact-form-script.test.js`, `tests/build.test.js`.

- [ ] **Step 1: failing tests** — `validate requires a message`: `validate({ name: "А", contact: "x", message: "  " })` → `["message"]`; все три пусты → `["name","contact","message"]`. Сборка с включённой формой: есть `data-for="message"` и текст «Напишите сообщение». Существующий тест `validate names empty required fields` дополнить полем `message: "Привет"` там, где ожидается `[]`.
- [ ] **Step 2:** → FAIL. **Step 3:** `validate({ name, contact, message })` добавляет `"message"`; подсказка в разметке. **Step 4:** → PASS; `npm test` зелёный; коммит.

### Task 2: Общий фрагмент формы и блок на «Об авторе»

**Files:** Create `src/_includes/partials/contact-form.njk` (параметр `contactMode`: `"popup"` | `"inline"`); Modify `src/_includes/partials/lightbox.njk` (включает фрагмент с `popup`), `src/about.njk` (в конце `.about__text`: фрагмент с `inline` внутри `<section class="about__write">`), `src/assets/css/style.css` (отступ и заголовок блока); Test `tests/build.test.js`, `tests/offline.test.js`.

**Interfaces:** Produces: `<div class="contact" data-mode="popup|inline" …>`; в `inline`: заголовок `<h2>Написать мне</h2>`, нет кнопки `[data-action="contact"]`, у формы нет `hidden`.

- [ ] **Step 1: failing tests** — `about page has an open contact form when configured` (сборка с включённой формой: на `/about/` блок `data-mode="inline"`, «Написать мне», `name="message"`, `href="/privacy/"`, нет `data-action="contact"`, форма без `hidden`); `about page has no form while switched off`; в окне картины на `/` — `data-mode="popup"`, кнопка на месте; ни на одной странице нет `v.art@yandex.ru`; копия с диска: на `about/index.html` блок `inline` с `data-preview`.
- [ ] **Step 2:** → FAIL. **Step 3:** фрагмент + подключения + стили. **Step 4:** → PASS; `npm test` зелёный; коммит.

### Task 3: Скрипт для нескольких форм

**Files:** Modify `src/assets/js/contact-form.js` (вынести поведение в `setupContactForm(root)`; вызвать для каждого `.contact`; блок `popup` — как сейчас, по `lightbox:open`; блок `inline` — виден сразу, картины нет, `openedAt` — время загрузки страницы, ссылка — `location.origin + location.pathname`), `src/about.njk` (подключить `/assets/js/contact-form.js`); Test `tests/contact-form-script.test.js`.

**Interfaces:** Produces `ContactForm.pageLink(locationLike, paintingId?) -> string` — с картиной `…#w-<id>`, без — адрес страницы без `#`.

- [ ] **Step 1: failing tests** — `pageLink points to the painting or to the page`: `pageLink({ origin: "https://x", pathname: "/" }, "utro")` → `"https://x/#w-utro"`; `pageLink({ origin: "https://x", pathname: "/about/" })` → `"https://x/about/"`. `buildMailto without a painting` → тема `Сообщение с сайта`, в теле нет «Картина:» при пустой ссылке.
- [ ] **Step 2:** → FAIL. **Step 3:** реализовать. **Step 4:** → PASS; `npm test` зелёный; коммит.

### Task 4: Проверка и публикация

- [ ] **Step 1:** временно включить форму (как раньше: заглушка `https://…`, не коммитить), в браузере 375 и 1280 px: «Об авторе» — форма открыта, пустая отправка → три подсказки, успех (подмена `fetch`) → «Спасибо», ошибка → запасной путь; окно картины — без изменений, кроме подсказки к пустому сообщению; тёмное оформление — форма читается. Вернуть настройки.
- [ ] **Step 2:** `npm test` зелёный; `git pull --rebase`; `git push`; дождаться сайта.
