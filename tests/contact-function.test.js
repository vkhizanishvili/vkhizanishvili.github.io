// Функция-пересыльщик для Яндекс Облака (cloud/contact): проверка формы,
// тексты письма и сигнала в Telegram, ответы обработчика.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { tempDir } from "./helpers/fixture-site.js";

const require = createRequire(import.meta.url);
const { parseSubmission, emailMessage, telegramText, corsHeaders } = require("../cloud/contact/message.js");

const filled = () => ({
  name: " Анна ",
  contact: "anna@mail.ru",
  message: "Привет",
  painting: "Утро у реки",
  link: "https://x/#w-utro",
  website: "",
  elapsed: 5000,
});

test("parseSubmission accepts a filled form and trims it", () => {
  const result = parseSubmission(filled());
  assert.equal(result.ok, true);
  assert.equal(result.data.name, "Анна");
  assert.equal(result.data.contact, "anna@mail.ru");
  assert.equal(result.data.painting, "Утро у реки");
});

test("parseSubmission flags bots", () => {
  assert.deepEqual(parseSubmission({ ...filled(), website: "x" }), { ok: false, reason: "bot" });
  assert.deepEqual(parseSubmission({ ...filled(), elapsed: 1200 }), { ok: false, reason: "bot" });
  const { elapsed, ...noElapsed } = filled();
  assert.deepEqual(parseSubmission(noElapsed), { ok: false, reason: "bot" });
});

test("parseSubmission rejects missing or too long fields", () => {
  for (const patch of [{ name: "  " }, { contact: "" }, { message: "a".repeat(3001) }, { name: "a".repeat(101) }]) {
    assert.deepEqual(parseSubmission({ ...filled(), ...patch }), { ok: false, reason: "invalid" }, JSON.stringify(patch).slice(0, 40));
  }
  assert.equal(parseSubmission({ ...filled(), message: "" }).ok, true, "message is optional");
});

test("emailMessage builds subject and reply-to", () => {
  const { data } = parseSubmission(filled());
  const mail = emailMessage(data, { from: "v.art@yandex.ru", to: "v.art@yandex.ru" });
  assert.equal(mail.subject, "Сообщение с сайта: «Утро у реки»");
  assert.equal(mail.from, "v.art@yandex.ru");
  assert.equal(mail.to, "v.art@yandex.ru");
  for (const part of ["Анна", "anna@mail.ru", "Привет", "https://x/#w-utro"]) assert.ok(mail.text.includes(part), part);
  assert.equal(mail.replyTo, "anna@mail.ru");

  const phone = parseSubmission({ ...filled(), contact: "+7 900 123-45-67" }).data;
  assert.ok(!("replyTo" in emailMessage(phone, { from: "a@b.ru", to: "a@b.ru" })));

  const noTitle = parseSubmission({ ...filled(), painting: "" }).data;
  assert.equal(emailMessage(noTitle, { from: "a@b.ru", to: "a@b.ru" }).subject, "Сообщение с сайта");
});

test("telegramText carries no personal data", () => {
  const { data } = parseSubmission(filled());
  const text = telegramText(data);
  assert.equal(text, "Новое сообщение о картине «Утро у реки». Подробности на почте.");
  for (const secret of ["Анна", "anna@mail.ru", "Привет"]) assert.ok(!text.includes(secret), secret);
});

test("corsHeaders allows only listed origins", () => {
  const allowed = ["https://valeria.github.io", "http://localhost:8080"];
  assert.equal(corsHeaders("https://valeria.github.io", allowed)["Access-Control-Allow-Origin"], "https://valeria.github.io");
  const other = corsHeaders("https://evil.example", allowed);
  assert.ok(!("Access-Control-Allow-Origin" in other));
  assert.equal(other.Vary, "Origin");
});

// --- Обработчик -------------------------------------------------------------

const { createHandler } = require("../cloud/contact/index.js");
const SITE = "https://valeria.github.io";
const env = {
  ALLOWED_ORIGINS: `${SITE}, http://localhost:8080`,
  MAIL_USER: "v.art@yandex.ru",
  MAIL_PASSWORD: "app-password",
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_ID: "42",
};

function setup({ mailFails = false, telegramFails = false } = {}) {
  const calls = { mail: [], telegram: [] };
  const handler = createHandler({
    env,
    sendMail: async (msg) => {
      calls.mail.push(msg);
      if (mailFails) throw new Error("smtp down");
    },
    sendTelegram: async (text) => {
      calls.telegram.push(text);
      if (telegramFails) throw new Error("telegram down");
    },
  });
  return { handler, calls };
}

