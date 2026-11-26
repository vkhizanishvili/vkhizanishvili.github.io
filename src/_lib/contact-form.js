// Форма «Связаться с автором»: показывать ли кнопку и с какими данными.
// Кнопка есть, только если форма включена в админке и заполнены оба поля:
// адрес функции в Яндекс Облаке и почта для запасного пути.

let warned = false;

/**
 * Настройки сайта → { endpoint, mailUser, mailDomain } или null.
 * Почта отдаётся частями: целиком адрес на странице не появляется
 * (его собирает скрипт только при сбое отправки).
 */
export function contactFormConfig(site) {
  const form = site?.contact_form;
  if (!form?.enabled) return null;
  const endpoint = String(form.endpoint ?? "").trim();
  const email = String(form.fallback_email ?? "").trim();
  const at = email.lastIndexOf("@");
  if (!endpoint.startsWith("https://") || at < 1 || at === email.length - 1) {
    if (!warned) {
      console.warn("[contact] Форма связи включена, но не заполнены адрес функции или почта — кнопка скрыта");
      warned = true;
    }
    return null;
  }
  return { endpoint, mailUser: email.slice(0, at), mailDomain: email.slice(at + 1) };
}
