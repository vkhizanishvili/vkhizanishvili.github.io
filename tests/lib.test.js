import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUSES,
  formatPrice,
  priceInfo,
  sortPaintings,
  publishedPaintings,
  seriesWithWorks,
  telegramOrderUrl,
  metaLine,
  toPainting,
} from "../src/_lib/paintings.js";

const NBSP = " ";

test("formatPrice groups thousands with non-breaking spaces and adds ₽", () => {
  assert.equal(formatPrice(45000), `45${NBSP}000${NBSP}₽`);
  assert.equal(formatPrice(1250000), `1${NBSP}250${NBSP}000${NBSP}₽`);
  assert.equal(formatPrice(900), `900${NBSP}₽`);
  assert.equal(formatPrice("7500"), `7${NBSP}500${NBSP}₽`);
});

test("formatPrice returns null for empty or invalid values", () => {
  assert.equal(formatPrice(undefined), null);
  assert.equal(formatPrice(null), null);
  assert.equal(formatPrice(""), null);
  assert.equal(formatPrice("abc"), null);
  assert.equal(formatPrice(0), null);
});

test("STATUSES has the four agreed statuses", () => {
  assert.deepEqual(Object.keys(STATUSES), ["available", "reserved", "sold", "private"]);
});

test("priceInfo: available with price shows the price only", () => {
  assert.deepEqual(priceInfo({ status: "available", price: 45000 }), {
    price: `45${NBSP}000${NBSP}₽`,
    note: null,
  });
});

test("priceInfo: available without price says price on request", () => {
  assert.deepEqual(priceInfo({ status: "available" }), { price: null, note: "Цена по запросу" });
});

test("priceInfo: missing or unknown status is treated as available", () => {
  assert.deepEqual(priceInfo({ price: 1000 }), { price: `1${NBSP}000${NBSP}₽`, note: null });
  assert.deepEqual(priceInfo({ status: "weird", price: 1000 }), {
    price: `1${NBSP}000${NBSP}₽`,
    note: null,
  });
});

test("priceInfo: reserved shows price and a note", () => {
  assert.deepEqual(priceInfo({ status: "reserved", price: 30000 }), {
    price: `30${NBSP}000${NBSP}₽`,
    note: "Забронирована",
  });
});

test("priceInfo: sold and private hide the price", () => {
  assert.deepEqual(priceInfo({ status: "sold", price: 30000 }), { price: null, note: "Продана" });
  assert.deepEqual(priceInfo({ status: "private", price: 30000 }), {
    price: null,
    note: "В частной коллекции",
  });
});

test("sortPaintings: manual order first, empty order last, then newest first", () => {
  const list = [
    { id: "a", date: new Date("2024-01-01") },
    { id: "b", order: 2, date: new Date("2023-01-01") },
    { id: "c", date: new Date("2025-01-01") },
    { id: "d", order: 1, date: new Date("2022-01-01") },
    { id: "e", order: "", date: new Date("2026-01-01") },
  ];
  assert.deepEqual(
    sortPaintings(list).map((p) => p.id),
    ["d", "b", "e", "c", "a"],
  );
});

test("sortPaintings does not mutate the input", () => {
  const list = [{ id: "a", order: 2 }, { id: "b", order: 1 }];
  sortPaintings(list);
  assert.deepEqual(list.map((p) => p.id), ["a", "b"]);
});

test("publishedPaintings drops drafts", () => {
  const list = [{ id: "a" }, { id: "b", draft: true }, { id: "c", draft: false }];
  assert.deepEqual(publishedPaintings(list).map((p) => p.id), ["a", "c"]);
});

test("seriesWithWorks keeps only series that have paintings, sorted by order then title", () => {
  const series = [
    { id: "s1", title: "Вода", order: 2 },
    { id: "s2", title: "Город", order: 1 },
    { id: "s3", title: "Пустая", order: 0 },
    { id: "s4", title: "Абстракции" },
  ];
  const paintings = [{ series: "s1" }, { series: "s2" }, { series: "s4" }, { series: "s1" }, {}];
  assert.deepEqual(
    seriesWithWorks(series, paintings).map((s) => s.id),
    ["s2", "s1", "s4"],
  );
});

test("telegramOrderUrl builds a t.me link with the painting title", () => {
  const settings = {
    order_button: { enabled: true, telegram: "@artist_name", message: "Хочу картину «{title}»" },
  };
  const url = telegramOrderUrl(settings, { title: "Утро", status: "available" });
  assert.equal(url, `https://t.me/artist_name?text=${encodeURIComponent("Хочу картину «Утро»")}`);
});