const post = (body, { origin = SITE, base64 = false } = {}) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    httpMethod: "POST",
    headers: { origin },
    body: base64 ? Buffer.from(raw, "utf8").toString("base64") : raw,
    isBase64Encoded: base64,
  };
};
const json = (res) => JSON.parse(res.body);

test("handler answers CORS preflight", async () => {
  const { handler } = setup();
  const res = await handler({ httpMethod: "OPTIONS", headers: { Origin: SITE } });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], SITE);
});

test("handler refuses other origins and methods", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(post(filled(), { origin: "https://evil.example" }))).statusCode, 403);
  assert.equal((await handler({ httpMethod: "GET", headers: { origin: SITE } })).statusCode, 405);
  assert.equal(calls.mail.length, 0);
});

test("handler drops bots silently", async () => {
  const { handler, calls } = setup();
  const res = await handler(post({ ...filled(), website: "x" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(res), { ok: true });
  assert.equal(calls.mail.length + calls.telegram.length, 0);
});

test("handler rejects invalid forms and bad JSON", async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(post({ ...filled(), name: "" }))).statusCode, 400);
  const bad = await handler(post("не json"));
  assert.equal(bad.statusCode, 400);
  assert.deepEqual(json(bad), { ok: false, error: "invalid" });
  assert.equal(calls.mail.length, 0);
});

test("handler sends mail and telegram", async () => {
  const { handler, calls } = setup();
  const res = await handler(post(filled()));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(res), { ok: true, telegram: true });
  assert.equal(res.headers["Access-Control-Allow-Origin"], SITE);
  assert.equal(calls.mail[0].subject, "Сообщение с сайта: «Утро у реки»");
  assert.equal(calls.mail[0].to, "v.art@yandex.ru", "MAIL_TO defaults to MAIL_USER");
  assert.ok(!calls.telegram[0].includes("Анна"));
});

test("telegram failure does not block mail", async () => {
  const { handler, calls } = setup({ telegramFails: true });
  const res = await handler(post(filled()));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(res), { ok: true, telegram: false });
  assert.equal(calls.mail.length, 1);
});

test("mail failure reports an error even if telegram worked", async () => {
  const { handler, calls } = setup({ mailFails: true });
  const res = await handler(post(filled()));
  assert.equal(res.statusCode, 502);
  assert.deepEqual(json(res), { ok: false, error: "mail" });
  assert.equal(calls.telegram.length, 1);
});

test("handler reads base64 bodies", async () => {
  const { handler, calls } = setup();
  const res = await handler(post(filled(), { base64: true }));
  assert.equal(res.statusCode, 200);
  assert.equal(calls.mail[0].text.includes("Анна"), true);
});

// --- Архив для загрузки в Яндекс Облако ------------------------------------

test("the function archive holds the three files", async () => {
  const { makeContactFunctionZip } = await import("../scripts/contact-function-zip.mjs");
  const dir = await tempDir("test-zip");
  try {
    const file = await makeContactFunctionZip(path.join(dir, "contact-function.zip"));
    const entries = unzipSync(new Uint8Array(await readFile(file)));
    assert.deepEqual(Object.keys(entries).sort(), ["index.js", "message.js", "package.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Исправления по итоговой проверке ---------------------------------------

test("handler does not wait long for a hanging Telegram", async () => {
  const calls = { mail: 0 };
  const handler = createHandler({
    env,
    telegramWaitMs: 50,
    sendMail: async () => {
      calls.mail++;
    },
    sendTelegram: () => new Promise(() => {}), // Telegram не отвечает
  });
  const res = await Promise.race([
    handler(post(filled())),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 1000)),
  ]);
  assert.ok(!res.timedOut, "handler must answer without waiting for Telegram");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json(res), { ok: true, telegram: false });
  assert.equal(calls.mail, 1);
});

test("allowed origins tolerate a trailing slash and capital letters", async () => {
  const handler = createHandler({
    env: { ...env, ALLOWED_ORIGINS: "https://Valeria.github.io/ , http://localhost:8080" },
    sendMail: async () => {},
    sendTelegram: async () => {},
  });
  const res = await handler(post(filled(), { origin: "https://valeria.github.io" }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://valeria.github.io");
});
