// Скрипт формы «Связаться с автором» (src/assets/js/contact-form.js).
// Это обычный скрипт для браузера, поэтому здесь он выполняется в песочнице
// node:vm без страницы: проверяются его чистые функции из window.ContactForm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadScript() {
  const context = {
    document: { getElementById: () => null, querySelector: () => null },
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(readFileSync("src/assets/js/contact-form.js", "utf8"), context);
  return context.ContactForm;
}

const CF = loadScript();
const list = (value) => Array.from(value); // массив из песочницы → обычный массив

test("validate names empty required fields", () => {
  assert.deepEqual(list(CF.validate({ name: "", contact: "x", message: "Привет" })), ["name"]);
  assert.deepEqual(list(CF.validate({ name: "А", contact: "  ", message: "Привет" })), ["contact"]);
  assert.deepEqual(list(CF.validate({ name: " ", contact: "", message: "Привет" })), ["name", "contact"]);
  assert.deepEqual(list(CF.validate({ name: "Анна", contact: "+7 900", message: "Привет" })), []);
});

test("validate requires a message", () => {
  assert.deepEqual(list(CF.validate({ name: "А", contact: "x", message: "  " })), ["message"]);
  assert.deepEqual(list(CF.validate({ name: "", contact: "", message: "" })), ["name", "contact", "message"]);
});

test("buildMailto encodes quotes, newlines and emoji", () => {
  const url = CF.buildMailto({
    user: "v.art",
    domain: "yandex.ru",
    painting: "Утро «у» реки",
    name: "Анна",
    contact: "anna@mail.ru",
    message: "Строка 1\nСтрока 2 🌅",
    link: "https://x/#w-utro",
  });
  assert.ok(url.startsWith("mailto:v.art@yandex.ru?subject="), url.slice(0, 40));
  assert.ok(url.includes("%0D%0A"), "line breaks are CRLF");
  const params = Object.fromEntries(
    url.split("?")[1].split("&").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, decodeURIComponent(value)];
    }),
  );
  assert.equal(params.subject, "Картина «Утро «у» реки»");
  for (const part of ["Строка 2 🌅", "Имя: Анна", "Контакт: anna@mail.ru", "Картина: https://x/#w-utro"]) {
    assert.ok(params.body.includes(part), part);
  }
});

const respond = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (typeof body === "string" ? JSON.parse(body) : body),
});

test("attemptSend treats only ok JSON as success", async () => {
  let request;
  const okFetch = async (url, options) => {
    request = { url, options };
    return respond(200, { ok: true })();
  };
  const payload = { name: "Анна", contact: "a@b.ru", message: "", painting: "Утро у реки", link: "x", website: "", elapsed: 5000 };
  assert.equal(await CF.attemptSend(okFetch, "https://f.example/abc", payload, 1000), true);
  assert.equal(request.url, "https://f.example/abc");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "text/plain;charset=UTF-8");
  assert.deepEqual(JSON.parse(request.options.body), payload);

  assert.equal(await CF.attemptSend(respond(502, { ok: false, error: "mail" }), "u", payload, 1000), false);
  assert.equal(await CF.attemptSend(respond(200, "<html>Сервис недоступен</html>"), "u", payload, 1000), false);
  assert.equal(await CF.attemptSend(respond(200, { ok: false }), "u", payload, 1000), false);
  const broken = async () => {
    throw new Error("network down");
  };
  assert.equal(await CF.attemptSend(broken, "u", payload, 1000), false);
});

test("attemptSend gives up after the timeout", async () => {
  const hanging = (url, options) =>
    new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
  const started = Date.now();
  assert.equal(await CF.attemptSend(hanging, "u", {}, 50), false);
  assert.ok(Date.now() - started < 1000, "did not wait much longer than the timeout");
});

test("sendWithRetry retries with the planned pauses", async () => {
  const run = async (answers) => {
    const pauses = [];
    let calls = 0;
    const result = await CF.sendWithRetry(async () => answers[calls++], { sleep: async (ms) => pauses.push(ms) });
    return { result, pauses, calls };
  };
  assert.deepEqual(await run([false, false, true]), { result: true, pauses: [1000, 2000], calls: 3 });
  assert.deepEqual(await run([false, false, false]), { result: false, pauses: [1000, 2000], calls: 3 });
  assert.deepEqual(await run([true]), { result: true, pauses: [], calls: 1 });
});

// --- Исправления по итоговой проверке ---------------------------------------

import { createRequire } from "node:module";
const { MIN_FILL_MS: FUNCTION_MIN_FILL_MS } = createRequire(import.meta.url)("../cloud/contact/message.js");

test("the form never sends sooner than the function's bot threshold", () => {
  // Имя и контакт сохраняются между картинами, текст заполнен — можно нажать «Отправить» сразу.
  // Функция молча отбрасывает отправленное быстрее порога, поэтому форма ждёт остаток сама.
  assert.ok(CF.MIN_FILL_MS > FUNCTION_MIN_FILL_MS, "browser waits a bit longer than the function's threshold");
  assert.equal(CF.waitBeforeSend(10_000, 10_500), CF.MIN_FILL_MS - 500);
  assert.equal(CF.waitBeforeSend(10_000, 10_000 + CF.MIN_FILL_MS), 0);
  assert.equal(CF.waitBeforeSend(10_000, 60_000), 0);
});

test("buildMailto survives a broken emoji half", () => {
  // Половинка эмодзи (например, после обрезки по maxlength) роняла encodeURIComponent
  const url = CF.buildMailto({ user: "v", domain: "y.ru", painting: "Утро", name: "Анна", contact: "a@b.ru", message: "текст \uD83C", link: "" });
  assert.ok(url.startsWith("mailto:v@y.ru?subject="));
  assert.ok(decodeURIComponent(url).includes("текст \uFFFD"), "broken half replaced, not thrown");
});
