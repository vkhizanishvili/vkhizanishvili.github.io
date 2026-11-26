// Чистые функции для работы с картинами. Используются шаблонами и тестами.
// Будущий магазин (корзина, оплата) должен опираться на эти же функции,
// чтобы правила цены и статусов были в одном месте.

const NBSP = " ";

/** Статусы картины: значение хранится в файле, подпись показывается на сайте. */
export const STATUSES = {
  available: "В наличии",
  reserved: "Забронирована",
  sold: "Продана",
  private: "В частной коллекции",
};

const DEFAULT_ORDER_MESSAGE = "Здравствуйте! Хочу купить картину «{title}»";

function normalizeStatus(status) {
  return Object.hasOwn(STATUSES, status) ? status : "available";
}

/** 45000 → «45 000 ₽» с неразрывными пробелами; пустое/некорректное → null. */
export function formatPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) return null;
  const grouped = String(number).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${grouped}${NBSP}₽`;
}

/** Что показать вместо/рядом с ценой: { price, note }. */
export function priceInfo(painting) {
  const status = normalizeStatus(painting.status);
  const price = formatPrice(painting.price);
  switch (status) {
    case "reserved":
      return { price, note: STATUSES.reserved };
    case "sold":
      return { price: null, note: STATUSES.sold };
    case "private":
      return { price: null, note: STATUSES.private };
    default:
      return price ? { price, note: null } : { price: null, note: "Цена по запросу" };
  }
}

function orderValue(painting) {
  const n = painting.order;
  if (n === null || n === undefined || n === "") return Number.POSITIVE_INFINITY;
  const value = Number(n);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function timeValue(painting) {
  const t = new Date(painting.date ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Сначала ручной порядок (меньше — выше, пустые в конце), затем новые сверху. */
export function sortPaintings(list) {
  return [...list].sort((a, b) => {
    const oa = orderValue(a);
    const ob = orderValue(b);
    if (oa !== ob) return oa < ob ? -1 : 1;
    return timeValue(b) - timeValue(a);
  });
}

/** Только опубликованные (не черновики). */
export function publishedPaintings(list) {
  return list.filter((p) => !p.draft);
}

/** Серии, в которых есть хотя бы одна картина, по порядку, затем по названию. */
export function seriesWithWorks(series, paintings) {
  const used = new Set(paintings.map((p) => p.series).filter(Boolean));
  return series
    .filter((s) => used.has(s.id))
    .sort((a, b) => {
      const oa = orderValue(a);
      const ob = orderValue(b);
      if (oa !== ob) return oa < ob ? -1 : 1;
      return String(a.title).localeCompare(String(b.title), "ru");
    });
}

function normalizeTelegram(value) {
  return String(value ?? "")
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
}

/** Ссылка «Заказать» в Telegram или null, если кнопка выключена / картина не продаётся. */
export function telegramOrderUrl(settings, painting) {
  const button = settings?.order_button;
  if (!button?.enabled) return null;
  if (normalizeStatus(painting.status) !== "available") return null;
  const username = normalizeTelegram(button.telegram);
  if (!username) return null;
  const template = button.message?.trim() || DEFAULT_ORDER_MESSAGE;
  const text = template.replaceAll("{title}", painting.title ?? "");
  return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
}

/** «холст, масло · 60 × 80 см · 2024» без пустых частей. */
export function metaLine(painting) {
  return [painting.technique, painting.size, painting.year]
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .join(" · ");
}

/** Превращает элемент коллекции Eleventy в простой объект картины. */
export function toPainting(item) {
  const d = item.data;
  return {
    id: item.fileSlug,
    title: d.title,
    image: d.image,
    photos: Array.isArray(d.photos) ? d.photos.filter(Boolean) : [],
    price: d.price,
    status: normalizeStatus(d.status),
    series: d.series,
    technique: d.technique,
    size: d.size,
    year: d.year,
    description: d.description,
    order: d.order,
    draft: Boolean(d.draft),
    date: item.date,
  };
}

/** Превращает элемент коллекции Eleventy в объект серии. */
export function toSeries(item) {
  const d = item.data;
  return { id: item.fileSlug, title: d.title, description: d.description, order: d.order };
}
