// Пересыльщик формы «Связаться с автором» для Yandex Cloud Functions.
// Принимает сообщение с сайта, шлёт письмо Валерии и короткий сигнал в Telegram.
// Ничего не хранит. Секреты — только в переменных окружения функции:
//   ALLOWED_ORIGINS     адреса сайта через запятую (https://….github.io[, http://localhost:8080])
//   MAIL_USER           ящик Яндекс Почты, с которого (и на который) уходит письмо
//   MAIL_PASSWORD       пароль приложения для этого ящика
//   MAIL_TO             куда слать, если не на MAIL_USER (необязательно)
//   TELEGRAM_BOT_TOKEN  токен бота от @BotFather (необязательно)
//   TELEGRAM_CHAT_ID    id чата, куда бот шлёт сигнал (необязательно)
// Точка входа в Яндекс Облаке: index.handler
"use strict";

const { parseSubmission, emailMessage, telegramText, corsHeaders } = require("./message.js");

function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

// «https://Login.github.io/» из адресной строки и «https://login.github.io» — один и тот же сайт
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "").toLowerCase();

/** Ждём не дольше ms; таймер снимаем, чтобы он не держал процесс. */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Обработчик с подставляемыми способами отправки (для тестов).
 * telegramWaitMs — сколько ждать Telegram: письмо главнее, а браузер ждёт ответа 6 с.
 */
function createHandler({ env, sendMail, sendTelegram, telegramWaitMs = 2000 }) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  return async function handle(event) {
    const origin = header(event.headers, "origin");
    const originAllowed = Boolean(origin) && allowed.includes(normalizeOrigin(origin));
    const cors = corsHeaders(origin, originAllowed ? [origin] : []);
    const reply = (statusCode, body) => ({
      statusCode,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
      body: body === undefined ? "" : JSON.stringify(body),
    });

    const method = String(event.httpMethod || "").toUpperCase();
    if (method === "OPTIONS") return reply(204);
    if (method !== "POST") return reply(405, { ok: false, error: "method" });
    if (!originAllowed) return reply(403, { ok: false, error: "origin" });

    let body;
    try {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
      body = JSON.parse(raw);
    } catch {
      return reply(400, { ok: false, error: "invalid" });
    }

    const parsed = parseSubmission(body);
    if (!parsed.ok && parsed.reason === "bot") return reply(200, { ok: true });
    if (!parsed.ok) return reply(400, { ok: false, error: "invalid" });

    const mail = emailMessage(parsed.data, { from: env.MAIL_USER, to: env.MAIL_TO || env.MAIL_USER });
    const wantTelegram = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
    const [mailResult, telegramResult] = await Promise.allSettled([
      sendMail(mail),
      wantTelegram
        ? withTimeout(sendTelegram(telegramText(parsed.data)), telegramWaitMs, `не ответил за ${telegramWaitMs} мс`)
        : Promise.reject(new Error("telegram not configured")),
    ]);

    if (wantTelegram && telegramResult.status === "rejected") {
      console.error("[contact] Telegram:", telegramResult.reason?.message || telegramResult.reason);
    }
    if (mailResult.status === "rejected") {
      console.error("[contact] Почта:", mailResult.reason?.message || mailResult.reason);
      return reply(502, { ok: false, error: "mail" });
    }
    return reply(200, { ok: true, telegram: telegramResult.status === "fulfilled" });
  };
}

function smtpSender(env) {
  let transport;
  return async (message) => {
    // nodemailer грузится только в облаке: тестам он не нужен
    transport ??= require("nodemailer").createTransport({
      host: "smtp.yandex.ru",
      port: 465,
      secure: true,
      auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });
    await transport.sendMail(message);
  };
}

function telegramSender(env) {
  return async (text) => {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`Telegram ответил ${res.status}`);
  };
}

let live;
async function handler(event) {
  live ??= createHandler({ env: process.env, sendMail: smtpSender(process.env), sendTelegram: telegramSender(process.env) });
  return live(event);
}

module.exports = { createHandler, handler };