test("telegramOrderUrl accepts full t.me links as the username", () => {
  for (const telegram of ["https://t.me/artist_name", "t.me/artist_name", " artist_name "]) {
    const url = telegramOrderUrl(
      { order_button: { enabled: true, telegram } },
      { title: "X", status: "available" },
    );
    assert.ok(url.startsWith("https://t.me/artist_name?text="), `${telegram} → ${url}`);
  }
});

test("telegramOrderUrl uses a default message when none is set", () => {
  const url = telegramOrderUrl(
    { order_button: { enabled: true, telegram: "a" } },
    { title: "Утро", status: "available" },
  );
  assert.equal(
    decodeURIComponent(url.split("?text=")[1]),
    "Здравствуйте! Хочу купить картину «Утро»",
  );
});

test("telegramOrderUrl returns null when disabled, no username, or not for sale", () => {
  const on = { order_button: { enabled: true, telegram: "a" } };
  assert.equal(telegramOrderUrl({ order_button: { enabled: false, telegram: "a" } }, { title: "X" }), null);
  assert.equal(telegramOrderUrl({ order_button: { enabled: true, telegram: "" } }, { title: "X" }), null);
  assert.equal(telegramOrderUrl({}, { title: "X" }), null);
  assert.equal(telegramOrderUrl(on, { title: "X", status: "sold" }), null);
  assert.equal(telegramOrderUrl(on, { title: "X", status: "reserved" }), null);
  assert.equal(telegramOrderUrl(on, { title: "X", status: "private" }), null);
  assert.ok(telegramOrderUrl(on, { title: "X" }));
});

test("metaLine joins technique, size and year, skipping empty parts", () => {
  assert.equal(
    metaLine({ technique: "холст, масло", size: "60 × 80 см", year: 2024 }),
    "холст, масло · 60 × 80 см · 2024",
  );
  assert.equal(metaLine({ size: "А3" }), "А3");
  assert.equal(metaLine({}), "");
});

test("toPainting picks painting fields from an Eleventy collection item", () => {
  const date = new Date("2025-03-01");
  const item = {
    fileSlug: "a1b2c3d4",
    date,
    data: {
      title: "Утро",
      image: "/uploads/a.webp",
      photos: ["/uploads/b.webp"],
      price: 1000,
      status: "sold",
      series: "s1",
      technique: "акварель",
      size: "А4",
      year: 2025,
      description: "Текст",
      order: 3,
      draft: false,
      site: { title: "should not leak" },
    },
  };
  assert.deepEqual(toPainting(item), {
    id: "a1b2c3d4",
    title: "Утро",
    image: "/uploads/a.webp",
    photos: ["/uploads/b.webp"],
    price: 1000,
    status: "sold",
    series: "s1",
    technique: "акварель",
    size: "А4",
    year: 2025,
    description: "Текст",
    order: 3,
    draft: false,
    date,
  });
});

test("toPainting fills safe defaults", () => {
  const p = toPainting({ fileSlug: "x", date: new Date(0), data: { title: "T", image: "/i.webp" } });
  assert.deepEqual(p.photos, []);
  assert.equal(p.status, "available");
  assert.equal(p.draft, false);
});

// --- Форма «Связаться с автором»: показывать ли кнопку ---------------------

import { contactFormConfig } from "../src/_lib/contact-form.js";

test("contactFormConfig returns null unless enabled and complete", () => {
  const full = { enabled: true, endpoint: "https://functions.yandexcloud.net/abc", fallback_email: "v.art@yandex.ru" };
  assert.equal(contactFormConfig({}), null);
  assert.equal(contactFormConfig({ contact_form: { ...full, enabled: false } }), null);
  assert.equal(contactFormConfig({ contact_form: { ...full, endpoint: "" } }), null);
  assert.equal(contactFormConfig({ contact_form: { ...full, endpoint: "http://functions.yandexcloud.net/abc" } }), null);
  assert.equal(contactFormConfig({ contact_form: { ...full, fallback_email: "valeria" } }), null);
});

test("contactFormConfig splits the fallback address", () => {
  const site = { contact_form: { enabled: true, endpoint: "https://functions.yandexcloud.net/abc", fallback_email: " v.art@yandex.ru " } };
  assert.deepEqual(contactFormConfig(site), {
    endpoint: "https://functions.yandexcloud.net/abc",
    mailUser: "v.art",
    mailDomain: "yandex.ru",
  });
});
