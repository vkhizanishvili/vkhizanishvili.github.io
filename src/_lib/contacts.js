// Контакты для страницы «Об авторе»: из того, что ввели в админке
// (ник, ссылка или номер в любом виде), делаем ссылки.

/** «@nick», «https://t.me/nick», «t.me/nick/» → «nick». */
export function handle(value, domain) {
  const escaped = domain.replace(/\./g, "\\.");
  return String(value ?? "")
    .trim()
    .replace(new RegExp(`^(https?://)?(www\\.)?${escaped}/`, "i"), "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

/** Номер для ссылок: только цифры, российское «8…» → «7…». */
function phoneDigits(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

const filled = (v) => String(v ?? "").trim() !== "";

/** Список заполненных контактов в фиксированном порядке: { label, text, href, metaNote }. */
export function contactsList(contacts) {
  const c = contacts ?? {};
  const list = [];
  const add = (label, text, href, metaNote = false) => list.push({ label, text, href, metaNote });

  if (filled(c.email)) add("Почта", c.email.trim(), `mailto:${c.email.trim()}`);
  if (filled(c.phone)) add("Телефон", c.phone.trim(), `tel:+${phoneDigits(c.phone)}`);
  if (filled(c.telegram)) {
    const nick = handle(c.telegram, "t.me");
    add("Telegram", `@${nick}`, `https://t.me/${nick}`);
  }
  if (filled(c.whatsapp)) add("WhatsApp", c.whatsapp.trim(), `https://wa.me/${phoneDigits(c.whatsapp)}`);
  if (filled(c.instagram)) {
    const nick = handle(c.instagram, "instagram.com");
    add("Instagram*", `@${nick}`, `https://instagram.com/${nick}`, true);
  }
  if (filled(c.vk)) {
    const nick = handle(c.vk, "vk.com");
    add("ВКонтакте", nick, `https://vk.com/${nick}`);
  }
  if (filled(c.city)) add("Город", c.city.trim(), null);
  return list;
}
