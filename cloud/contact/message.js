// Чистая логика пересыльщика: проверка формы и тексты уведомлений.
// Без зависимостей — тестируется отдельно от отправки.
"use strict";

const LIMITS = { name: 100, contact: 100, message: 3000 };
// Форма, отправленная быстрее, чем через 3 секунды после раскрытия, — бот
const MIN_FILL_MS = 3000;
const EXTRA_LIMIT = 200; // название картины и ссылка

const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Поля формы → данные письма, или причина отказа:
 * "bot" (ловушка, слишком быстро) или "invalid" (пусто, слишком длинно).
 */
function parseSubmission(body) {
  const b = body && typeof body === "object" ? body : {};
  if (text(b.website) !== "") return { ok: false, reason: "bot" };
  if (typeof b.elapsed !== "number" || !(b.elapsed >= MIN_FILL_MS)) return { ok: false, reason: "bot" };

  const data = {
    name: text(b.name),
    contact: text(b.contact),
    message: text(b.message),
    painting: text(b.painting),
    link: text(b.link),
  };
  if (!data.name || !data.contact) return { ok: false, reason: "invalid" };
  for (const field of Object.keys(LIMITS)) {
    if (data[field].length > LIMITS[field]) return { ok: false, reason: "invalid" };
  }
  if (data.painting.length > EXTRA_LIMIT || data.link.length > EXTRA_LIMIT) return { ok: false, reason: "invalid" };
  return { ok: true, data };
}

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Письмо Валерии: всё, что написал посетитель, и ссылка на картину. */
function emailMessage(data, { from, to }) {
  const subject = data.painting ? `Сообщение с сайта: «${data.painting}»` : "Сообщение с сайта";
  const lines = [
    `Имя: ${data.name}`,
    `Контакт: ${data.contact}`,
    data.painting ? `Картина: ${data.painting}` : null,
    data.link ? `Ссылка: ${data.link}` : null,
    "",
    data.message || "(без текста)",
  ].filter((line) => line !== null);
  const mail = { from, to, subject, text: lines.join("\n") };
  if (looksLikeEmail(data.contact)) mail.replyTo = data.contact;
  return mail;
}

/** Сигнал в Telegram — без имени, контакта и текста: серверы Telegram за границей. */
function telegramText(data) {
  return data.painting
    ? `Новое сообщение о картине «${data.painting}». Подробности на почте.`
    : "Новое сообщение с сайта. Подробности на почте.";
}

/** CORS: разрешаем только адреса из списка (сайт и, для проверки, localhost). */
function corsHeaders(origin, allowed) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

module.exports = { LIMITS, MIN_FILL_MS, parseSubmission, emailMessage, telegramText, corsHeaders };
